/**
 * API utilities for VS Buddy
 * Provides reusable patterns for API routes (authentication, error handling, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { handleApiError } from './error-handler';
import { AuthError, ErrorCode } from './errors';

/**
 * Type for API route handlers
 */
export type ApiHandler<T = unknown> = (
  request: NextRequest,
  context?: { params?: Record<string, string | string[]> }
) => Promise<NextResponse<T>>;

/**
 * Type for authenticated API route handlers (with session)
 */
export type AuthenticatedApiHandler<T = unknown> = (
  request: NextRequest,
  session: NonNullable<Awaited<ReturnType<typeof auth>>>,
  context?: { params?: Record<string, string | string[]> }
) => Promise<NextResponse<T>>;

/**
 * Middleware to check if user is authenticated
 * Wraps route handler to automatically check authentication
 *
 * Usage:
 * export const GET = withAuth(async (request, session) => {
 *   // session is guaranteed to be present
 *   return NextResponse.json({ userId: session.user.id });
 * });
 */
export function withAuth<T = unknown>(
  handler: AuthenticatedApiHandler<T>
): ApiHandler<T> {
  return async (request, context) => {
    try {
      const session = await auth();

      if (!session || !session.user) {
        throw new AuthError('Unauthorized', ErrorCode.UNAUTHORIZED, {
          path: request.nextUrl.pathname,
          method: request.method,
        });
      }

      return await handler(request, session, context);
    } catch (error) {
      return handleApiError(error, {
        path: request.nextUrl.pathname,
        method: request.method,
      });
    }
  };
}

/**
 * Middleware to check if user is authenticated AND is an admin
 * Wraps route handler to automatically check authentication + admin role
 *
 * Usage:
 * export const POST = withAdminAuth(async (request, session) => {
 *   // session is guaranteed to be present and user is admin
 *   return NextResponse.json({ message: 'Admin access granted' });
 * });
 */
export function withAdminAuth<T = unknown>(
  handler: AuthenticatedApiHandler<T>
): ApiHandler<T> {
  return async (request, context) => {
    try {
      const session = await auth();

      if (!session || !session.user) {
        throw new AuthError('Unauthorized', ErrorCode.UNAUTHORIZED, {
          path: request.nextUrl.pathname,
          method: request.method,
        });
      }

      // Check if user is admin
      if (session.user.role !== 'admin') {
        throw new AuthError(
          'Forbidden: Admin access required',
          ErrorCode.FORBIDDEN,
          {
            userId: session.user.id,
            path: request.nextUrl.pathname,
            method: request.method,
          }
        );
      }

      return await handler(request, session, context);
    } catch (error) {
      return handleApiError(error, {
        userId: session?.user?.id,
        path: request.nextUrl.pathname,
        method: request.method,
      });
    }
  };
}

/**
 * Generate a unique request ID for tracking
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Parse and validate JSON body from request
 * Throws ValidationError if body is invalid
 */
export async function parseJsonBody<T = unknown>(
  request: NextRequest
): Promise<T> {
  try {
    const body = await request.json();
    return body as T;
  } catch (error) {
    throw new AuthError('Invalid JSON body', ErrorCode.INVALID_INPUT, {
      path: request.nextUrl.pathname,
      method: request.method,
    });
  }
}
