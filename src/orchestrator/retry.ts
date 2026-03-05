const MAX_RETRY_BACKOFF_MS = 300000;
const DEFAULT_MAX_RETRIES = 3;

export function computeRetryDelay(attempt: number): number {
  const baseDelay = 10000 * Math.pow(2, attempt - 1);
  const delay = Math.min(baseDelay, MAX_RETRY_BACKOFF_MS);
  const jitter = Math.random() * 2000;
  return delay + jitter;
}

export function shouldRetry(
  attempt: number,
  maxRetries: number = DEFAULT_MAX_RETRIES
): boolean {
  return attempt < maxRetries;
}
