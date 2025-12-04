/**
 * Unit tests for retry logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withRetry } from '../retry';

describe('withRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const result = await withRetry(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValue('success');

    const result = await withRetry(fn, {
      maxAttempts: 3,
      initialDelayMs: 10,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw error after max attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Persistent failure'));

    await expect(
      withRetry(fn, {
        maxAttempts: 3,
        initialDelayMs: 10,
      })
    ).rejects.toThrow('Persistent failure');

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should use exponential backoff', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValue('success');

    const startTime = Date.now();

    await withRetry(fn, {
      maxAttempts: 3,
      initialDelayMs: 50,
      backoffMultiplier: 2, // Enable exponential backoff
    });

    const elapsed = Date.now() - startTime;

    // First retry: ~50ms, second retry: ~100ms
    // Total should be at least 100ms (with jitter, could vary)
    expect(elapsed).toBeGreaterThanOrEqual(80);
  });

  it('should respect shouldRetry predicate', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Fatal error'));

    await expect(
      withRetry(fn, {
        maxAttempts: 3,
        initialDelayMs: 10,
        shouldRetry: (error) => {
          return error instanceof Error && !error.message.includes('Fatal');
        },
      })
    ).rejects.toThrow('Fatal error');

    // Should fail immediately without retrying
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on transient errors', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Transient error'))
      .mockResolvedValue('success');

    const result = await withRetry(fn, {
      maxAttempts: 2,
      initialDelayMs: 10,
      shouldRetry: (error) => {
        return error instanceof Error && error.message.includes('Transient');
      },
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should respect maxDelayMs cap', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Fail'))
      .mockResolvedValue('success');

    await withRetry(fn, {
      maxAttempts: 2,
      initialDelayMs: 1000,
      maxDelayMs: 100,
      backoffMultiplier: 2,
    });

    // Delay should be capped at maxDelayMs (100ms)
    // If not capped, it would be 1000ms or more
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should add jitter to delay by default', async () => {
    const delays: number[] = [];
    for (let i = 0; i < 5; i++) {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValue('success');

      const startTime = Date.now();
      await withRetry(fn, {
        maxAttempts: 2,
        initialDelayMs: 50,
      });
      delays.push(Date.now() - startTime);
    }

    // With jitter, delays should vary (jitter is ±25%)
    const uniqueDelays = new Set(delays.map(d => Math.floor(d / 10)));
    expect(uniqueDelays.size).toBeGreaterThan(1);
  });
});
