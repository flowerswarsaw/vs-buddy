/**
 * Performance monitoring middleware for API routes
 * Tracks request duration and records metrics
 */

import { NextRequest, NextResponse } from 'next/server';
import { PerformanceTimer } from './metrics';
import { log } from '../logger';

/**
 * Measure API request performance
 * Usage: return await measurePerformance(request, async () => { ... })
 */
export async function measurePerformance<T extends NextResponse>(
  request: NextRequest,
  handler: () => Promise<T>
): Promise<T> {
  const timer = new PerformanceTimer('api.request', {
    method: request.method,
    path: new URL(request.url).pathname,
  });

  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();

  try {
    const response = await handler();
    const duration = timer.end();

    // Log request completion
    log.info('API request completed', {
      requestId,
      method: request.method,
      path: new URL(request.url).pathname,
      status: response.status,
      duration,
    });

    // Add performance headers to response
    response.headers.set('X-Response-Time', `${duration}ms`);
    response.headers.set('X-Request-Id', requestId);

    return response;
  } catch (error) {
    const duration = timer.end();

    log.error('API request failed', error, {
      requestId,
      method: request.method,
      path: new URL(request.url).pathname,
      duration,
    });

    throw error;
  }
}

/**
 * Helper to extract request context for logging
 */
export function getRequestContext(request: NextRequest) {
  return {
    method: request.method,
    path: new URL(request.url).pathname,
    userAgent: request.headers.get('user-agent'),
    ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
  };
}
