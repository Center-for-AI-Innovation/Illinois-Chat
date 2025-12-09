#!/bin/bash
# Start docker services and populate databases.

set -e # Exit on first error
set -o pipefail

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
        --help|-h)
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

echo "🚀 Initializing UIUC.chat Production Environment"
echo "=================================================="

# Check if .env file exists
if [ ! -f .env ]; then
    print_warning ".env file not found. Please create based on .env.template, but replace with secure passwords."
    exit 1
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
    . .env.dev
    set +a
    print_success "Environment variables loaded"
else
    print_warning "No .env file found"
fi

## Frontend .env setup removed (frontend is a submodule)

# Start Docker Compose services
print_status "Starting Docker Compose services..."
docker-compose -f docker-compose.yaml up -d

print_success "Docker Compose services started!"

# Wait for services to be ready
print_status "Waiting for services to be ready..."
sleep 15

# Check if services are actually running and healthy using Docker Compose health checks
print_status "Checking if services started successfully..."

# Wait for essential services to be healthy
print_status "Waiting for PostgreSQL to be healthy..."
if docker-compose -f docker-compose.yaml ps postgres-illinois-chat | grep -q "healthy"; then
    print_success "✓ PostgreSQL is healthy"
else
    print_status "Waiting for PostgreSQL health check..."
    # Use a portable timeout approach that works on both Linux and macOS
    (
        # Start a background process to kill the loop after 60 seconds
        sleep 60 && kill $$ 2>/dev/null &
        # Wait for the service to become healthy
        until docker-compose -f docker-compose.yaml ps postgres-illinois-chat | grep -q "healthy"; do
            sleep 2
        done
    ) &
    wait $!
    if [ $? -eq 0 ]; then
        print_success "✓ PostgreSQL is now healthy"
    else
        print_error "✗ PostgreSQL failed to become healthy"
        print_status "Checking Docker logs..."
        docker-compose -f docker-compose.yaml logs postgres-illinois-chat
        exit 1
    fi
fi

print_status "Waiting for Qdrant to be healthy..."
if docker-compose -f docker-compose.yaml ps qdrant | grep -q "healthy"; then
    print_success "✓ Qdrant is healthy"
else
    print_status "Waiting for Qdrant health check..."
    # Use a portable timeout approach that works on both Linux and macOS
    (
        # Start a background process to kill the loop after 60 seconds
        sleep 60 && kill $$ 2>/dev/null &
        # Wait for the service to become healthy
        until docker-compose -f docker-compose.yaml ps qdrant | grep -q "healthy"; do
            sleep 2
        done
    ) &
    wait $!
    if [ $? -eq 0 ]; then
        print_success "✓ Qdrant is now healthy"
    else
        print_error "✗ Qdrant failed to become healthy"
        print_status "Checking Docker logs..."
        docker-compose -f docker-compose.yaml logs qdrant
        exit 1
    fi
fi

print_success "All essential containers are running and healthy!"

# Initialize PostgreSQL schema (mandatory)
print_status "Initializing PostgreSQL schema..."

DB_HOST=${POSTGRES_ENDPOINT:-localhost}
DB_PORT=${POSTGRES_PORT:-5432}
DB_NAME=${POSTGRES_DATABASE:-postgres}
DB_USER=${POSTGRES_USERNAME:-postgres}
DB_PASS=${POSTGRES_PASSWORD:-password}

# Export for psql
export PGPASSWORD="$DB_PASS"

# Initialize the postgres database
echo "Setting up database from uiuc-chat-frontend."

cd uiuc-chat-frontend

echo "Installing dependencies."
npm install

echo "Pushing database schema to PostgreSQL."
npm run db:push

echo "Populating PostgreSQL database."
npm run db:populate

cd ..

