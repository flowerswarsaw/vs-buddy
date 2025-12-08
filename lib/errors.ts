/**
 * Custom error classes for VS Buddy
 * Provides structured error handling with context and error codes
 */

export enum ErrorCode {
  // Database errors (1xxx)
  DATABASE_CONNECTION_ERROR = 1001,
  DATABASE_QUERY_ERROR = 1002,
  DATABASE_TRANSACTION_ERROR = 1003,

  // OpenAI errors (2xxx)
  OPENAI_API_ERROR = 2001,
  OPENAI_RATE_LIMIT = 2002,
  OPENAI_TIMEOUT = 2003,
  OPENAI_INVALID_REQUEST = 2004,
  OPENAI_AUTHENTICATION_ERROR = 2005,

  // Ollama errors (25xx)
  OLLAMA_API_ERROR = 2501,
  OLLAMA_CONNECTION_ERROR = 2502,
  OLLAMA_TIMEOUT = 2503,
  OLLAMA_MODEL_NOT_FOUND = 2504,

  // Validation errors (3xxx)
  VALIDATION_ERROR = 3001,
  INVALID_INPUT = 3002,
  FILE_TOO_LARGE = 3003,
  INVALID_FILE_TYPE = 3004,

  // Authentication errors (4xxx)
  UNAUTHORIZED = 4001,
  FORBIDDEN = 4003,
  SESSION_EXPIRED = 4004,
  INVALID_CREDENTIALS = 4005,

  // Business logic errors (5xxx)
  RESOURCE_NOT_FOUND = 5001,
  DUPLICATE_RESOURCE = 5002,
  OPERATION_FAILED = 5003,

  // System errors (9xxx)
  INTERNAL_SERVER_ERROR = 9001,
  SERVICE_UNAVAILABLE = 9002,
  CONFIGURATION_ERROR = 9003,
}

export interface ErrorContext {
  userId?: string;
  requestId?: string;
  path?: string;
  method?: string;
  timestamp?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Base application error class
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly context: ErrorContext;

  constructor(
    message: string,
    code: ErrorCode,
    statusCode: number = 500,
    isOperational: boolean = true,
    context: ErrorContext = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.context = {
      ...context,
      timestamp: new Date(),
    };

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      context: this.context,
    };
  }
}

/**
 * Database-related errors
 */
export class DatabaseError extends AppError {
  constructor(message: string, context: ErrorContext = {}, originalError?: Error) {
    super(
      message,
      ErrorCode.DATABASE_QUERY_ERROR,
      500,
      true,
      {
        ...context,
        metadata: {
          ...context.metadata,
          originalError: originalError?.message,
        },
      }
    );
  }
}

/**
 * OpenAI API-related errors
 */
export class OpenAIError extends AppError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.OPENAI_API_ERROR,
    context: ErrorContext = {},
    originalError?: Error
  ) {
    const statusCode = code === ErrorCode.OPENAI_RATE_LIMIT ? 429 : 500;
    super(
      message,
      code,
      statusCode,
      true,
      {
        ...context,
        metadata: {
          ...context.metadata,
          originalError: originalError?.message,
        },
      }
    );
  }
}

/**
 * Ollama API-related errors
 */
export class OllamaError extends AppError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.OLLAMA_API_ERROR,
    context: ErrorContext = {},
    originalError?: Error
  ) {
    super(
      message,
      code,
      500,
      true,
      {
        ...context,
        metadata: {
          ...context.metadata,
          originalError: originalError?.message,
        },
      }
    );
  }
}

/**
 * Validation errors
 */
export class ValidationError extends AppError {
  constructor(message: string, context: ErrorContext = {}, details?: unknown) {
    super(
      message,
      ErrorCode.VALIDATION_ERROR,
      400,
      true,
      {
        ...context,
        metadata: {
          ...context.metadata,
          validationDetails: details,
        },
      }
    );
  }
}

/**
 * Authentication/Authorization errors
 */
export class AuthError extends AppError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNAUTHORIZED,
    context: ErrorContext = {}
  ) {
    const statusCode = code === ErrorCode.FORBIDDEN ? 403 : 401;
    super(message, code, statusCode, true, context);
  }
}

/**
 * Resource not found error
 */
export class NotFoundError extends AppError {
  constructor(resource: string, context: ErrorContext = {}) {
    super(
      `${resource} not found`,
      ErrorCode.RESOURCE_NOT_FOUND,
      404,
      true,
      context
    );
  }
}

/**
 * Rate limit exceeded error
 */
export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded', context: ErrorContext = {}) {
    super(message, ErrorCode.OPENAI_RATE_LIMIT, 429, true, context);
  }
}

/**
 * File upload errors
 */
export class FileUploadError extends AppError {
  constructor(message: string, code: ErrorCode, context: ErrorContext = {}) {
    super(message, code, 400, true, context);
  }
}
