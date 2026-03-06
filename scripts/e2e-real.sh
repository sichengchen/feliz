#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/e2e-real.sh [options]

Automates real-environment E2E setup and smoke validation:
  1) Ensures GitHub repo exists (creates if missing)
  2) Clones/updates a sandbox repo and seeds minimal project files
  3) Writes Feliz config for E2E
  4) Runs scripts/e2e-smoke.sh
  5) Optionally starts Feliz daemon

Options:
  --env-file <path>         Source env values before execution
  --work-dir <path>         E2E root directory (default: /tmp/feliz-e2e)
  --config <path>           Feliz config output path
  --report <path>           Smoke report path
  --repo-owner <owner>      GitHub owner/org (default: E2E_GH_OWNER or gh user)
  --repo-name <name>        GitHub repo name (default: feliz-e2e-sandbox)
  --linear-project <name>   Linear project name (default: Feliz E2E Test)
  --agent <name>            Agent adapter (codex|claude-code; default: codex)
  --visibility <value>      Repo visibility (private|public; default: private)
  --skip-repo-create        Fail if repo missing instead of creating it
  --skip-seed               Skip sandbox repo file seeding/commit
  --skip-smoke              Skip scripts/e2e-smoke.sh execution
  --start                   Start Feliz daemon after setup
  --help, -h                Show help

Environment (can be placed in --env-file):
  LINEAR_OAUTH_TOKEN            Required
  GITHUB_TOKEN              Recommended
  E2E_GH_OWNER              Optional default for --repo-owner
  E2E_REPO_NAME             Optional default for --repo-name
  E2E_LINEAR_PROJECT        Optional default for --linear-project
  E2E_AGENT_ADAPTER         Optional default for --agent
  E2E_GH_VISIBILITY         Optional default for --visibility
  E2E_WORK_DIR              Optional default for --work-dir
  E2E_CONFIG_PATH           Optional default for --config
  E2E_REPORT_PATH           Optional default for --report
USAGE
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

ENV_FILE=""
WORK_DIR="${E2E_WORK_DIR:-/tmp/feliz-e2e}"
CONFIG_PATH="${E2E_CONFIG_PATH:-}"
REPORT_PATH="${E2E_REPORT_PATH:-}"
GH_OWNER="${E2E_GH_OWNER:-}"
REPO_NAME="${E2E_REPO_NAME:-feliz-e2e-sandbox}"
LINEAR_PROJECT="${E2E_LINEAR_PROJECT:-Feliz E2E Test}"
AGENT_ADAPTER="${E2E_AGENT_ADAPTER:-codex}"
REPO_VISIBILITY="${E2E_GH_VISIBILITY:-private}"
START_SERVER="false"
SKIP_REPO_CREATE="false"
SKIP_SEED="false"
SKIP_SMOKE="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      ENV_FILE="${2:-}"
      shift 2
      ;;
    --work-dir)
      WORK_DIR="${2:-}"
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
    --repo-owner)
      GH_OWNER="${2:-}"
      shift 2
      ;;
    --repo-name)
      REPO_NAME="${2:-}"
      shift 2
      ;;
    --linear-project)
      LINEAR_PROJECT="${2:-}"
      shift 2
      ;;
    --agent)
      AGENT_ADAPTER="${2:-}"
      shift 2
      ;;
    --visibility)
      REPO_VISIBILITY="${2:-}"
      shift 2
      ;;
    --skip-repo-create)
      SKIP_REPO_CREATE="true"
      shift
      ;;
    --skip-seed)
      SKIP_SEED="true"
      shift
      ;;
    --skip-smoke)
      SKIP_SMOKE="true"
      shift
      ;;
    --start)
      START_SERVER="true"
      shift
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

CONFIG_PATH="${CONFIG_PATH:-${WORK_DIR}/feliz.yml}"
REPORT_PATH="${REPORT_PATH:-${WORK_DIR}/e2e-smoke-report.json}"

for cmd in bun gh git sqlite3; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "Missing required command: ${cmd}" >&2
    exit 1
  fi
done

if [[ -z "${LINEAR_OAUTH_TOKEN:-}" ]]; then
  echo "LINEAR_OAUTH_TOKEN is not set." >&2
  echo "Set it in your shell or via --env-file." >&2
  exit 1
fi

if [[ "${AGENT_ADAPTER}" != "codex" && "${AGENT_ADAPTER}" != "claude-code" ]]; then
  echo "--agent must be one of: codex, claude-code" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Run: gh auth login" >&2
  exit 1
fi

if [[ -z "${GH_OWNER}" ]]; then
  GH_OWNER="$(gh api user -q .login 2>/dev/null || true)"
