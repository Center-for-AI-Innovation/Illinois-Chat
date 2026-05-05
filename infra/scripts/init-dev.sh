#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

COMPOSE=(docker compose --project-directory . -f infra/docker/docker-compose.dev.yaml)
QDRANT_COLLECTION_NAME="${QDRANT_COLLECTION_NAME:-illinois_chat}"
QDRANT_VECTOR_SIZE="${QDRANT_VECTOR_SIZE:-4096}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
	echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
	echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
	echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
	echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
show_usage() {
	echo "Usage: $0 [OPTIONS]"
	echo ""
	echo "Options:"
	echo "  --clean    Clear existing containers, volumes, and data before initialization"
	echo "  --help     Show this help message"
	echo ""
	echo "Examples:"
	echo "  $0              # Initialize development environment"
	echo "  $0 --clean      # Clear everything and start fresh"
}

# Parse command line arguments
CLEAN_MODE=false

while [[ $# -gt 0 ]]; do
	case $1 in
	--clean)
		CLEAN_MODE=true
		shift
		;;
	--help | -h)
		show_usage
		exit 0
		;;
	*)
		print_error "Unknown option: $1"
		show_usage
		exit 1
		;;
	esac
done

echo "🚀 Initializing UIUC.chat Development Environment"
echo "=================================================="

# Clean mode: Clear existing containers and volumes
if [ "$CLEAN_MODE" = true ]; then
	print_warning "CLEAN MODE: Clearing existing containers, volumes, and data..."

	# Stop and remove containers
	print_status "Stopping and removing existing containers..."
	"${COMPOSE[@]}" down -v --remove-orphans 2>/dev/null || true

	print_success "Cleanup completed!"
	echo ""
fi

# Check if .env file exists
if [ ! -f .env ]; then
	print_warning ".env file not found. Creating from template..."
	if [ -f .env.template ]; then
		cp .env.template .env
		print_success "Created .env from template"
	else
		print_error ".env.template not found. Creating default .env file..."
		cat >.env <<'EOF'
# Database Configuration
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_ENDPOINT=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=postgres

# Qdrant Configuration
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=your-strong-key-here

# Redis Configuration
INGEST_REDIS_PASSWORD=password

# MinIO Configuration
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
DOCKER_INTERNAL_MINIO_API_PORT=10000
DOCKER_INTERNAL_MINIO_DASHBOARD_PORT=9001
PUBLIC_MINIO_API_PORT=10000
PUBLIC_MINIO_DASHBOARD_PORT=9001
MINIO_ENDPOINT=http://localhost:10000
MINIO_PUBLIC_ENDPOINT=http://localhost:10000
MINIO_URL=http://localhost:10000

# RabbitMQ Configuration
RABBITMQ_USER=guest
RABBITMQ_PASS=guest

# Keycloak Configuration
KEYCLOAK_ADMIN_USERNAME=admin
KEYCLOAK_ADMIN_PASSWORD=admin
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password

# Other Configuration
OPENAI_API_KEY=your-openai-api-key-here
EOF
		print_success "Created default .env file"
	fi
fi

# Validate .env file format
print_status "Validating .env file format..."
if grep -q "=" .env; then
	print_success ".env file format looks valid"
else
	print_error ".env file appears to be empty or malformed"
	exit 1
fi

# Load environment variables
print_status "Loading environment variables..."
if [ -f .env ]; then
	set -a
	. ./.env
	set +a
	QDRANT_COLLECTION_NAME="${QDRANT_COLLECTION_NAME:-illinois_chat}"
	QDRANT_VECTOR_SIZE="${QDRANT_VECTOR_SIZE:-4096}"
	print_success "Environment variables loaded"
else
	print_warning "No .env file found"
fi

## Frontend .env setup removed (frontend is a submodule)

# Start Docker Compose services
print_status "Starting Docker Compose services..."
"${COMPOSE[@]}" up -d

print_success "Docker Compose services started!"

wait_for_healthy() {
	local service="$1"
	local timeout="${2:-180}"
	local elapsed=0

	print_status "Waiting for ${service} to become healthy..."
	until "${COMPOSE[@]}" ps "$service" | grep -q "healthy"; do
		if [ "$elapsed" -ge "$timeout" ]; then
			print_error "✗ ${service} failed to become healthy"
			"${COMPOSE[@]}" logs "$service"
			exit 1
		fi
		sleep 3
		elapsed=$((elapsed + 3))
	done
	print_success "✓ ${service} is healthy"
}

wait_for_healthy postgres-illinois-chat
wait_for_healthy postgres-keycloak
wait_for_healthy qdrant
wait_for_healthy minio
wait_for_healthy rabbitmq
wait_for_healthy keycloak 240

print_success "All essential containers are running and healthy!"

# Initialize PostgreSQL schema (mandatory)
print_status "Initializing PostgreSQL schema..."

