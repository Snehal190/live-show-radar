export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
  }
}

/** Run `fn` with an AbortSignal that fires after `ms`. */
export async function withTimeout<T>(label: string, ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(new TimeoutError(label, ms));
    }, ms);
  });
  try {
    return await Promise.race([fn(ctrl.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** One retry after a short pause (the spec: timeout + one retry on every external call). */
export async function withRetry<T>(fn: () => Promise<T>, retries = 1, pauseMs = 800, shouldRetry: (e: unknown) => boolean = () => true): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (retries <= 0 || !shouldRetry(e)) throw e;
    await new Promise((r) => setTimeout(r, pauseMs));
    return withRetry(fn, retries - 1, pauseMs, shouldRetry);
  }
}
