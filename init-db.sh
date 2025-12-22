#!/bin/bash
# Run this script to initialize all databases after a fresh docker compose up.

set -e  # Exit on first error
set -o pipefail

print_warning() {
  echo "[WARN] $1" >&2
}

# Source the .env file to load the variables
source .env


# Export PostgreSQL environment variables so they're available to npm/Node.js processes
export POSTGRES_USERNAME
export POSTGRES_PASSWORD
export POSTGRES_ENDPOINT
export POSTGRES_PORT
export POSTGRES_DATABASE

# define variables
PROJECT_NAME="chat"
PROJECT_DESC="Default project created during setup."
PROJECT_EMAIL="admin@example.com"

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

# Populate Qdrant
echo "Creating Qdrant collection..."
# Ensure QDRANT_URL is defined
if [[ -z "$QDRANT_URL" ]]; then
  echo "Environment variable QDRANT_URL is not set. Aborting."
  exit 1
fi
curl -X PUT "${QDRANT_URL}/collections/${QDRANT_COLLECTION_NAME}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${QDRANT_API_KEY}" \
  -d '{
        "vectors": {
          "size": 4096,
          "distance": "Cosine"
        }
      }'

# Ensure MinIO environment variables are set
if [[ -z "$AWS_ACCESS_KEY_ID" ]]; then
    AWS_ACCESS_KEY_ID="minioadmin"
    print_warning "AWS_ACCESS_KEY_ID not set, using default: $AWS_ACCESS_KEY_ID"
fi

if [[ -z "$AWS_SECRET_ACCESS_KEY" ]]; then
    AWS_SECRET_ACCESS_KEY="minioadmin"
    print_warning "AWS_SECRET_ACCESS_KEY not set, using default: $AWS_SECRET_ACCESS_KEY"
fi

# Create MinIO bucket.
# Preferred: use `mc` if available on the host.
# Fallback: create bucket via boto3 inside the running `worker` container.
if command -v mc &> /dev/null; then
  mc alias set minio http://localhost:9000 "${AWS_ACCESS_KEY_ID}" "${AWS_SECRET_ACCESS_KEY}"
  mc mb --ignore-existing "minio/${S3_BUCKET_NAME}"
else
  print_warning "MinIO client (mc) not found; attempting bucket creation via docker compose worker container"
  if docker compose -f docker-compose.yaml ps --services --status running | grep -q '^worker$'; then
    docker compose -f docker-compose.yaml exec -T worker python - <<PY
import os
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

bucket = os.environ.get('S3_BUCKET_NAME', '${S3_BUCKET_NAME}')
client = boto3.client(
  's3',
  endpoint_url=os.environ.get('MINIO_URL', 'http://minio:9000'),
  aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID', '${AWS_ACCESS_KEY_ID}'),
  aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY', '${AWS_SECRET_ACCESS_KEY}'),
  config=Config(s3={'addressing_style': 'path'}),
)
try:
  client.create_bucket(Bucket=bucket)
  print('Created MinIO bucket:', bucket)
except ClientError as e:
  # Ignore if already exists; otherwise surface.
  err = (e.response or {}).get('Error', {})
  code = str(err.get('Code', ''))
  if code in {'BucketAlreadyExists', 'BucketAlreadyOwnedByYou'}:
    print('MinIO bucket already exists:', bucket)
  else:
    raise
PY
  else
    print_warning "worker container not running; cannot auto-create MinIO bucket. Install mc (brew install minio/stable/mc) or create bucket via MinIO UI."
  fi
fi

echo "MinIO bucket setup complete!"

# Create Default Global Project
# Backend port is currently not exposed for security reasons
#curl -sS -X POST "${RAILWAY_URL}/createProject" \
#  -H "Content-Type: application/json" \
#  -d "{
#        \"project_name\": \"$PROJECT_NAME\",
#        \"project_description\": \"$PROJECT_DESC\",
#        \"project_owner_email\": \"$PROJECT_EMAIL\",
#        \"allow_logged_in_users\": true
#      }" \
#  -w "\nHTTP_STATUS:%{http_code}\n"