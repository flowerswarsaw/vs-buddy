/**
 * Request logging middleware for Next.js API routes
 *
 * Provides automatic request/response logging with:
 * - Request ID generation
 * - Duration tracking
 * - User context
 * - Error logging
 */

import { NextRequest, NextResponse } from 'next/server';
import { logRequest, logResponse, createChildLogger } from '@/lib/logger';
import { auth } from '@/lib/auth';

/**
 * Wrapper for API route handlers with automatic logging
 *
 * Usage:
 * ```ts
 * export const POST = withRequestLogging(async (request) => {
 *   // your handler code
 *   return NextResponse.json({ data });
 * });
 * ```
 */
export function withRequestLogging<T>(
  handler: (
    request: NextRequest,
    context?: { params: any }
  ) => Promise<NextResponse<T>>
) {
  return async (
    request: NextRequest,
    context?: { params: any }
  ): Promise<NextResponse<T>> => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const method = request.method;
    const path = new URL(request.url).pathname;

    // Get user session for context
    let userId: string | undefined;
    try {
      const session = await auth();
      userId = session?.user?.id;
    } catch {
      // Session retrieval failed, continue without user context
    }

    // Create request-scoped logger
    const requestLogger = createChildLogger({
      requestId,
      method,
      path,
      userId,
    });

    // Log incoming request
    logRequest({
      requestId,
      method,
      path,
      userId,
      userAgent: request.headers.get('user-agent') || undefined,
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
    });

    try {
      // Execute handler
      const response = await handler(request, context);

      // Log successful response
      const durationMs = Date.now() - startTime;
      logResponse({
        requestId,
        method,
        path,
        statusCode: response.status,
        durationMs,
        userId,
      });

      // Add request ID to response headers
      response.headers.set('X-Request-ID', requestId);

      return response;
    } catch (error) {
      // Log error response
      const durationMs = Date.now() - startTime;
      const statusCode = error instanceof Error && 'statusCode' in error
        ? (error as any).statusCode
        : 500;

      requestLogger.error(
        {
          error:
            error instanceof Error
              ? {
                  message: error.message,
                  stack: error.stack,
                  name: error.name,
                }
              : error,
          requestId,
          method,
          path,
          statusCode,
          durationMs,
          userId,
        },
        `Request failed - ${method} ${path}`
      );

      // Re-throw to let Next.js error handling take over
      throw error;
    }
  };
}

/**
 * Simple request logger for functions that don't return responses directly
 * Useful for utility functions that need request context
 */
export function getRequestLogger(requestId?: string) {
  return createChildLogger({
    requestId: requestId || crypto.randomUUID(),
  });
}
