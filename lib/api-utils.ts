/**
 * API utilities for VS Buddy
 * Provides reusable patterns for API routes (authentication, error handling, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { handleApiError } from './error-handler';
import { AuthError, ErrorCode } from './errors';
import type { Role } from '@prisma/client';

/**
 * Session type for authenticated handlers
 */
export interface ApiSession {
  user: {
    id: string;
    email: string;
    name?: string | null;
    role: Role;
  };
}

/**
 * Next.js 15+ route context with Promise-based params
 */
export interface RouteContext<P = Record<string, string>> {
  params: Promise<P>;
}

/**
 * Type for API route handlers (Next.js 15+ compatible)
 */
export type ApiHandler<T = unknown, P = Record<string, string>> = (
  request: NextRequest,
  context: RouteContext<P>
) => Promise<NextResponse<T>>;

/**
 * Type for authenticated API route handlers (with session)
 */
export type AuthenticatedApiHandler<T = unknown, P = Record<string, string>> = (
  request: NextRequest,
  session: ApiSession,
  context?: RouteContext<P>
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
export function withAuth<T = unknown, P = Record<string, string>>(
  handler: AuthenticatedApiHandler<T, P>
): ApiHandler<T, P> {
  return async (request, context) => {
    try {
      const session = await auth();

      if (!session || !session.user) {
        throw new AuthError('Unauthorized', ErrorCode.UNAUTHORIZED, {
          path: request.nextUrl.pathname,
          method: request.method,
        });
      }

      // Cast session to ApiSession (auth callback ensures user has required fields)
      const apiSession: ApiSession = {
        user: {
          id: session.user.id,
          email: session.user.email!,
          name: session.user.name,
          role: session.user.role,
        },
      };

      return await handler(request, apiSession, context);
    } catch (error) {
      return handleApiError(error, {
        path: request.nextUrl.pathname,
        method: request.method,
      }) as NextResponse<T>;
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
export function withAdminAuth<T = unknown, P = Record<string, string>>(
  handler: AuthenticatedApiHandler<T, P>
): ApiHandler<T, P> {
  return async (request, context) => {
    let apiSession: ApiSession | undefined;
    try {
      const session = await auth();

      if (!session || !session.user) {
        throw new AuthError('Unauthorized', ErrorCode.UNAUTHORIZED, {
          path: request.nextUrl.pathname,
          method: request.method,
        });
      }

      // Check if user is admin
      if (session.user.role !== 'ADMIN') {
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

      // Cast session to ApiSession (auth callback ensures user has required fields)
      apiSession = {
        user: {
          id: session.user.id,
          email: session.user.email!,
          name: session.user.name,
          role: session.user.role,
        },
      };

      return await handler(request, apiSession, context);
    } catch (error) {
      return handleApiError(error, {
        userId: apiSession?.user?.id,
        path: request.nextUrl.pathname,
        method: request.method,
      }) as NextResponse<T>;
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
