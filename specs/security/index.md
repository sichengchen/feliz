# Security & Observability

## Structured Logging

All log entries include:
- `timestamp`
- `level` (debug, info, warn, error)
- `project_id` (when applicable)
- `work_item_id` (when applicable)
- `run_id` (when applicable)
- `component` (poller, orchestrator, workspace, agent, publisher)

Log format: JSON lines to stdout (Docker-friendly).

## Metrics (Future)

Key metrics to track:
- `feliz.poll.duration_ms` -- Linear poll cycle duration
- `feliz.poll.issues_discovered` -- new issues found per cycle
- `feliz.run.duration_ms` -- agent run duration (by project, adapter)
- `feliz.run.result` -- counter by result (succeeded, failed, timed_out)
- `feliz.run.tokens` -- token usage per run
- `feliz.gates.pass_rate` -- percentage of runs passing gates on first try
- `feliz.queue.depth` -- current queue depth

OpenTelemetry export is a future extension.

## Secrets & Agent Authentication

- **Linear API key**: environment variable (`LINEAR_API_KEY`), never logged or stored in config files.
- **Git credentials**: SSH keys (via agent socket mount) or HTTPS tokens (see Docker Credentials below).
- **GitHub/GitLab API token**: environment variable (`GITHUB_TOKEN`) for PR creation.
- **Coding agent credentials**: Feliz delegates authentication to each agent's own CLI. Feliz never stores agent OAuth tokens or credentials itself.

| Agent | OAuth (recommended) | API Key (fallback) |
|---|---|---|
| Claude Code | `claude login` -- agent's own OAuth flow, tokens stored by Claude Code (e.g., `~/.claude/`) | `ANTHROPIC_API_KEY` env var passed to agent subprocess |
| Codex | `codex login` -- agent's own OAuth flow, tokens stored by Codex (e.g., `~/.codex/`) | `OPENAI_API_KEY` env var passed to agent subprocess |

OAuth is preferred because it avoids long-lived API keys and respects each agent's EULA by using their official auth mechanisms. For headless environments (CI, remote servers), API key via env var is the fallback.

- `feliz agent login <name>` is a convenience wrapper that calls the agent's own login command (e.g., `claude login`, `codex login`).
- Agent credential directories must be persisted across container restarts (mount or volume).
- Credentials are never logged and never included in context snapshots.

## Docker Credentials

Feliz runs in Docker and needs git access for cloning repos and pushing branches/PRs.

**Required credentials**:
- SSH key or HTTPS token for `git clone` / `git push` to private repos
- Git hosting API token (e.g., `GITHUB_TOKEN`) for PR creation
- Git identity (`GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`) for commits

**Recommended approach**: Mount the host SSH agent socket into the container. This keeps private keys on the host and avoids copying secrets into the container image.

```yaml
# docker-compose.yml (uses build: . and env_file: .env)
services:
  feliz:
    build: .
    env_file: .env
    volumes:
      - ${SSH_AUTH_SOCK}:/ssh-agent:ro
      - ~/.ssh/known_hosts:/root/.ssh/known_hosts:ro
      - feliz-data:/data/feliz
      - feliz-agent-creds:/root
    environment:
      - SSH_AUTH_SOCK=/ssh-agent
      - LINEAR_API_KEY
      - GITHUB_TOKEN
      - ANTHROPIC_API_KEY
      - GIT_AUTHOR_NAME
      - GIT_AUTHOR_EMAIL
volumes:
  feliz-data:
  feliz-agent-creds:
```

**Alternative approaches**:

| Method | Config | When to use |
|---|---|---|
| SSH agent mount | `-v $SSH_AUTH_SOCK:/ssh-agent` | Local dev, macOS/Linux |
| SSH key mount | `-v ~/.ssh/id_ed25519:/root/.ssh/id_ed25519:ro` | Simple server setups |
| HTTPS + token | Repo URLs as `https://x-access-token:{TOKEN}@github.com/...` via git credential helper | CI/CD, no SSH available |
| Deploy keys | Per-repo read/write deploy keys as env vars | Production, least-privilege |

The Dockerfile must include `git`, `openssh-client`, and configure `known_hosts` for the git hosting provider (or use `StrictHostKeyChecking=accept-new` for initial setup).

## Workspace Isolation

- Each agent runs in its own worktree -- no shared mutable state between concurrent runs
- Agent process runs with the same user permissions as the Feliz daemon
- Worktree paths are sanitized and validated to prevent path traversal

## Trust Model

Feliz trusts:
- The configured Linear API key (operator responsibility)
- The code in managed repos (operator responsibility -- don't point Feliz at untrusted repos)
- Hook scripts in `.feliz/config.yml` (repo-controlled, treat as trusted config)
- Agent adapters (bundled or operator-installed)

Feliz does NOT trust:
- Linear issue content as executable input (template rendering is sandboxed -- no code execution from issue text)
- Agent outputs (validated through gates before publishing)
