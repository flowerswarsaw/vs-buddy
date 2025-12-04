/**
 * Retry utilities with exponential backoff
 * Implements intelligent retry logic for transient failures
 */

import { log } from '../logger';

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  timeoutMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'shouldRetry' | 'onRetry'>> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  timeoutMs: 30000, // 30 seconds max per requirement
};

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateDelay(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  multiplier: number
): number {
  const exponentialDelay = initialDelay * Math.pow(multiplier, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, maxDelay);

  // Add jitter (±25%)
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.max(0, cappedDelay + jitter);
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (!error) return false;

  // Handle OpenAI SDK errors
  if (typeof error === 'object' && error !== null) {
    const err = error as any;

    // Rate limit errors - should retry
    if (err.status === 429 || err.code === 'rate_limit_exceeded') {
      return true;
    }

    // Timeout errors - should retry
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET') {
      return true;
    }

    // Server errors (5xx) - should retry
    if (err.status >= 500 && err.status < 600) {
      return true;
    }

    // Network errors - should retry
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      return true;
    }

    // Client errors (4xx except 429) - should NOT retry
    if (err.status >= 400 && err.status < 500 && err.status !== 429) {
      return false;
    }
  }

  // By default, retry on errors
  return true;
}

/**
 * Execute a function with retry logic and exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = {
    ...DEFAULT_RETRY_OPTIONS,
    ...options,
  };

  const shouldRetry = options.shouldRetry ?? isRetryableError;
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      // Add timeout to the function execution
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Request timeout after ${opts.timeoutMs}ms`)),
            opts.timeoutMs
          )
        ),
      ]);

      return result;
    } catch (error) {
      lastError = error;

      // Check if we should retry
      const isLastAttempt = attempt === opts.maxAttempts;
      const shouldRetryThis = shouldRetry(error, attempt);

      if (isLastAttempt || !shouldRetryThis) {
        throw error;
      }

      // Calculate delay for next attempt
      const delayMs = calculateDelay(
        attempt,
        opts.initialDelayMs,
        opts.maxDelayMs,
        opts.backoffMultiplier
      );

      // Call onRetry callback if provided
      options.onRetry?.(error, attempt, delayMs);

      // Log retry attempt
      log.debug(`Retry attempt ${attempt}/${opts.maxAttempts} failed, retrying in ${Math.round(delayMs)}ms`, {
        attempt,
        maxAttempts: opts.maxAttempts,
        delayMs: Math.round(delayMs),
        error: error instanceof Error ? error.message : String(error),
      });

      // Wait before retrying
      await sleep(delayMs);
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError;
}

/**
 * Create a retryable version of an async function
 */
export function makeRetryable<TArgs extends any[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  options: RetryOptions = {}
): (...args: TArgs) => Promise<TReturn> {
  return (...args: TArgs) => {
    return withRetry(() => fn(...args), options);
  };
}