fi
if [[ -z "${GH_OWNER}" ]]; then
  echo "Could not resolve GitHub owner. Set E2E_GH_OWNER or pass --repo-owner." >&2
  exit 1
fi

REMOTE_SLUG="${GH_OWNER}/${REPO_NAME}"
REPO_URL="git@github.com:${REMOTE_SLUG}.git"
SANDBOX_DIR="${WORK_DIR}/sandbox/${REPO_NAME}"

mkdir -p "${WORK_DIR}" "${WORK_DIR}/sandbox"

if ! gh repo view "${REMOTE_SLUG}" >/dev/null 2>&1; then
  if [[ "${SKIP_REPO_CREATE}" == "true" ]]; then
    echo "Repo not found and --skip-repo-create specified: ${REMOTE_SLUG}" >&2
    exit 1
  fi
  echo "[e2e-real] Creating GitHub repo ${REMOTE_SLUG} (${REPO_VISIBILITY})"
  gh repo create "${REMOTE_SLUG}" "--${REPO_VISIBILITY}" --confirm >/dev/null
fi

if [[ ! -d "${SANDBOX_DIR}/.git" ]]; then
  echo "[e2e-real] Cloning sandbox repo ${REPO_URL}"
  git clone "${REPO_URL}" "${SANDBOX_DIR}" >/dev/null
fi

ensure_main_branch() {
  local repo_dir="$1"
  if git -C "${repo_dir}" rev-parse --verify HEAD >/dev/null 2>&1; then
    if git -C "${repo_dir}" show-ref --verify --quiet refs/heads/main; then
      git -C "${repo_dir}" checkout main >/dev/null 2>&1
    elif git -C "${repo_dir}" show-ref --verify --quiet refs/remotes/origin/main; then
      git -C "${repo_dir}" checkout -B main origin/main >/dev/null 2>&1
    else
      git -C "${repo_dir}" checkout -B main >/dev/null 2>&1
    fi
  else
    git -C "${repo_dir}" checkout --orphan main >/dev/null 2>&1 || git -C "${repo_dir}" switch --orphan main >/dev/null 2>&1
  fi
}

seed_sandbox_repo() {
  local repo_dir="$1"

  ensure_main_branch "${repo_dir}"

  mkdir -p "${repo_dir}/src" "${repo_dir}/test" "${repo_dir}/.feliz"

  if [[ ! -f "${repo_dir}/package.json" ]]; then
    cat > "${repo_dir}/package.json" <<'JSON'
{
  "name": "feliz-e2e-sandbox",
  "type": "module",
  "scripts": {
    "test": "bun test",
    "lint": "bunx --bun tsc --noEmit"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5"
  }
}
JSON
  fi

  if [[ ! -f "${repo_dir}/tsconfig.json" ]]; then
    cat > "${repo_dir}/tsconfig.json" <<'JSON'
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "Preserve",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "strict": true,
    "noEmit": true
  }
}
JSON
  fi

  if [[ ! -f "${repo_dir}/src/math.ts" ]]; then
    cat > "${repo_dir}/src/math.ts" <<'TS'
export const add = (a: number, b: number) => a + b;
TS
  fi

  if [[ ! -f "${repo_dir}/test/math.test.ts" ]]; then
    cat > "${repo_dir}/test/math.test.ts" <<'TS'
import { describe, expect, test } from "bun:test";
import { add } from "../src/math";

describe("add", () => {
  test("adds two numbers", () => {
    expect(add(1, 2)).toBe(3);
  });
});
TS
  fi

  if [[ ! -f "${repo_dir}/.feliz/config.yml" ]]; then
    cat > "${repo_dir}/.feliz/config.yml" <<EOF
agent:
  adapter: ${AGENT_ADAPTER}
  approval_policy: auto
  timeout_ms: 600000
  max_turns: 20

specs:
  enabled: true
  directory: specs
  approval_required: false

gates:
  test_command: bun test
  lint_command: bun run lint
EOF
  fi

  if [[ ! -f "${repo_dir}/.feliz/pipeline.yml" ]]; then
    cat > "${repo_dir}/.feliz/pipeline.yml" <<EOF
phases:
  - name: execute
    steps:
      - name: run
        agent: ${AGENT_ADAPTER}
        prompt: WORKFLOW.md
        success:
          command: "bun test && bun run lint"
      - name: create_pr
        prompt: .feliz/prompts/publish.md
EOF
  fi

  if [[ ! -f "${repo_dir}/WORKFLOW.md" ]]; then
    cat > "${repo_dir}/WORKFLOW.md" <<'MD'
# System Prompt

You are working on {{ project.name }}.

## Issue

**{{ issue.identifier }}**: {{ issue.title }}

{{ issue.description }}

