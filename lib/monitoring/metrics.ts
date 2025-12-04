/**
 * Performance metrics tracking
 * Tracks API response times, database queries, and external service calls
 */

import { log } from '../logger';

export interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  tags?: Record<string, string>;
}

export interface MetricsSummary {
  count: number;
  avg: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}

/**
 * In-memory metrics storage
 * In production, this would be replaced with a time-series database (e.g., Prometheus, DataDog)
 */
class MetricsStore {
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private maxMetricsPerType = 1000; // Keep last 1000 metrics per type

  /**
   * Record a performance metric
   */
  record(metric: PerformanceMetric): void {
    const existing = this.metrics.get(metric.name) || [];
    existing.push(metric);

    // Keep only the most recent metrics
    if (existing.length > this.maxMetricsPerType) {
      existing.shift();
    }

    this.metrics.set(metric.name, existing);

    // Log slow operations
    if (this.isSlowOperation(metric)) {
      log.warn(`Slow operation detected: ${metric.name}`, {
        duration: metric.duration,
        tags: metric.tags,
      });
    }
  }

  /**
   * Get all metrics for a specific type
   */
  getMetrics(name: string, since?: number): PerformanceMetric[] {
    const metrics = this.metrics.get(name) || [];

    if (since) {
      return metrics.filter(m => m.timestamp >= since);
    }

    return metrics;
  }

  /**
   * Get summary statistics for a metric type
   */
  getSummary(name: string, since?: number): MetricsSummary | null {
    const metrics = this.getMetrics(name, since);

    if (metrics.length === 0) {
      return null;
    }

    const durations = metrics.map(m => m.duration).sort((a, b) => a - b);
    const sum = durations.reduce((acc, d) => acc + d, 0);

    return {
      count: durations.length,
      avg: sum / durations.length,
      min: durations[0],
      max: durations[durations.length - 1],
      p50: this.percentile(durations, 0.5),
      p95: this.percentile(durations, 0.95),
      p99: this.percentile(durations, 0.99),
    };
  }

  /**
   * Get all metric types
   */
  getMetricTypes(): string[] {
    return Array.from(this.metrics.keys());
  }

  /**
   * Clear old metrics (for memory management)
   */
  clearOldMetrics(olderThan: number): void {
    for (const [name, metrics] of this.metrics.entries()) {
      const filtered = metrics.filter(m => m.timestamp >= olderThan);
      this.metrics.set(name, filtered);
    }
  }

  /**
   * Calculate percentile from sorted array
   */
  private percentile(sortedArray: number[], percentile: number): number {
    const index = Math.ceil(sortedArray.length * percentile) - 1;
    return sortedArray[Math.max(0, index)];
  }

  /**
   * Check if an operation is considered slow
   */
  private isSlowOperation(metric: PerformanceMetric): boolean {
    const thresholds: Record<string, number> = {
      'api.request': 5000, // 5 seconds
      'db.query': 1000, // 1 second
      'openai.chat': 10000, // 10 seconds
      'openai.embedding': 5000, // 5 seconds
      'rag.search': 2000, // 2 seconds
    };

    const threshold = thresholds[metric.name] || 3000; // Default 3 seconds
    return metric.duration > threshold;
  }
}

// Singleton instance
const metricsStore = new MetricsStore();

/**
 * Timer utility for measuring operation duration
 */
export class PerformanceTimer {
  private startTime: number;
  private name: string;
  private tags?: Record<string, string>;

  constructor(name: string, tags?: Record<string, string>) {
    this.name = name;
    this.tags = tags;
    this.startTime = Date.now();
  }

  /**
   * End the timer and record the metric
   */
  end(): number {
    const duration = Date.now() - this.startTime;

    metricsStore.record({
      name: this.name,
      duration,
      timestamp: this.startTime,
      tags: this.tags,
    });

    return duration;
  }

  /**
   * End the timer and log the duration
   */
  endWithLog(message?: string): number {
    const duration = this.end();

    log.debug(message || `${this.name} completed`, {
      duration,
      tags: this.tags,
    });

    return duration;
  }
}

/**
 * Wrap an async function with performance tracking
 */
export function withPerformanceTracking<T extends (...args: any[]) => Promise<any>>(
  name: string,
  fn: T,
  getTags?: (...args: Parameters<T>) => Record<string, string>
): T {
  return (async (...args: any[]) => {
    const timer = new PerformanceTimer(
      name,
      getTags ? getTags(...args) : undefined
    );

    try {
      const result = await fn(...args);
      timer.end();
      return result;
    } catch (error) {
      timer.end();
      throw error;
    }
  }) as T;
}

/**
 * Get metrics summary for a specific metric type
 */
export function getMetricsSummary(name: string, since?: number): MetricsSummary | null {
  return metricsStore.getSummary(name, since);
}

/**
 * Get all metrics for a specific type
 */
export function getMetrics(name: string, since?: number): PerformanceMetric[] {
  return metricsStore.getMetrics(name, since);
}

/**
 * Get all metric types
 */
export function getMetricTypes(): string[] {
  return metricsStore.getMetricTypes();
}

/**
 * Get all metrics summaries
 */
export function getAllMetricsSummaries(since?: number): Record<string, MetricsSummary | null> {
  const types = metricsStore.getMetricTypes();
  const summaries: Record<string, MetricsSummary | null> = {};

  for (const type of types) {
    summaries[type] = metricsStore.getSummary(type, since);
  }

  return summaries;
}

/**
 * Clear old metrics (run periodically to prevent memory leaks)
 */
export function clearOldMetrics(olderThanMs: number = 24 * 60 * 60 * 1000): void {
  const cutoff = Date.now() - olderThanMs;
  metricsStore.clearOldMetrics(cutoff);
  log.info('Cleared old metrics', { cutoffTime: new Date(cutoff).toISOString() });
}

// Clean up old metrics every hour
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    clearOldMetrics();
  }, 60 * 60 * 1000); // 1 hour
}

export default {
  PerformanceTimer,
  withPerformanceTracking,
  getMetricsSummary,
  getMetrics,
  getMetricTypes,
  getAllMetricsSummaries,
  clearOldMetrics,
};
