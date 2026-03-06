export interface AgentRunParams {
  runId: string;
  workDir: string;
  prompt: string;
  timeout_ms: number;
  maxTurns: number;
  approvalPolicy: "auto" | "gated" | "suggest";
  env: Record<string, string>;
}

export interface AgentRunResult {
  status: "succeeded" | "failed" | "timed_out" | "cancelled";
  exitCode: number;
  stdout: string;
  stderr: string;
  tokenUsage?: { input: number; output: number };
  filesChanged: string[];
  summary?: string;
}

export interface AgentAdapter {
  name: string;
  isAvailable(): Promise<boolean>;
  execute(params: AgentRunParams): Promise<AgentRunResult>;
  cancel(runId: string): Promise<void>;
}
