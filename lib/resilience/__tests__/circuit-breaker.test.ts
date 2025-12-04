/**
 * Unit tests for circuit breaker
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker, CircuitState } from '../circuit-breaker';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should start in CLOSED state', () => {
    const cb = new CircuitBreaker({
      failureThreshold: 3,
      timeout: 1000,
    });

    expect(cb.getState()).toBe('CLOSED');
  });

  it('should execute function when CLOSED', async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 3,
      timeout: 1000,
    });

    const fn = vi.fn().mockResolvedValue('success');
    const result = await cb.execute(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should open circuit after failure threshold', async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 3,
      timeout: 1000,
    });

    const fn = vi.fn().mockRejectedValue(new Error('Failure'));

    // Fail 3 times to hit threshold
    for (let i = 0; i < 3; i++) {
      try {
        await cb.execute(fn);
      } catch (error) {
        // Expected
      }
    }

    expect(cb.getState()).toBe('OPEN');
  });

  it('should reject immediately when OPEN', async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 2,
      timeout: 1000,
    });

    const fn = vi.fn().mockRejectedValue(new Error('Failure'));

    // Fail twice to open circuit
    for (let i = 0; i < 2; i++) {
      try {
        await cb.execute(fn);
      } catch (error) {
        // Expected
      }
    }

    // Next call should fail immediately without calling fn
    fn.mockClear();
    await expect(cb.execute(fn)).rejects.toThrow('Circuit breaker is OPEN');
    expect(fn).not.toHaveBeenCalled();
  });

  it('should transition to HALF_OPEN after timeout', async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 2,
      timeout: 100, // Short timeout for testing
      successThreshold: 1, // Only need 1 success to close from HALF_OPEN
    });

    const fn = vi.fn().mockRejectedValue(new Error('Failure'));

    // Open the circuit
    for (let i = 0; i < 2; i++) {
      try {
        await cb.execute(fn);
      } catch (error) {
        // Expected
      }
    }

    expect(cb.getState()).toBe('OPEN');

    // Wait for timeout
    await new Promise(resolve => setTimeout(resolve, 150));

    // Next execution should try HALF_OPEN and succeed
    fn.mockResolvedValue('success');
    const result = await cb.execute(fn);

    expect(result).toBe('success');
    expect(cb.getState()).toBe('CLOSED');
  });

  it('should close circuit after successful executions in HALF_OPEN', async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 2,
      timeout: 100,
      successThreshold: 2,
    });

    const fn = vi.fn().mockRejectedValue(new Error('Failure'));

    // Open the circuit
    for (let i = 0; i < 2; i++) {
      try {
        await cb.execute(fn);
      } catch (error) {
        // Expected
      }
    }

    // Wait for timeout
    await new Promise(resolve => setTimeout(resolve, 150));

    // Succeed twice to close circuit
    fn.mockResolvedValue('success');
    await cb.execute(fn);
    await cb.execute(fn);

    expect(cb.getState()).toBe('CLOSED');
  });

  it('should reopen circuit if failure occurs in HALF_OPEN', async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 2,
      timeout: 100,
    });

    const fn = vi.fn().mockRejectedValue(new Error('Failure'));

    // Open the circuit
    for (let i = 0; i < 2; i++) {
      try {
        await cb.execute(fn);
      } catch (error) {
        // Expected
      }
    }

    // Wait for timeout
    await new Promise(resolve => setTimeout(resolve, 150));

    // Fail again in HALF_OPEN state
    try {
      await cb.execute(fn);
    } catch (error) {
      // Expected
    }

    expect(cb.getState()).toBe('OPEN');
  });

  it('should call onStateChange callback', async () => {
    const onStateChange = vi.fn();

    const cb = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeout: 1000,
      onStateChange,
    });

    const fn = vi.fn().mockRejectedValue(new Error('Failure'));

    // Fail twice to open circuit
    for (let i = 0; i < 2; i++) {
      try {
        await cb.execute(fn);
      } catch (error) {
        // Expected
      }
    }

    expect(onStateChange).toHaveBeenCalledWith('CLOSED', 'OPEN');
  });

  it('should reset failure count on success', async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 1000,
    });

    const fn = vi.fn();

    // Fail twice (below threshold)
    fn.mockRejectedValue(new Error('Failure'));
    for (let i = 0; i < 2; i++) {
      try {
        await cb.execute(fn);
      } catch (error) {
        // Expected
      }
    }

    // Succeed once (resets failure count)
    fn.mockResolvedValue('success');
    await cb.execute(fn);

    // Should still be CLOSED
    expect(cb.getState()).toBe('CLOSED');

    // Can fail twice more before opening
    fn.mockRejectedValue(new Error('Failure'));
    for (let i = 0; i < 2; i++) {
      try {
        await cb.execute(fn);
      } catch (error) {
        // Expected
      }
    }

    // Still CLOSED (only 2 failures)
    expect(cb.getState()).toBe('CLOSED');
  });

  it('should provide stats', async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 3,
      timeout: 1000,
    });

    const fn = vi.fn();

    // Execute some operations
    fn.mockResolvedValue('success');
    await cb.execute(fn);
    await cb.execute(fn);

    fn.mockRejectedValue(new Error('Failure'));
    try {
      await cb.execute(fn);
    } catch (error) {
      // Expected
    }

    const stats = cb.getStats();

    expect(stats.state).toBe('CLOSED');
    expect(stats.failureCount).toBe(1);
    // Success count is only tracked in HALF_OPEN state, not CLOSED
    expect(stats.successCount).toBe(0);
  });
});
