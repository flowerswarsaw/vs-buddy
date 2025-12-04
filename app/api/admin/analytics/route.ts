import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { AuthError } from '@/lib/errors';
import { handleApiError } from '@/lib/error-handler';
import { getAllMetricsSummaries, getMetricTypes } from '@/lib/monitoring/metrics';

/**
 * GET /api/admin/analytics - Get performance analytics
 * Query params:
 *  - since: Timestamp in ms to filter metrics (default: last 24 hours)
 */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new AuthError('Unauthorized', undefined, { requestId });
    }

    // Get query parameters
    const url = new URL(request.url);
    const sinceParam = url.searchParams.get('since');
    const since = sinceParam
      ? parseInt(sinceParam, 10)
      : Date.now() - 24 * 60 * 60 * 1000; // Last 24 hours

    // Get all metrics summaries
    const summaries = getAllMetricsSummaries(since);
    const metricTypes = getMetricTypes();

    return NextResponse.json({
      timeRange: {
        since: new Date(since).toISOString(),
        to: new Date().toISOString(),
      },
      metrics: summaries,
      metricTypes,
    });
  } catch (error) {
    return handleApiError(error, {
      requestId,
      userId: (await auth())?.user?.id,
      path: '/api/admin/analytics',
      method: 'GET',
    });
  }
}