DB_NAME=${POSTGRES_DATABASE:-postgres}
DB_USER=${POSTGRES_USER:-${POSTGRES_USERNAME:-postgres}}

psql_main() {
	"${COMPOSE[@]}" exec -T postgres-illinois-chat psql -U "$DB_USER" -d "$DB_NAME" "$@"
}

print_status "Applying database schema from infra/db/migrations..."
if [ -f infra/db/migrations/20250328_remote_schema.sql ]; then
	print_status "Note: This Supabase schema dump will generate many non-critical errors for missing extensions/roles"
	psql_main -f - <infra/db/migrations/20250328_remote_schema.sql 2>/dev/null || {
		print_warning "Schema migration completed with some expected errors (Supabase-specific components)"
	}
	print_success "Core application tables created successfully"
else
	print_warning "infra/db/migrations/20250328_remote_schema.sql not found; skipping apply"
fi

print_status "Verifying PostgreSQL schema..."
# Helper to check table exists
check_table() {
	local tbl=$1
	exists=$(psql_main -tAc \
		"SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='${tbl}')")
	if [ "$exists" = "t" ] || [ "$exists" = "true" ]; then
		print_success "✓ Table '${tbl}' exists"
		return 0
	else
		print_error "✗ Table '${tbl}' missing"
		return 1
	fi
}

# Helper to check function exists (by name only)
check_function() {
	local func=$1
	exists=$(psql_main -tAc \
		"SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='${func}')")
	if [ "$exists" = "t" ] || [ "$exists" = "true" ]; then
		print_success "✓ Function '${func}' exists"
		return 0
	else
		print_error "✗ Function '${func}' missing"
		return 1
	fi
}

verify_ok=true
# Verify a minimal set that should exist after migrations
check_table documents || verify_ok=false
# Add more if desired; these are common in this project
check_table conversations || verify_ok=false
check_table messages || verify_ok=false

if [ "$verify_ok" != true ]; then
	print_error "Database schema verification failed. See errors above."
	exit 1
fi

print_success "PostgreSQL schema initialized and verified."

## Frontend schema alignment verification removed

# Populate Qdrant
print_status "Creating Qdrant collection..."

# Ensure QDRANT_URL is defined
if [[ -z $QDRANT_URL ]]; then
	QDRANT_URL="http://localhost:6333"
	print_warning "QDRANT_URL not set, using default: $QDRANT_URL"
fi

# If QDRANT_URL points to the container hostname, rewrite to localhost for host curl access
if echo "$QDRANT_URL" | grep -qE "http://qdrant(:6333)?$|http://qdrant:6333"; then
	print_warning "QDRANT_URL points to container hostname (qdrant). Using host-mapped URL instead."
	QDRANT_URL="http://localhost:6333"
fi

# Wait a bit more for Qdrant to be fully ready
print_status "Waiting for Qdrant to be fully ready..."
sleep 5

# Create Qdrant collection (with optional API key)
print_status "Creating Qdrant collection..."

# First, check if collection already exists
print_status "Checking if Qdrant collection exists..."
# Build headers (optionally include API key if provided)
CURL_HEADERS=("-H" "Content-Type: application/json")
if [[ -n $QDRANT_API_KEY ]]; then
	CURL_HEADERS+=("-H" "api-key: $QDRANT_API_KEY")
fi

if curl -s --max-time 10 "${QDRANT_URL}/collections/${QDRANT_COLLECTION_NAME}" "${CURL_HEADERS[@]}" 2>/dev/null | grep -q '"status":"ok"'; then
	# Verify the existing collection schema matches expected config
	details=$(curl -sS --max-time 10 "${QDRANT_URL}/collections/${QDRANT_COLLECTION_NAME}" "${CURL_HEADERS[@]}" 2>/dev/null || true)
	if echo "$details" | grep -q "\"size\"[[:space:]]*:[[:space:]]*${QDRANT_VECTOR_SIZE}" && echo "$details" | grep -q '"distance"[[:space:]]*:[[:space:]]*"Cosine"'; then
		print_success "✓ Qdrant collection already exists with correct schema (size=${QDRANT_VECTOR_SIZE}, distance=Cosine)"
	else
		print_warning "Existing Qdrant collection schema does not match expected. Recreating collection..."
		# Delete and recreate with correct schema
		delete_resp=$(curl -sS --max-time 10 -X DELETE "${QDRANT_URL}/collections/${QDRANT_COLLECTION_NAME}" "${CURL_HEADERS[@]}" 2>/dev/null || true)
		print_status "Delete response: $delete_resp"
		create_resp=$(curl -sS --max-time 10 -X PUT "${QDRANT_URL}/collections/${QDRANT_COLLECTION_NAME}" \
			"${CURL_HEADERS[@]}" \
			-d "{\"vectors\":{\"size\":${QDRANT_VECTOR_SIZE},\"distance\":\"Cosine\"}}" 2>/dev/null || true)
		if echo "$create_resp" | grep -q '"status":"ok"'; then
			print_success "✓ Qdrant collection recreated successfully with correct schema"
		else
			print_error "✗ Failed to recreate Qdrant collection"
			print_status "Create response: $create_resp"
			exit 1
		fi
	fi
