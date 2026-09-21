#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

COMPOSE=(docker compose --project-directory . -f infra/docker/docker-compose.dev.yaml)
REMOVE_VOLUMES=false
DEV_APPS_PID_FILE="${REPO_ROOT}/.illinois-chat-dev-apps.pid"

show_usage() {
	echo "Usage: $0 [--volumes]"
	echo ""
	echo "Options:"
	echo "  --volumes   Also remove dev infrastructure volumes and local data"
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

if [ "$REMOVE_VOLUMES" = true ]; then
	echo "[INFO] Stopping dev infrastructure and removing volumes..."
	"${COMPOSE[@]}" down -v --remove-orphans
else
	echo "[INFO] Stopping dev infrastructure..."
	"${COMPOSE[@]}" down --remove-orphans
fi

echo "[SUCCESS] Dev infrastructure stopped."
