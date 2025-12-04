import { NextRequest, NextResponse } from 'next/server';
import { getHealthStatus, isAlive, isReady } from '@/lib/health-checks';
import { log } from '@/lib/logger';

/**
 * GET /api/health - Comprehensive health check
 * Returns detailed health status of all services
 *
 * Query params:
 * - detailed=true: Include full diagnostic information
 * - performance=true: Include performance metrics (last hour)
 *
 * Response codes:
 * - 200: Service is healthy or degraded
 * - 503: Service is unhealthy
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const detailed = searchParams.get('detailed') === 'true';
    const performance = searchParams.get('performance') === 'true';

    const health = await getHealthStatus(performance);

    // Return 503 if unhealthy
    const statusCode = health.status === 'unhealthy' ? 503 : 200;

    // Filter response based on detailed flag
    const response = detailed
      ? health
      : {
          status: health.status,
          timestamp: health.timestamp,
          uptime: health.uptime,
        };

    return NextResponse.json(response, { status: statusCode });
  } catch (error) {
    log.error('Health check failed', error);
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Health check failed',
      },
      { status: 503 }
    );
  }
}

/**
 * GET /api/health/live - Liveness probe
 * Simple check to verify the process is alive
 * Returns 200 if process is running
 * Used by load balancers to detect crashed processes
 */
export async function HEAD(request: NextRequest) {
  const alive = isAlive();
  return new NextResponse(null, { status: alive ? 200 : 503 });
}
