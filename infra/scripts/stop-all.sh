#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

# The Sim overlay is appended after argument parsing unless --no-sim is given.
# Loading it unconditionally would make even `down` interpolate the overlay's
# required variables, so a stack started with `start-all.sh --no-sim` (whose
# .env never received them) could not be stopped.
COMPOSE=(docker compose --project-directory . -f infra/docker/docker-compose.yaml)
REMOVE_VOLUMES=false
WITH_SIM=true

show_usage() {
	echo "Usage: $0 [--volumes] [--no-sim]"
	echo ""
	echo "Options:"
	echo "  --volumes   Also remove full-stack containers, volumes, and local data"
	echo "  --no-sim    Stop only the full stack; Sim AI containers are left"
	echo "              untouched (Compose may warn that the shared network is"
	echo "              still in use — that is expected)"
	echo "  --help      Show this help message"
}

for arg in "$@"; do
	case "$arg" in
	--volumes | -v) REMOVE_VOLUMES=true ;;
	--no-sim) WITH_SIM=false ;;
	--help | -h)
		show_usage
		exit 0
		;;
	*)
		show_usage
		exit 1
		;;
	esac
done

# `down --remove-orphans` would delete every container in the project that
# is not in the loaded files — exactly the Sim containers --no-sim promises
# to leave alone — so orphan removal only runs with the overlay loaded.
DOWN_ARGS=()
if [ "$WITH_SIM" = true ]; then
	COMPOSE+=(-f infra/docker/docker-compose.sim.yaml)
	DOWN_ARGS+=(--remove-orphans)
fi

# `${arr[@]+"${arr[@]}"}` expands an empty array safely under `set -u` on the
# bash 3.2 that macOS ships.
if [ "$REMOVE_VOLUMES" = true ]; then
	echo "[INFO] Stopping full Docker stack and removing volumes..."
	"${COMPOSE[@]}" down -v ${DOWN_ARGS[@]+"${DOWN_ARGS[@]}"}
else
	echo "[INFO] Stopping full Docker stack..."
	"${COMPOSE[@]}" down ${DOWN_ARGS[@]+"${DOWN_ARGS[@]}"}
fi

echo "[SUCCESS] Full Docker stack stopped."
