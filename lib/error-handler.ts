/**
 * Error handling utilities for VS Buddy
 * Provides consistent error responses and logging
 */

import { NextResponse } from 'next/server';
import { AppError, ErrorCode, ErrorContext } from './errors';
import { Prisma } from '@prisma/client';
import { log } from './logger';
import { captureError } from './error-tracking';

/**
 * Standard error response format
 */
export interface ErrorResponse {
  error: {
    message: string;
    code: ErrorCode;
    details?: unknown;
  };
  requestId?: string;
}

/**
 * Check if an error is an operational error (expected, safe to show to user)
 */
export function isOperationalError(error: Error): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Convert any error to AppError
 */
export function normalizeError(error: unknown, context: ErrorContext = {}): AppError {
  // Already an AppError
  if (error instanceof AppError) {
    return error;
  }

  // Prisma errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return handlePrismaError(error, context);
  }

  // Standard Error
  if (error instanceof Error) {
    return new AppError(
      error.message || 'An unexpected error occurred',
      ErrorCode.INTERNAL_SERVER_ERROR,
      500,
      false,
      {
        ...context,
        metadata: {
          ...context.metadata,
          originalError: error.message,
          stack: error.stack,
        },
      }
    );
  }

  // Unknown error type
  return new AppError(
    'An unexpected error occurred',
    ErrorCode.INTERNAL_SERVER_ERROR,
    500,
    false,
    {
      ...context,
      metadata: {
        ...context.metadata,
        unknownError: String(error),
      },
    }
  );
}

/**
 * Handle Prisma-specific errors
 */
function handlePrismaError(
  error: Prisma.PrismaClientKnownRequestError,
  context: ErrorContext
): AppError {
  const { code, meta } = error;

  switch (code) {
    case 'P2002':
      // Unique constraint violation
      return new AppError(
        'A record with this value already exists',
        ErrorCode.DUPLICATE_RESOURCE,
        409,
        true,
        {
          ...context,
          metadata: { ...context.metadata, fields: meta?.target },
        }
      );

    case 'P2025':
      // Record not found
      return new AppError(
        'The requested resource was not found',
        ErrorCode.RESOURCE_NOT_FOUND,
        404,
        true,
        context
      );

    case 'P2003':
      // Foreign key constraint violation
      return new AppError(
        'This operation would violate data integrity constraints',
        ErrorCode.DATABASE_QUERY_ERROR,
        400,
        true,
        context
      );

    default:
      // Generic database error
      return new AppError(
        'A database error occurred',
        ErrorCode.DATABASE_QUERY_ERROR,
        500,
        true,
        {
          ...context,
          metadata: {
            ...context.metadata,
            prismaCode: code,
            prismaMeta: meta,
          },
        }
      );
  }
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  error: AppError,
  includeDetails: boolean = false
): NextResponse<ErrorResponse> {
  const response: ErrorResponse = {
    error: {
      message: error.message,
      code: error.code,
    },
    requestId: error.context.requestId,
  };

  // Include additional details in development
  if (includeDetails && process.env.NODE_ENV === 'development') {
    response.error.details = {
      context: error.context,
      stack: error.stack,
    };
  }

  return NextResponse.json(response, { status: error.statusCode });
}

/**
 * Handle errors in API routes
 * Usage: return handleApiError(error, { userId, requestId })
 */
export function handleApiError(error: unknown, context: ErrorContext = {}): NextResponse {
  const appError = normalizeError(error, context);

  // Log error (in production, this would go to a logging service)
  logError(appError);

  // Return appropriate response
  const includeDetails = process.env.NODE_ENV === 'development';
  return createErrorResponse(appError, includeDetails);
}

/**
 * Log error with context
 * Uses structured logging and sends to Sentry for error tracking
 */
export function logError(error: AppError): void {
  const logContext = {
    errorCode: error.code,
    statusCode: error.statusCode,
    isOperational: error.isOperational,
    ...error.context,
  };

  if (error.isOperational) {
    // Operational errors are expected and can be logged at a lower level
    log.warn(`Operational error: ${error.message}`, logContext);

    // Send to Sentry with warning level
    captureError(error, {
      level: 'warning',
      tags: {
        errorCode: String(error.code),
        errorType: 'operational',
      },
      extra: logContext,
    });
  } else {
    // Programming errors should be logged at error level
    log.error(`Programming error: ${error.message}`, error, logContext);

    // Send to Sentry with error level
    captureError(error, {
      level: 'error',
      tags: {
        errorCode: String(error.code),
        errorType: 'programming',
      },
      extra: logContext,
    });
  }
}

/**
 * Async error wrapper for API routes
 * Wraps async route handlers to catch and handle errors consistently
 */
export function withErrorHandler<T extends (...args: any[]) => Promise<NextResponse>>(
  handler: T,
  context?: Partial<ErrorContext>
): T {
  return (async (...args: any[]) => {
    try {
      return await handler(...args);
    } catch (error) {
      return handleApiError(error, context);
    }
  }) as T;
}
