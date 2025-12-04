/**
 * Circuit Breaker pattern implementation
 * Prevents cascading failures by failing fast when a service is unhealthy
 */

import { log } from '../logger';

export interface CircuitBreakerOptions {
  failureThreshold?: number; // Number of failures before opening circuit
  successThreshold?: number; // Number of successes before closing circuit
  timeout?: number; // Time in ms to wait before trying again (half-open state)
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

export enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation, requests go through
  OPEN = 'OPEN', // Circuit is open, requests fail immediately
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

const DEFAULT_OPTIONS: Required<Omit<CircuitBreakerOptions, 'onStateChange'>> = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000, // 1 minute
};

/**
 * Circuit Breaker class
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private nextAttempt: number = Date.now();
  private options: Required<Omit<CircuitBreakerOptions, 'onStateChange'>>;
  private onStateChange?: (from: CircuitState, to: CircuitState) => void;

  constructor(options: CircuitBreakerOptions = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
    this.onStateChange = options.onStateChange;
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit statistics
   */
  getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      nextAttempt: this.nextAttempt,
    };
  }

  /**
   * Change circuit state
   */
  private setState(newState: CircuitState): void {
    if (this.state !== newState) {
      const oldState = this.state;
      this.state = newState;
      this.onStateChange?.(oldState, newState);
      log.info(`Circuit breaker state changed: ${oldState} -> ${newState}`, {
        oldState,
        newState,
        failureCount: this.failureCount,
        successCount: this.successCount,
      });
    }
  }

  /**
   * Record a successful request
   */
  private recordSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.successCount = 0;
        this.setState(CircuitState.CLOSED);
      }
    }
  }

  /**
   * Record a failed request
   */
  private recordFailure(): void {
    this.failureCount++;
    this.successCount = 0;

    if (this.failureCount >= this.options.failureThreshold) {
      this.setState(CircuitState.OPEN);
      this.nextAttempt = Date.now() + this.options.timeout;
    }
  }

  /**
   * Check if we should allow the request
   */
  private canAttempt(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return true;
    }

    if (this.state === CircuitState.OPEN) {
      if (Date.now() >= this.nextAttempt) {
        this.setState(CircuitState.HALF_OPEN);
        return true;
      }
      return false;
    }

    // HALF_OPEN state - allow single request to test
    return true;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canAttempt()) {
      throw new Error(
        `Circuit breaker is OPEN. Service unavailable. Will retry at ${new Date(
          this.nextAttempt
        ).toISOString()}`
      );
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = Date.now();
    log.info('Circuit breaker manually reset to CLOSED state');
  }
}

/**
 * Create a circuit breaker wrapper for a function
 */
export function withCircuitBreaker<TArgs extends any[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  options: CircuitBreakerOptions = {}
): {
  execute: (...args: TArgs) => Promise<TReturn>;
  breaker: CircuitBreaker;
} {
  const breaker = new CircuitBreaker(options);

  return {
    execute: (...args: TArgs) => breaker.execute(() => fn(...args)),
    breaker,
  };
}
