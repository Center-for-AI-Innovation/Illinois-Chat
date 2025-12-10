#!/bin/bash
# Run this script to initialize all databases after a fresh docker compose up.

set -e  # Exit on first error
set -o pipefail

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

# Create MinIO bucket using AWS CLI or curl
if command -v aws &> /dev/null; then
    # on AWS -- untested
    # aws s3 mb s3://"${S3_BUCKET_NAME}" --endpoint-url http://localhost:9000 || print_warning "Failed to create MinIO bucket (might already exist)"

    # on mac osx
    # brew update
    # brew install minio/mc
    mc alias set minio http://localhost:9000 "${AWS_ACCESS_KEY_ID}" "${AWS_SECRET_ACCESS_KEY}"
    mc mb --ignore-existing minio/${S3_BUCKET_NAME}
else
    print_warning "AWS CLI not found, skipping MinIO bucket creation"
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