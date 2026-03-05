export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  project_id?: string;
  work_item_id?: string;
  run_id?: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

type LogSink = (entry: LogEntry) => void;

const defaultSink: LogSink = (entry) => {
  console.log(JSON.stringify(entry));
};

export function createLogger(
  component: string,
  sink: LogSink = defaultSink
): Logger {
  function log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>
  ) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component,
      message,
      ...context,
    };
    sink(entry);
  }

  return {
    debug: (msg, ctx) => log("debug", msg, ctx),
    info: (msg, ctx) => log("info", msg, ctx),
    warn: (msg, ctx) => log("warn", msg, ctx),
    error: (msg, ctx) => log("error", msg, ctx),
  };
}
