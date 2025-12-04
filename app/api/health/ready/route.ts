import { NextResponse } from 'next/server';
import { isReady } from '@/lib/health-checks';

/**
 * GET /api/health/ready - Readiness probe
 *
 * Checks if the service is ready to accept traffic.
 * Returns 200 if all dependencies are healthy or degraded.
 * Returns 503 if service is unhealthy.
 *
 * This endpoint DOES check external dependencies (database, OpenAI).
 * Used by load balancers to route traffic only to healthy instances.
 *
 * Usage in Kubernetes:
 * readinessProbe:
 *   httpGet:
 *     path: /api/health/ready
 *     port: 3000
 *   initialDelaySeconds: 10
 *   periodSeconds: 5
 */
export async function GET() {
  try {
    const ready = await isReady();

    return NextResponse.json(
      {
        status: ready ? 'ready' : 'not ready',
        timestamp: new Date().toISOString(),
      },
      { status: ready ? 200 : 503 }
    );
  } catch (error) {
    console.error('[Health] Readiness check failed:', error);
    return NextResponse.json(
      {
        status: 'not ready',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Readiness check failed',
      },
      { status: 503 }
    );
  }
}

/**
 * HEAD /api/health/ready
 * Same as GET but returns no body (more efficient for automated checks)
 */
export async function HEAD() {
  try {
    const ready = await isReady();
    return new NextResponse(null, { status: ready ? 200 : 503 });
  } catch (error) {
    return new NextResponse(null, { status: 503 });
  }
}