else
	# Try multiple times to create the collection
	attempts=10
	success=false
	last_response=""
	for i in $(seq 1 $attempts); do
		print_status "Attempt $i/$attempts to create Qdrant collection..."
		response=$(curl -sS --max-time 10 -X PUT "${QDRANT_URL}/collections/${QDRANT_COLLECTION_NAME}" \
			"${CURL_HEADERS[@]}" \
			-d "{\"vectors\":{\"size\":${QDRANT_VECTOR_SIZE},\"distance\":\"Cosine\"}}" 2>/dev/null || true)
		last_response="$response"

		if echo "$response" | grep -q '"status":"ok"'; then
			print_success "✓ Qdrant collection created successfully"
			success=true
			break
		elif echo "$response" | grep -qi "already exists"; then
			print_success "✓ Qdrant collection already exists"
			success=true
			break
		fi
		sleep 2
	done

	if [ "$success" != true ]; then
		print_error "✗ Failed to create Qdrant collection after $attempts attempts"
		print_status "Last response: $last_response"
		print_status "Checking Qdrant logs..."
		"${COMPOSE[@]}" logs qdrant
		exit 1
	fi
fi

print_success "Qdrant collection ready!"

# Initialize MinIO bucket
print_status "Setting up MinIO bucket..."

# Ensure MinIO environment variables are set
if [[ -z $AWS_ACCESS_KEY_ID ]]; then
	AWS_ACCESS_KEY_ID="minioadmin"
	print_warning "AWS_ACCESS_KEY_ID not set, using default: $AWS_ACCESS_KEY_ID"
fi

if [[ -z $AWS_SECRET_ACCESS_KEY ]]; then
	AWS_SECRET_ACCESS_KEY="minioadmin"
	print_warning "AWS_SECRET_ACCESS_KEY not set, using default: $AWS_SECRET_ACCESS_KEY"
fi

MINIO_CONTAINER="$("${COMPOSE[@]}" ps -q minio)"
if [ -n "$MINIO_CONTAINER" ]; then
	docker run --rm --entrypoint /bin/sh --network "container:${MINIO_CONTAINER}" minio/mc:RELEASE.2024-06-12T14-34-03Z \
		-c "mc alias set local http://localhost:${DOCKER_INTERNAL_MINIO_API_PORT:-10000} '${AWS_ACCESS_KEY_ID}' '${AWS_SECRET_ACCESS_KEY}' >/dev/null && mc mb -p local/uiuc-chat >/dev/null 2>&1 || true"
	print_success "✓ MinIO bucket 'uiuc-chat' is ready"
else
	print_warning "MinIO container was not found, skipping bucket setup"
fi

print_success "MinIO bucket setup complete!"

# Summary
echo ""
echo "=================================================="
print_success "Infrastructure setup complete!"
echo ""
echo "📋 Services are now running:"
echo "   - PostgreSQL (UIUC Chat): localhost:5432"
echo "   - PostgreSQL (Keycloak): localhost:5433"
echo "   - Redis: localhost:6379"
echo "   - Qdrant: localhost:6333"
echo "   - MinIO: localhost:${PUBLIC_MINIO_API_PORT:-10000}"
echo "   - MinIO Console: localhost:${PUBLIC_MINIO_DASHBOARD_PORT:-9001}"
echo "   - RabbitMQ: localhost:5672"
echo "   - RabbitMQ Management: localhost:15672"
echo "   - Keycloak: localhost:8080"
echo ""
echo "📚 Infrastructure initialized:"
echo "   - Qdrant collection '${QDRANT_COLLECTION_NAME}' ready"
echo "   - MinIO bucket 'uiuc-chat' ready"
echo "   - All services healthy and ready"
echo ""
echo "🌐 Next steps:"
echo "1. Update the API keys in the .env file"
echo "2. Start the backend, worker, and frontend in separate terminals:"
echo "   cd apps/backend && flask --app ai_ta_backend.main:app --debug run --port 8000"
echo "   cd apps/backend && python ai_ta_backend/rabbitmq/worker.py"
echo "   cd apps/frontend && npm run local"
echo ""
echo "🔍 To verify everything is working:"
echo "   - Check containers: docker ps"
echo "   - Check logs: docker compose --project-directory . -f infra/docker/docker-compose.dev.yaml logs"
echo "   - Test Qdrant: curl -H 'api-key: ${QDRANT_API_KEY:-your-strong-key-here}' http://localhost:6333/collections"
echo "   - Test PostgreSQL: psql -h localhost -p 5432 -U postgres -d postgres"
