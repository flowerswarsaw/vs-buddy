/**
 * Health check utilities
 * Provides health status for all external dependencies
 */

import { testDatabaseConnection, getDatabaseStats } from './db';
import { openai, getCircuitBreakerStats } from './openai';
import { config } from './config';
import { log } from './logger';
import { getAllMetricsSummaries, type MetricsSummary } from './monitoring/metrics';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: {
    database: HealthCheck;
    openai: HealthCheck;
    environment: HealthCheck;
  };
  performance?: Record<string, MetricsSummary | null>;
}

export interface HealthCheck {
  status: 'pass' | 'fail' | 'warn';
  message?: string;
  latency?: number;
  details?: Record<string, any>;
}

/**
 * Check database health
 */
export async function checkDatabaseHealth(): Promise<HealthCheck> {
  const start = Date.now();

  try {
    // Test basic connectivity
    await testDatabaseConnection();

    // Get stats
    const stats = await getDatabaseStats();
    const latency = Date.now() - start;

    if (!stats.healthy) {
      return {
        status: 'fail',
        message: 'Database query failed',
        latency,
        details: stats,
      };
    }

    return {
      status: 'pass',
      message: 'Database is healthy',
      latency,
      details: stats.counts,
    };
  } catch (error) {
    return {
      status: 'fail',
      message: error instanceof Error ? error.message : 'Database connection failed',
      latency: Date.now() - start,
    };
  }
}

/**
 * Check OpenAI API health
 */
export async function checkOpenAIHealth(): Promise<HealthCheck> {
  const start = Date.now();

  try {
    // Check if API key is configured
    const apiKey = config.openaiApiKey();
    if (!apiKey || apiKey.length < 10) {
      return {
        status: 'fail',
        message: 'OpenAI API key not configured',
        latency: 0,
      };
    }

    // Get circuit breaker stats
    const cbStats = getCircuitBreakerStats();
    const chatCB = cbStats.chat;
    const embeddingCB = cbStats.embedding;

    // Check if circuit breakers are open (indicating failures)
    const chatOpen = chatCB.state === 'OPEN';
    const embeddingOpen = embeddingCB.state === 'OPEN';

    if (chatOpen && embeddingOpen) {
      return {
        status: 'fail',
        message: 'OpenAI services unavailable (circuit breakers open)',
        latency: Date.now() - start,
        details: {
          chat: cbStats.chat,
          embedding: cbStats.embedding,
        },
      };
    }

    if (chatOpen || embeddingOpen) {
      return {
        status: 'warn',
        message: 'OpenAI partially degraded',
        latency: Date.now() - start,
        details: {
          chat: cbStats.chat,
          embedding: cbStats.embedding,
        },
      };
    }

    // Test with a minimal API call (models list - cheap and fast)
    try {
      await openai.models.list({ limit: 1 });
      return {
        status: 'pass',
        message: 'OpenAI API is healthy',
        latency: Date.now() - start,
        details: {
          chat: cbStats.chat,
          embedding: cbStats.embedding,
        },
      };
    } catch (apiError) {
      // If API call fails but circuit breakers are closed, it's a transient error
      return {
        status: 'warn',
        message: 'OpenAI API test call failed (may be transient)',
        latency: Date.now() - start,
        details: {
          error: apiError instanceof Error ? apiError.message : String(apiError),
          chat: cbStats.chat,
          embedding: cbStats.embedding,
        },
      };
    }
  } catch (error) {
    return {
      status: 'fail',
      message: error instanceof Error ? error.message : 'OpenAI health check failed',
      latency: Date.now() - start,
    };
  }
}

/**
 * Check environment configuration
 */
export function checkEnvironmentHealth(): HealthCheck {
  const missing: string[] = [];
  const warnings: string[] = [];

  // Check required variables
  if (!process.env.DATABASE_URL) {
    missing.push('DATABASE_URL');
  }

  if (!process.env.OPENAI_API_KEY) {
    missing.push('OPENAI_API_KEY');
  }

  if (!process.env.NEXTAUTH_SECRET && !process.env.AUTH_SECRET) {
    missing.push('NEXTAUTH_SECRET or AUTH_SECRET');
  }

  // Check optional but recommended variables
  if (!process.env.NEXTAUTH_URL) {
    warnings.push('NEXTAUTH_URL not set (recommended for production)');
  }

  if (missing.length > 0) {
    return {
      status: 'fail',
      message: `Missing required environment variables: ${missing.join(', ')}`,
      details: { missing, warnings },
    };
  }

  if (warnings.length > 0) {
    return {
      status: 'warn',
      message: 'Environment configuration has warnings',
      details: { warnings },
    };
  }

  return {
    status: 'pass',
    message: 'Environment is properly configured',
    details: {
      nodeEnv: process.env.NODE_ENV || 'development',
      defaultModel: config.defaultChatModel,
    },
  };
}

/**
 * Comprehensive health check for all services
 */
export async function getHealthStatus(includePerformance: boolean = false): Promise<HealthStatus> {
  const [database, openai, environment] = await Promise.all([
    checkDatabaseHealth(),
    checkOpenAIHealth(),
    Promise.resolve(checkEnvironmentHealth()),
  ]);

  // Determine overall status
  const checks = { database, openai, environment };
  const hasFailure = Object.values(checks).some((c) => c.status === 'fail');
  const hasWarning = Object.values(checks).some((c) => c.status === 'warn');

  let status: 'healthy' | 'degraded' | 'unhealthy';
  if (hasFailure) {
    status = 'unhealthy';
  } else if (hasWarning) {
    status = 'degraded';
  } else {
    status = 'healthy';
  }

  // Include performance metrics if requested
  const performance = includePerformance
    ? getAllMetricsSummaries(Date.now() - 60 * 60 * 1000) // Last hour
    : undefined;

  return {
    status,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks,
    performance,
  };
}

/**
 * Simple liveness check (for load balancers)
 * Returns true if the process is alive (doesn't check dependencies)
 */
export function isAlive(): boolean {
  return true;
}

/**
 * Readiness check (for load balancers)
 * Returns true if the service is ready to accept requests
 */
export async function isReady(): Promise<boolean> {
  try {
    const health = await getHealthStatus();
    // Consider the service ready if it's not completely unhealthy
    return health.status !== 'unhealthy';
  } catch (error) {
    log.error('Health readiness check failed', error);
    return false;
  }
}
