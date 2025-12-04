/**
 * Structured logging with Pino
 * Provides consistent logging across the application with request IDs and context
 */

import pino from 'pino';

/**
 * Log context interface
 */
export interface LogContext {
  requestId?: string;
  userId?: string;
  path?: string;
  method?: string;
  [key: string]: any;
}

/**
 * Create logger instance with environment-specific config
 */
const createLogger = () => {
  const isDevelopment = process.env.NODE_ENV !== 'production';

  return pino({
    level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),

    // Base context for all logs
    base: {
      env: process.env.NODE_ENV || 'development',
    },

    // Format timestamps
    timestamp: pino.stdTimeFunctions.isoTime,

    // Redact sensitive fields
    redact: {
      paths: [
        'password',
        'token',
        'apiKey',
        'authorization',
        'cookie',
        '*.password',
        '*.token',
        '*.apiKey',
        '*.authorization',
      ],
      censor: '[REDACTED]',
    },

    // Simple formatting for development (without pino-pretty transport to avoid worker thread issues)
    ...(isDevelopment && {
      formatters: {
        level: (label: string) => {
          return { level: label.toUpperCase() };
        },
      },
    }),
  });
};

// Global logger instance
const globalForLogger = globalThis as unknown as {
  logger: pino.Logger | undefined;
};

export const logger = globalForLogger.logger ?? createLogger();

if (process.env.NODE_ENV !== 'production') {
  globalForLogger.logger = logger;
}

/**
 * Create child logger with context
 * Useful for adding request-specific or user-specific context
 */
export function createChildLogger(context: LogContext): pino.Logger {
  return logger.child(context);
}

/**
 * Log with context helpers
 */
export const log = {
  /**
   * Debug level - detailed information for diagnosing problems
   */
  debug: (message: string, context?: LogContext) => {
    if (context) {
      logger.debug(context, message);
    } else {
      logger.debug(message);
    }
  },

  /**
   * Info level - informational messages about application flow
   */
  info: (message: string, context?: LogContext) => {
    if (context) {
      logger.info(context, message);
    } else {
      logger.info(message);
    }
  },

  /**
   * Warn level - warning messages for potentially harmful situations
   */
  warn: (message: string, context?: LogContext) => {
    if (context) {
      logger.warn(context, message);
    } else {
      logger.warn(message);
    }
  },

  /**
   * Error level - error messages for error events
   */
  error: (message: string, error?: Error | unknown, context?: LogContext) => {
    const logData = {
      ...context,
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            }
          : error,
    };

    logger.error(logData, message);
  },

  /**
   * Fatal level - severe error events that will lead the application to abort
   */
  fatal: (message: string, error?: Error | unknown, context?: LogContext) => {
    const logData = {
      ...context,
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            }
          : error,
    };

    logger.fatal(logData, message);
  },
};

/**
 * Request logger - logs HTTP requests with timing
 */
export function logRequest(context: {
  requestId: string;
  method: string;
  path: string;
  userId?: string;
  userAgent?: string;
  ip?: string;
}) {
  log.info('Incoming request', {
    requestId: context.requestId,
    method: context.method,
    path: context.path,
    userId: context.userId,
    userAgent: context.userAgent,
    ip: context.ip,
  });
}

/**
 * Response logger - logs HTTP responses with timing
 */
export function logResponse(context: {
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  userId?: string;
}) {
  const level = context.statusCode >= 500 ? 'error' : context.statusCode >= 400 ? 'warn' : 'info';

  logger[level](
    {
      requestId: context.requestId,
      method: context.method,
      path: context.path,
      statusCode: context.statusCode,
      durationMs: context.durationMs,
      userId: context.userId,
    },
    `Request completed - ${context.method} ${context.path} ${context.statusCode} (${context.durationMs}ms)`
  );
}

/**
 * Database query logger
 */
export function logDatabaseQuery(context: {
  requestId?: string;
  operation: string;
  table?: string;
  durationMs?: number;
  error?: Error;
}) {
  if (context.error) {
    log.error('Database query failed', context.error, {
      requestId: context.requestId,
      operation: context.operation,
      table: context.table,
      durationMs: context.durationMs,
    });
  } else {
    log.debug('Database query executed', {
      requestId: context.requestId,
      operation: context.operation,
      table: context.table,
      durationMs: context.durationMs,
    });
  }
}

/**
 * External API call logger (OpenAI, etc.)
 */
export function logExternalApiCall(context: {
  requestId?: string;
  service: string;
  operation: string;
  durationMs?: number;
  success: boolean;
  error?: Error;
  metadata?: Record<string, any>;
}) {
  if (!context.success && context.error) {
    log.error(`${context.service} API call failed`, context.error, {
      requestId: context.requestId,
      service: context.service,
      operation: context.operation,
      durationMs: context.durationMs,
      ...context.metadata,
    });
  } else {
    log.debug(`${context.service} API call completed`, {
      requestId: context.requestId,
      service: context.service,
      operation: context.operation,
      durationMs: context.durationMs,
      success: context.success,
      ...context.metadata,
    });
  }
}

export default logger;
