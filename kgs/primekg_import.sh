#!/bin/bash

# Check if Neo4j container is running
CONTAINER_RUNNING=false
if docker-compose ps | grep -q "neo4j.*Up"; then
  echo "Neo4j container is running."
  CONTAINER_RUNNING=true
  
  # Check if the required files exist in the import directory
  echo "Checking for required files..."
  if ! docker-compose exec neo4j test -f /import/unique_nodes.csv; then
    echo "Error: /import/unique_nodes.csv does not exist in the Neo4j container"
    exit 1
  fi

  if ! docker-compose exec neo4j test -f /import/unique_edges.csv; then
    echo "Error: /import/unique_edges.csv does not exist in the Neo4j container"
    exit 1
  fi
  
  # Stop the container after checking files
  echo "Stopping Neo4j container..."
  docker-compose stop neo4j
else
  echo "Neo4j container is not running."
  
  # Start the container temporarily to check files
  echo "Starting Neo4j container temporarily to check files..."
  docker-compose up -d neo4j
  sleep 5  # Give container time to start
  
  # Check if the required files exist
  echo "Checking for required files..."
  if ! docker-compose exec neo4j test -f /import/unique_nodes.csv; then
    echo "Error: /import/unique_nodes.csv does not exist in the Neo4j container"
    docker-compose stop neo4j
    exit 1
  fi

  if ! docker-compose exec neo4j test -f /import/unique_edges.csv; then
    echo "Error: /import/unique_edges.csv does not exist in the Neo4j container"
    docker-compose stop neo4j
    exit 1
  fi
  
  # Stop the container after checking files
  echo "Stopping Neo4j container..."
  docker-compose stop neo4j
fi

# Remove the existing database (be careful with this!)
echo "Starting container to remove existing database..."
docker-compose up -d neo4j
sleep 3
echo "Removing existing database..."
docker-compose exec neo4j rm -rf /data/databases/neo4j
docker-compose stop neo4j

# Run the import command (neo4j-admin import requires the database to be stopped)
echo "Importing data..."
docker-compose run --rm neo4j neo4j-admin database import full \
  --nodes=/import/unique_nodes.csv \
  --relationships=/import/unique_edges.csv \
  --delimiter="," \
  --array-delimiter=";" \
  --id-type=STRING \
  --overwrite-destination=true \
  neo4j

# Start Neo4j again
echo "Starting Neo4j with imported data..."
docker-compose up -d neo4j
echo "Import completed successfully!" 