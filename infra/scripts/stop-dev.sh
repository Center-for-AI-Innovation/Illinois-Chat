#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

# The Sim overlay is appended after argument parsing unless --no-sim is given.
# Loading it unconditionally would make even `down` interpolate the overlay's
# required variables, so a stack started with `start-dev.sh --no-sim` (whose
# .env never received them) could not be stopped.
COMPOSE=(docker compose --project-directory . -f infra/docker/docker-compose.dev.yaml)
REMOVE_VOLUMES=false
DEV_APPS_PID_FILE="${REPO_ROOT}/.illinois-chat-dev-apps.pid"
WITH_SIM=true

show_usage() {
	echo "Usage: $0 [--volumes] [--no-sim]"
	echo ""
	echo "Options:"
	echo "  --volumes   Also remove dev infrastructure volumes and local data"
	echo "  --no-sim    Stop only the dev infrastructure; Sim AI containers are"
	echo "              left untouched (Compose may warn that the shared network"
	echo "              is still in use — that is expected)"
	echo "  --help      Show this help message"
}

kill_process_tree() {
	local pid="$1"
	local signal="${2:-TERM}"
	local child
	if ! kill -0 "${pid}" 2>/dev/null; then
		return 0
	fi
	for child in $(pgrep -P "${pid}" 2>/dev/null || true); do
		kill_process_tree "${child}" "${signal}"
	done
	kill "-${signal}" "${pid}" 2>/dev/null || true
}

stop_dev_apps() {
	if [[ ! -f ${DEV_APPS_PID_FILE} ]]; then
		return 0
	fi

	echo "[INFO] Stopping backend, worker, and frontend started by start-dev.sh --apps..."
	local pid
	while IFS= read -r pid; do
		[[ -n ${pid} ]] || continue
		kill_process_tree "${pid}" TERM
	done <"${DEV_APPS_PID_FILE}"
	sleep 1
	while IFS= read -r pid; do
		[[ -n ${pid} ]] || continue
		kill_process_tree "${pid}" KILL
	done <"${DEV_APPS_PID_FILE}"
	rm -f "${DEV_APPS_PID_FILE}"
	echo "[SUCCESS] Dev apps stopped."
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

stop_dev_apps

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
	echo "[INFO] Stopping dev infrastructure and removing volumes..."
	"${COMPOSE[@]}" down -v ${DOWN_ARGS[@]+"${DOWN_ARGS[@]}"}
else
	echo "[INFO] Stopping dev infrastructure..."
	"${COMPOSE[@]}" down ${DOWN_ARGS[@]+"${DOWN_ARGS[@]}"}
fi

echo "[SUCCESS] Dev infrastructure stopped."
