import { NextResponse } from 'next/server';
import { isAlive } from '@/lib/health-checks';

/**
 * GET /api/health/live - Liveness probe
 *
 * Simple check to verify the process is alive.
 * Returns 200 if the process is running.
 *
 * This endpoint should NOT check external dependencies.
 * It's used by load balancers/orchestrators to detect crashed processes.
 *
 * Usage in Kubernetes:
 * livenessProbe:
 *   httpGet:
 *     path: /api/health/live
 *     port: 3000
 */
export async function GET() {
  const alive = isAlive();

  return NextResponse.json(
    {
      status: alive ? 'alive' : 'dead',
      timestamp: new Date().toISOString(),
    },
    { status: alive ? 200 : 503 }
  );
}

/**
 * HEAD /api/health/live
 * Same as GET but returns no body (more efficient for automated checks)
 */
export async function HEAD() {
  const alive = isAlive();
  return new NextResponse(null, { status: alive ? 200 : 503 });
}