## Instructions

- Follow repository conventions.
- Add or update tests for behavioral changes.
- Keep changes scoped to the issue.
MD
  fi

  (cd "${repo_dir}" && bun install >/dev/null)

  if [[ -n "$(git -C "${repo_dir}" status --porcelain)" ]]; then
    if ! git -C "${repo_dir}" config user.name >/dev/null; then
      git -C "${repo_dir}" config user.name "${GIT_AUTHOR_NAME:-Feliz E2E Bot}"
    fi
    if ! git -C "${repo_dir}" config user.email >/dev/null; then
      git -C "${repo_dir}" config user.email "${GIT_AUTHOR_EMAIL:-${GH_OWNER}@users.noreply.github.com}"
    fi

    git -C "${repo_dir}" add .
    git -C "${repo_dir}" commit -m "chore: initialize feliz e2e sandbox" >/dev/null
    git -C "${repo_dir}" push -u origin main >/dev/null
    echo "[e2e-real] Seeded sandbox repo and pushed main branch"
  else
    echo "[e2e-real] Sandbox repo already seeded"
  fi
}

check_linear_project() {
  local project_name="$1"
  (
    cd "${REPO_ROOT}"
    LINEAR_PROJECT_TO_CHECK="${project_name}" bun --eval '
import { LinearClient } from "./src/linear/client.ts";

const target = (process.env.LINEAR_PROJECT_TO_CHECK ?? "").trim();
const key = process.env.LINEAR_OAUTH_TOKEN ?? "";

if (!target) {
  console.error("Linear project name is empty.");
  process.exit(2);
}
if (!key) {
  console.error("LINEAR_OAUTH_TOKEN is not set.");
  process.exit(2);
}

const client = new LinearClient(key);
const projects = await client.fetchProjects();

const exact = projects.find((p) => p.name === target);
if (exact) process.exit(0);

const caseInsensitive = projects.find(
  (p) => p.name.toLowerCase() === target.toLowerCase()
);
if (caseInsensitive) {
  console.error(`Linear project exists as "${caseInsensitive.name}" (case mismatch).`);
  console.error("Use the exact project name with --linear-project.");
  process.exit(1);
}

console.error(`Linear project not found: ${target}`);
if (projects.length > 0) {
  const shown = projects.slice(0, 20).map((p) => p.name);
  console.error(`Available projects (first ${shown.length}):`);
  for (const name of shown) {
    console.error(`- ${name}`);
  }
}
console.error("Create it in Linear first or pass --linear-project <existing-name>.");
process.exit(1);
'
  )
}

if [[ "${SKIP_SEED}" != "true" ]]; then
  seed_sandbox_repo "${SANDBOX_DIR}"
else
  echo "[e2e-real] Skipping repo seed (--skip-seed)"
fi

echo "[e2e-real] Validating Linear project: ${LINEAR_PROJECT}"
check_linear_project "${LINEAR_PROJECT}"

mkdir -p "$(dirname "${CONFIG_PATH}")"
cat > "${CONFIG_PATH}" <<EOF
linear:
  oauth_token: \$LINEAR_OAUTH_TOKEN

tick:
  interval_ms: 5000

storage:
  data_dir: ${WORK_DIR}/data
  workspace_root: ${WORK_DIR}/workspaces

agent:
  default: ${AGENT_ADAPTER}
  max_concurrent: 2

projects:
  - name: ${REPO_NAME}
    repo: ${REPO_URL}
    linear_project: ${LINEAR_PROJECT}
    branch: main
EOF

echo "[e2e-real] Wrote config: ${CONFIG_PATH}"

if [[ "${SKIP_SMOKE}" != "true" ]]; then
  SMOKE_CMD=(bash "${REPO_ROOT}/scripts/e2e-smoke.sh")
  if [[ -n "${ENV_FILE}" ]]; then
    SMOKE_CMD+=(--env-file "${ENV_FILE}")
  fi
  SMOKE_CMD+=(--config "${CONFIG_PATH}" --report "${REPORT_PATH}")

  echo "[e2e-real] Running smoke checks"
  "${SMOKE_CMD[@]}"
else
  echo "[e2e-real] Skipping smoke checks (--skip-smoke)"
fi

if [[ "${START_SERVER}" == "true" ]]; then
  echo "[e2e-real] Starting Feliz daemon"
  (cd "${REPO_ROOT}" && bun run src/cli/index.ts start --config "${CONFIG_PATH}")
else
  echo "[e2e-real] Setup complete"
  echo "  Config: ${CONFIG_PATH}"
  echo "  Report: ${REPORT_PATH}"
  echo "  Next: bun run src/cli/index.ts start --config ${CONFIG_PATH}"
fi
