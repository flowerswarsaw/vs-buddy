/**
 * Test endpoint for verifying Sentry error tracking
 *
 * IMPORTANT: This endpoint should only be accessible in development!
 * Remove or protect this endpoint before deploying to production.
 *
 * Usage:
 * - GET /api/test/error?type=operational - Test operational error
 * - GET /api/test/error?type=programming - Test programming error
 * - GET /api/test/error?type=message - Test message capture
 */

import { NextRequest, NextResponse } from 'next/server';
import { captureError, captureMessage } from '@/lib/error-tracking';
import { AppError, ErrorCode } from '@/lib/errors';
import { log } from '@/lib/logger';

export async function GET(request: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Test endpoints are disabled in production' },
      { status: 404 }
    );
  }

  const { searchParams } = new URL(request.url);
  const errorType = searchParams.get('type') || 'operational';

  const requestId = crypto.randomUUID();

  log.info('Test error endpoint called', {
    requestId,
    errorType,
  });

  try {
    switch (errorType) {
      case 'operational': {
        // Test operational error (expected errors, lower severity in Sentry)
        const operationalError = new AppError(
          'This is a test operational error',
          ErrorCode.VALIDATION_ERROR,
          400,
          true, // isOperational
          { requestId }
        );

        captureError(operationalError, {
          level: 'warning',
          tags: {
            test: 'true',
            errorType: 'operational',
          },
          extra: {
            description: 'Testing operational error capture',
          },
        });

        return NextResponse.json({
          success: true,
          message: 'Operational error sent to Sentry',
          errorType: 'operational',
          requestId,
        });
      }

      case 'programming': {
        // Test programming error (unexpected errors, high severity in Sentry)
        const programmingError = new Error('This is a test programming error');

        captureError(programmingError, {
          level: 'error',
          tags: {
            test: 'true',
            errorType: 'programming',
          },
          extra: {
            description: 'Testing programming error capture',
            requestId,
          },
        });

        return NextResponse.json({
          success: true,
          message: 'Programming error sent to Sentry',
          errorType: 'programming',
          requestId,
        });
      }

      case 'message': {
        // Test message capture (not an error, just informational)
        captureMessage('This is a test message from the error test endpoint', 'info');

        return NextResponse.json({
          success: true,
          message: 'Message sent to Sentry',
          errorType: 'message',
          requestId,
        });
      }

      case 'fatal': {
        // Test fatal error that would crash the application
        captureError(new Error('Test fatal error'), {
          level: 'fatal',
          tags: {
            test: 'true',
            errorType: 'fatal',
          },
        });

        return NextResponse.json({
          success: true,
          message: 'Fatal error sent to Sentry',
          errorType: 'fatal',
          requestId,
        });
      }

      case 'throw': {
        // Actually throw an error to test automatic error capture
        log.warn('About to throw test error', { requestId });
        throw new Error('This error was intentionally thrown for testing');
      }

      default:
        return NextResponse.json({
          error: 'Invalid error type',
          validTypes: ['operational', 'programming', 'message', 'fatal', 'throw'],
        }, { status: 400 });
    }
  } catch (error) {
    // This will be caught by Next.js error handling and logged
    log.error('Test error endpoint threw error', error, { requestId });
    throw error;
  }
}
