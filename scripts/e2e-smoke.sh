#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/e2e-smoke.sh [--env-file <path>] [--config <path>] [--report <path>]

Runs:
  1) feliz e2e doctor
  2) feliz e2e smoke (with JSON report output)

Environment:
  LINEAR_API_KEY   Required when config uses $LINEAR_API_KEY
  GITHUB_TOKEN     Recommended for publish/auth checks
  E2E_CONFIG_PATH  Optional default for --config
  E2E_REPORT_PATH  Optional default for --report
EOF
}

ENV_FILE=""
CONFIG_PATH="${E2E_CONFIG_PATH:-/tmp/feliz-e2e/feliz.yml}"
REPORT_PATH="${E2E_REPORT_PATH:-/tmp/feliz-e2e-smoke-report.json}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      ENV_FILE="${2:-}"
      shift 2
      ;;
    --config)
      CONFIG_PATH="${2:-}"
      shift 2
      ;;
    --report)
      REPORT_PATH="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -n "${ENV_FILE}" ]]; then
  if [[ ! -f "${ENV_FILE}" ]]; then
    echo "Env file not found: ${ENV_FILE}" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

if [[ -z "${LINEAR_API_KEY:-}" ]]; then
  echo "LINEAR_API_KEY is not set." >&2
  echo "Set it in your shell or via --env-file scripts/e2e.env.example" >&2
  exit 1
fi

echo "[e2e] Running doctor against ${CONFIG_PATH}"
bun run src/cli/index.ts e2e doctor --config "${CONFIG_PATH}"

echo "[e2e] Running smoke checks"
bun run src/cli/index.ts e2e smoke --config "${CONFIG_PATH}" --json --out "${REPORT_PATH}"

echo "[e2e] Smoke report written to ${REPORT_PATH}"
