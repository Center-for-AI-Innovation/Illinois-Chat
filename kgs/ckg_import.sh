#!/bin/bash

# === CONFIGURATION ===
DUMP_FILE_PATH="ckg_latest_4.2.3.dump"  # Full path to your dump file
DUMP_DIR="$(pwd)"  # Use current directory
DUMP_FILE="$(basename "$DUMP_FILE_PATH")"
DOCKER_VOLUME="neo4j_clinicalkg"
NEO4J_IMAGE="neo4j:4.2"  # Updated to version with ARM64 support
DATABASE_NAME="neo4j"  # Change if you want a different database name
NEO4J_CONTAINER_NAME="neo4j"
NEO4J_LOADER_CONTAINER="neo4j-loader"

# === CREATE VOLUME IF NEEDED ===
docker volume inspect $DOCKER_VOLUME > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "Creating Docker volume: $DOCKER_VOLUME"
    docker volume create $DOCKER_VOLUME
else
    echo "Docker volume $DOCKER_VOLUME already exists."
fi

# === VERIFY DUMP FILE ===
if [ ! -f "$DUMP_FILE_PATH" ]; then
    echo "Error: Dump file not found at $DUMP_FILE_PATH"
    exit 1
fi

echo "Found dump file: $DUMP_FILE_PATH"
echo "Size: $(du -h "$DUMP_FILE_PATH" | cut -f1)"

# === LOAD DUMP INTO VOLUME ===
echo "Loading dump file into Neo4j volume..."
docker run --rm -it \
    --platform linux/amd64 \
    --name $NEO4J_LOADER_CONTAINER \
    -v $DOCKER_VOLUME:/data \
    -v "$DUMP_FILE_PATH":/dumps/$DUMP_FILE \
    $NEO4J_IMAGE \
    bash -c "bin/neo4j-admin load --from=/dumps/$DUMP_FILE --database=$DATABASE_NAME --force"

if [ $? -ne 0 ]; then
    echo "Error: Failed to load the dump file."
    exit 1
fi

echo "Database loaded successfully into volume: $DOCKER_VOLUME"

# === OPTIONAL: START NEO4J CONTAINER ===
read -p "Do you want to start a Neo4j container with this volume now? (y/n): " yn
if [[ "$yn" =~ ^[Yy]$ ]]; then
    docker run -d \
        --name $NEO4J_CONTAINER_NAME \
        -v $DOCKER_VOLUME:/data \
        -p 7474:7474 -p 7687:7687 \
        $NEO4J_IMAGE
    echo "Neo4j is running. Access it at http://localhost:7474"
else
    echo "You can start Neo4j later with:"
    echo "docker run -d --name $NEO4J_CONTAINER_NAME -v $DOCKER_VOLUME:/data -p 7474:7474 -p 7687:7687 $NEO4J_IMAGE"
fi