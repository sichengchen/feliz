export interface FelizConfig {
  linear: {
    api_key: string;
  };
  polling: {
    interval_ms: number;
  };
  storage: {
    data_dir: string;
    workspace_root: string;
  };
  agent: {
    default: string;
    max_concurrent: number;
  };
  projects: ProjectConfig[];
}

export interface ProjectAddConfig {
  linear: {
    api_key: string;
  };
  agent: {
    default: string;
  };
  storage: {
    workspace_root: string;
  };
}

export interface ProjectConfig {
  name: string;
  repo: string;
  linear_project: string;
  branch: string;
}

export interface RepoConfig {
  agent: {
    adapter: string;
    approval_policy: "auto" | "gated" | "suggest";
    max_turns: number;
    timeout_ms: number;
  };
  hooks: {
    after_create?: string;
    before_run?: string;
    after_run?: string;
    before_remove?: string;
  };
  specs: {
    enabled: boolean;
    directory: string;
    approval_required: boolean;
  };
  gates: {
    test_command?: string;
    lint_command?: string;
  };
  concurrency: {
    max_per_state?: Record<string, number>;
  };
}

export interface SuccessCondition {
  command?: string;
  agent_verdict?: string;
  file_exists?: string;
  always?: boolean;
}

export interface PipelineStep {
  name: string;
  agent?: string;
  prompt?: string;
  success?: SuccessCondition;
  max_attempts?: number;
  builtin?: string;
}

export interface PipelinePhase {
  name: string;
  repeat?: {
    max: number;
    on_exhaust: "pass" | "fail";
  };
  steps: PipelineStep[];
}

export interface PipelineDefinition {
  phases: PipelinePhase[];
}
