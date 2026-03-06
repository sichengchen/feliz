import { parse } from "yaml";
import { homedir } from "os";
import { join } from "path";
import type {
  FelizConfig,
  ProjectConfig,
  ProjectAddConfig,
  RepoConfig,
  PipelineDefinition,
} from "./types.ts";

export function resolveEnvVars(value: string): string {
  if (!value.startsWith("$")) return value;
  const envName = value.slice(1);
  const envValue = process.env[envName];
  if (envValue === undefined) {
    throw new Error(`Environment variable ${envName} is not set`);
  }
  return envValue;
}

export function loadFelizConfig(yamlContent: string): FelizConfig {
  const raw = parse(yamlContent) as Record<string, unknown>;

  if (!raw?.linear || !(raw.linear as Record<string, unknown>)?.api_key) {
    throw new Error("linear.api_key is required");
  }

  const rawProjects = raw.projects as Record<string, unknown>[] | undefined;
  if (!rawProjects || rawProjects.length === 0) {
    throw new Error("At least one project must be configured");
  }

  const projects: ProjectConfig[] = rawProjects.map((p) => {
    if (!p.repo) throw new Error(`projects[].repo is required for project "${p.name}"`);
    if (!p.linear_project)
      throw new Error(
        `projects[].linear_project is required for project "${p.name}"`
      );
    if (!p.name)
      throw new Error("projects[].name is required");
    return {
      name: p.name as string,
      repo: p.repo as string,
      linear_project: p.linear_project as string,
      branch: (p.branch as string) || "main",
    };
  });

  const linear = raw.linear as Record<string, unknown>;
  const polling = (raw.polling as Record<string, unknown>) || {};
  const storage = (raw.storage as Record<string, unknown>) || {};
  const agent = (raw.agent as Record<string, unknown>) || {};
  const defaultDataDir = join(homedir(), ".feliz");

  return {
    linear: {
      api_key: resolveEnvVars(linear.api_key as string),
    },
    polling: {
      interval_ms: (polling.interval_ms as number) || 30000,
    },
    storage: {
      data_dir: (storage.data_dir as string) || defaultDataDir,
      workspace_root:
        (storage.workspace_root as string) ||
        join((storage.data_dir as string) || defaultDataDir, "workspaces"),
    },
    agent: {
      default: (agent.default as string) || "claude-code",
      max_concurrent: (agent.max_concurrent as number) || 5,
    },
    projects,
  };
}

export function loadFelizProjectAddConfig(yamlContent: string): ProjectAddConfig {
  const raw = parse(yamlContent) as Record<string, unknown>;

  if (!raw?.linear || !(raw.linear as Record<string, unknown>)?.api_key) {
    throw new Error("linear.api_key is required");
  }

  const linear = raw.linear as Record<string, unknown>;
  const agent = (raw.agent as Record<string, unknown>) || {};
  const storage = (raw.storage as Record<string, unknown>) || {};
  const defaultDataDir = join(homedir(), ".feliz");

  return {
    linear: {
      api_key: resolveEnvVars(linear.api_key as string),
    },
    agent: {
      default: (agent.default as string) || "claude-code",
    },
    storage: {
      workspace_root:
        (storage.workspace_root as string) ||
        join((storage.data_dir as string) || defaultDataDir, "workspaces"),
    },
  };
}

export function loadRepoConfig(yamlContent: string): RepoConfig {
  const raw = parse(yamlContent) as Record<string, unknown>;
  const agent = (raw?.agent as Record<string, unknown>) || {};
  const hooks = (raw?.hooks as Record<string, string>) || {};
  const specs = (raw?.specs as Record<string, unknown>) || {};
  const gates = (raw?.gates as Record<string, string>) || {};
  const concurrency = (raw?.concurrency as Record<string, unknown>) || {};

  return {
    agent: {
      adapter: (agent.adapter as string) || "claude-code",
      approval_policy:
        (agent.approval_policy as "auto" | "gated" | "suggest") || "auto",
      max_turns: (agent.max_turns as number) || 20,
      timeout_ms: (agent.timeout_ms as number) || 600000,
    },
    hooks: {
      after_create: hooks.after_create,
      before_run: hooks.before_run,
      after_run: hooks.after_run,
      before_remove: hooks.before_remove,
    },
    specs: {
      enabled: (specs.enabled as boolean) ?? false,
      directory: (specs.directory as string) || "specs",
      approval_required: (specs.approval_required as boolean) ?? true,
    },
    gates: {
      test_command: gates.test_command,
      lint_command: gates.lint_command,
    },
    concurrency: {
      max_per_state: concurrency.max_per_state as
        | Record<string, number>
        | undefined,
    },
  };
}

export function loadPipelineConfig(yamlContent: string): PipelineDefinition {
  const raw = parse(yamlContent) as Record<string, unknown>;
  return raw as unknown as PipelineDefinition;
}

export function getDefaultPipeline(testCommand?: string): PipelineDefinition {
  return {
    phases: [
      {
        name: "execute",
        steps: [
          {
            name: "run",
            prompt: "WORKFLOW.md",
            ...(testCommand ? { success: { command: testCommand } } : {}),
          },
          {
            name: "create_pr",
            builtin: "publish",
          },
        ],
      },
    ],
  };
}