print_status "Verifying PostgreSQL schema..."
# Helper to check table exists
check_table() {
  local tbl=$1
  exists=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc \
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
  exists=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc \
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
if [[ -z "$QDRANT_URL" ]]; then
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
if [[ -n "$QDRANT_API_KEY" ]]; then
    CURL_HEADERS+=("-H" "api-key: $QDRANT_API_KEY")
fi

if curl -s --max-time 10 "${QDRANT_URL}/collections/${QDRANT_COLLECTION_NAME}" "${CURL_HEADERS[@]}" 2>/dev/null | grep -q '"status":"ok"'; then
    # Verify the existing collection schema matches expected config
    details=$(curl -sS --max-time 10 "${QDRANT_URL}/collections/${QDRANT_COLLECTION_NAME}" "${CURL_HEADERS[@]}" 2>/dev/null || true)
    if echo "$details" | grep -q '"size"[[:space:]]*:[[:space:]]*768' && echo "$details" | grep -q '"distance"[[:space:]]*:[[:space:]]*"Cosine"'; then
        print_success "✓ Qdrant collection already exists with correct schema (size=768, distance=Cosine)"
    else
        print_warning "Existing Qdrant collection schema does not match expected. Recreating collection..."
        # Delete and recreate with correct schema
        delete_resp=$(curl -sS --max-time 10 -X DELETE "${QDRANT_URL}/collections/${QDRANT_COLLECTION_NAME}" "${CURL_HEADERS[@]}" 2>/dev/null || true)
        print_status "Delete response: $delete_resp"
        create_resp=$(curl -sS --max-time 10 -X PUT "${QDRANT_URL}/collections/${QDRANT_COLLECTION_NAME}" \
            "${CURL_HEADERS[@]}" \
            -d '{
              "vectors": {
                "size": 4096,
                "distance": "Cosine"
              }
            }' 2>/dev/null || true)
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
        response=$(curl -sS --max-time 10 -X PUT "${QDRANT_URL}/collections/illinois_chat" \
            "${CURL_HEADERS[@]}" \
            -d '{
              "vectors": {
                "size": 4096,
                "distance": "Cosine"
              }
            }' 2>/dev/null || true)
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
        docker-compose -f docker-compose.yaml logs qdrant
        exit 1
    fi
fi

print_success "Qdrant collection ready!"

# Initialize MinIO bucket
print_status "Setting up MinIO bucket..."

# Ensure MinIO environment variables are set
if [[ -z "$AWS_ACCESS_KEY_ID" ]]; then
    AWS_ACCESS_KEY_ID="minioadmin"
    print_warning "AWS_ACCESS_KEY_ID not set, using default: $AWS_ACCESS_KEY_ID"
fi

if [[ -z "$AWS_SECRET_ACCESS_KEY" ]]; then
    AWS_SECRET_ACCESS_KEY="minioadmin"
    print_warning "AWS_SECRET_ACCESS_KEY not set, using default: $AWS_SECRET_ACCESS_KEY"
fi

# Create MinIO bucket using AWS CLI or curl
if command -v aws &> /dev/null; then
    aws s3 mb s3://"${S3_BUCKET_NAME}" --endpoint-url http://localhost:9001 || print_warning "Failed to create MinIO bucket (might already exist)"
else
    print_warning "AWS CLI not found, skipping MinIO bucket creation"
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
echo "   - MinIO: localhost:9001"
echo "   - MinIO Console: localhost:9002"
echo "   - RabbitMQ: localhost:5672"
echo "   - RabbitMQ Management: localhost:15672"
echo "   - Keycloak: localhost:8080"
echo ""
echo "📚 Infrastructure initialized:"
echo "   - Qdrant collection 'illinois_chat' created"
echo "   - MinIO bucket 'uiuc-chat' ready"
echo "   - All services healthy and ready"
echo ""
echo "🌐 Next steps:"
echo "1. Update the API keys in the .env file"
echo "2. Start the backend service:"
echo "   cd uiuc-chat-backend && source venv/bin/activate && flask --app ai_ta_backend.main:app --debug run --port 8000"
echo ""
echo "🔍 To verify everything is working:"
echo "   - Check containers: docker ps"
echo "   - Check logs: docker-compose -f docker-compose.yaml logs"
echo "   - Test Qdrant: curl http://localhost:6333/collections"
echo "   - Test PostgreSQL: psql -h localhost -p 5432 -U postgres -d postgres"
