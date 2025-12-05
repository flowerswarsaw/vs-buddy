/**
 * Error tracking with Sentry
 * Provides real-time error monitoring and alerts
 */

import * as Sentry from '@sentry/nextjs';
import type { AppError } from './errors';

/**
 * Initialize Sentry (called from configuration files)
 */
export function initSentry(options: {
  dsn?: string;
  environment?: string;
  tracesSampleRate?: number;
  beforeSend?: (event: Sentry.ErrorEvent, hint: Sentry.EventHint) => Sentry.ErrorEvent | null;
}) {
  const dsn = options.dsn || process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

  // Skip initialization if DSN is not provided
  if (!dsn) {
    console.log('[Sentry] DSN not configured, skipping initialization');
    return;
  }

  Sentry.init({
    dsn,
    environment: options.environment || process.env.NODE_ENV || 'development',

    // Performance monitoring
    tracesSampleRate: options.tracesSampleRate ?? 0.1, // 10% of transactions

    // Filter sensitive data before sending
    beforeSend: options.beforeSend || filterSensitiveData,

    // Don't send errors in test environment
    enabled: process.env.NODE_ENV !== 'test',

    // Integration settings
    integrations: [
      // Deduplicate errors
      Sentry.dedupeIntegration(),
    ],

    // Ignore common non-critical errors
    ignoreErrors: [
      // Browser extensions
      'top.GLOBALS',
      'chrome-extension://',
      'moz-extension://',

      // Network errors that are expected
      'NetworkError',
      'Network request failed',

      // Auth errors (these are operational)
      'JWTSessionError',
    ],
  });

  console.log('[Sentry] Initialized successfully');
}

/**
 * Filter sensitive data from error reports
 */
function filterSensitiveData(
  event: Sentry.ErrorEvent,
  hint: Sentry.EventHint
): Sentry.ErrorEvent | null {
  // Remove sensitive query parameters
  if (event.request?.query_string) {
    const params = new URLSearchParams(event.request.query_string);

    // List of sensitive parameters to redact
    const sensitiveParams = [
      'password',
      'token',
      'apiKey',
      'api_key',
      'authorization',
      'secret',
    ];

    sensitiveParams.forEach((param) => {
      if (params.has(param)) {
        params.set(param, '[REDACTED]');
      }
    });

    event.request.query_string = params.toString();
  }

  // Remove sensitive headers
  if (event.request?.headers) {
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];

    sensitiveHeaders.forEach((header) => {
      if (event.request?.headers?.[header]) {
        event.request.headers[header] = '[REDACTED]';
      }
    });
  }

  // Remove sensitive body data
  if (event.request?.data) {
    const data = typeof event.request.data === 'string'
      ? JSON.parse(event.request.data)
      : event.request.data;

    const sensitiveFields = ['password', 'token', 'apiKey', 'api_key'];

    sensitiveFields.forEach((field) => {
      if (data[field]) {
        data[field] = '[REDACTED]';
      }
    });

    event.request.data = data;
  }

  return event;
}

/**
 * Set user context for error tracking
 */
export function setUserContext(user: {
  id: string;
  email?: string;
  name?: string;
  role?: string;
}) {
  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.name,
    role: user.role,
  });
}

/**
 * Clear user context (e.g., on logout)
 */
export function clearUserContext() {
  Sentry.setUser(null);
}

/**
 * Set request context for error tracking
 */
export function setRequestContext(context: {
  requestId?: string;
  path?: string;
  method?: string;
  userAgent?: string;
  ip?: string;
}) {
  Sentry.setContext('request', {
    requestId: context.requestId,
    path: context.path,
    method: context.method,
    userAgent: context.userAgent,
    ip: context.ip,
  });
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(breadcrumb: {
  message: string;
  category?: string;
  level?: 'debug' | 'info' | 'warning' | 'error';
  data?: Record<string, any>;
}) {
  Sentry.addBreadcrumb({
    message: breadcrumb.message,
    category: breadcrumb.category || 'custom',
    level: breadcrumb.level || 'info',
    data: breadcrumb.data,
    timestamp: Date.now() / 1000,
  });
}

/**
 * Capture an error and send to Sentry
 */
export function captureError(
  error: Error | AppError,
  context?: {
    level?: 'fatal' | 'error' | 'warning' | 'info';
    tags?: Record<string, string>;
    extra?: Record<string, any>;
  }
) {
  // Don't send errors if Sentry is not initialized
  if (!Sentry.isInitialized()) {
    return null;
  }

  // Set level (default to error)
  const level = context?.level || 'error';

  // Set tags for filtering
  if (context?.tags) {
    Object.entries(context.tags).forEach(([key, value]) => {
      Sentry.setTag(key, value);
    });
  }

  // Add extra context
  if (context?.extra) {
    Object.entries(context.extra).forEach(([key, value]) => {
      Sentry.setExtra(key, value);
    });
  }

  // Handle AppError differently
  if ('isOperational' in error && error.isOperational) {
    // Operational errors are lower severity
    Sentry.captureException(error, {
      level: 'warning',
      tags: {
        errorType: 'operational',
        errorCode: (error as any).code,
      },
    });
  } else {
    // Programming errors are critical
    Sentry.captureException(error, {
      level,
      tags: {
        errorType: 'programming',
      },
    });
  }

  return Sentry.lastEventId();
}

/**
 * Capture a message (not an error)
 */
export function captureMessage(
  message: string,
  level: 'debug' | 'info' | 'warning' | 'error' | 'fatal' = 'info'
) {
  if (!Sentry.isInitialized()) {
    return null;
  }

  return Sentry.captureMessage(message, level);
}

/**
 * Start a transaction for performance monitoring
 * Note: Not available in Edge runtime
 */
export function startTransaction(
  name: string,
  op: string
): any | undefined {
  if (!Sentry.isInitialized()) {
    return undefined;
  }

  // startTransaction is not available in Edge runtime
  if (typeof (Sentry as any).startTransaction === 'function') {
    return (Sentry as any).startTransaction({
      name,
      op,
    });
  }

  return undefined;
}

/**
 * Wrap an async function with Sentry error tracking
 */
export function withSentryTracking<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options?: {
    name?: string;
    op?: string;
  }
): T {
  return (async (...args: any[]) => {
    const transaction = startTransaction(
      options?.name || fn.name || 'anonymous',
      options?.op || 'function'
    );

    try {
      const result = await fn(...args);
      transaction?.setStatus?.('ok');
      return result;
    } catch (error) {
      transaction?.setStatus?.('internal_error');
      captureError(error as Error);
      throw error;
    } finally {
      transaction?.finish?.();
    }
  }) as T;
}

export default {
  init: initSentry,
  setUserContext,
  clearUserContext,
  setRequestContext,
  addBreadcrumb,
  captureError,
  captureMessage,
  startTransaction,
  withSentryTracking,
};
