/**
 * Validation utilities for API routes
 * Provides helpers to validate and sanitize input data
 */

import { z, ZodError, ZodSchema } from 'zod';
import { NextRequest } from 'next/server';
import { ValidationError } from '@/lib/errors';

/**
 * Validation result type
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: ValidationError };

/**
 * Validate data against a Zod schema
 * Returns validation result with typed data or error
 */
export function validate<T>(
  schema: ZodSchema<T>,
  data: unknown,
  context?: Record<string, any>
): ValidationResult<T> {
  try {
    const parsed = schema.parse(data);
    return { success: true, data: parsed };
  } catch (error) {
    if (error instanceof ZodError) {
      // Format Zod errors into readable messages
      const errors = error.errors || [];
      const messages = errors.length > 0
        ? errors.map((err) => {
            const path = err.path.join('.');
            return path ? `${path}: ${err.message}` : err.message;
          })
        : [error.message || 'Validation failed'];

      return {
        success: false,
        error: new ValidationError(
          messages.join('; '),
          {
            ...context,
            metadata: {
              ...context?.metadata,
              validationErrors: errors,
            },
          }
        ),
      };
    }

    // Unexpected error
    return {
      success: false,
      error: new ValidationError(
        'Validation failed',
        {
          ...context,
          metadata: {
            ...context?.metadata,
            error: error instanceof Error ? error.message : String(error),
          },
        }
      ),
    };
  }
}

/**
 * Validate and throw if invalid
 * Use this when you want to fail fast on validation errors
 */
export function validateOrThrow<T>(
  schema: ZodSchema<T>,
  data: unknown,
  context?: Record<string, any>
): T {
  const result = validate(schema, data, context);
  if (!result.success) {
    throw result.error;
  }
  return result.data;
}

/**
 * Validate JSON body from Next.js request
 */
export async function validateRequestBody<T>(
  request: NextRequest,
  schema: ZodSchema<T>,
  context?: Record<string, any>
): Promise<ValidationResult<T>> {
  try {
    const body = await request.json();
    return validate(schema, body, context);
  } catch (error) {
    return {
      success: false,
      error: new ValidationError(
        'Invalid JSON body',
        {
          ...context,
          metadata: {
            ...context?.metadata,
            error: error instanceof Error ? error.message : String(error),
          },
        }
      ),
    };
  }
}

/**
 * Validate query parameters from Next.js request
 */
export function validateSearchParams<T>(
  request: NextRequest,
  schema: ZodSchema<T>,
  context?: Record<string, any>
): ValidationResult<T> {
  try {
    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());
    return validate(schema, params, context);
  } catch (error) {
    return {
      success: false,
      error: new ValidationError(
        'Invalid query parameters',
        {
          ...context,
          metadata: {
            ...context?.metadata,
            error: error instanceof Error ? error.message : String(error),
          },
        }
      ),
    };
  }
}

/**
 * Sanitize HTML/XSS from string
 * Removes potentially dangerous HTML tags and attributes
 */
export function sanitizeString(input: string): string {
  if (!input) return input;

  // Basic XSS prevention - remove common attack vectors
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove <script> tags
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '') // Remove <iframe> tags
    .replace(/\b(href|src|action)\s*=\s*"javascript:[^"]*"/gi, '$1=""') // Remove javascript: protocol from double-quoted attributes
    .replace(/\b(href|src|action)\s*=\s*'javascript:[^']*'/gi, "$1=''") // Remove javascript: protocol from single-quoted attributes
    .replace(/on\w+\s*=\s*"[^"]*"/gi, '') // Remove event handlers with double quotes
    .replace(/on\w+\s*=\s*'[^']*'/gi, '') // Remove event handlers with single quotes
    .replace(/on\w+\s*=\s*[^\s>]*/gi, '') // Remove event handlers without quotes
    .trim();
}

/**
 * Sanitize object - recursively sanitize all string values
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  const sanitized = { ...obj };

  for (const key in sanitized) {
    const value = sanitized[key];

    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value) as any;
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeObject(value) as any;
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) =>
        typeof item === 'string'
          ? sanitizeString(item)
          : typeof item === 'object' && item !== null
          ? sanitizeObject(item)
          : item
      ) as any;
    }
  }

  return sanitized;
}

/**
 * Validate and sanitize (combines validation + XSS protection)
 */
export function validateAndSanitize<T>(
  schema: ZodSchema<T>,
  data: unknown,
  context?: Record<string, any>
): ValidationResult<T> {
  const result = validate(schema, data, context);

  if (!result.success) {
    return result;
  }

  // Sanitize the validated data
  const sanitized = typeof result.data === 'object' && result.data !== null
    ? sanitizeObject(result.data as Record<string, any>)
    : result.data;

  return { success: true, data: sanitized as T };
}

/**
 * Create a validated route handler
 * Wraps an API route handler with automatic validation
 *
 * @example
 * export const POST = withValidation(
 *   chatRequestSchema,
 *   async (request, validatedData) => {
 *     // validatedData is typed and validated
 *     const { conversationId, message } = validatedData;
 *     // ... handle request
 *   }
 * );
 */
export function withValidation<T>(
  schema: ZodSchema<T>,
  handler: (request: NextRequest, data: T) => Promise<Response>,
  options: {
    sanitize?: boolean;
    source?: 'body' | 'searchParams';
  } = {}
) {
  const { sanitize = true, source = 'body' } = options;

  return async (request: NextRequest): Promise<Response> => {
    try {
      let result: ValidationResult<T>;

      if (source === 'body') {
        const body = await request.json();
        result = sanitize
          ? validateAndSanitize(schema, body, { path: request.nextUrl.pathname })
          : validate(schema, body, { path: request.nextUrl.pathname });
      } else {
        result = sanitize
          ? validateAndSanitize(schema, Object.fromEntries(request.nextUrl.searchParams), {
              path: request.nextUrl.pathname,
            })
          : validate(schema, Object.fromEntries(request.nextUrl.searchParams), {
              path: request.nextUrl.pathname,
            });
      }

      if (!result.success) {
        throw result.error;
      }

      return await handler(request, result.data);
    } catch (error) {
      // Error will be handled by the API route's error handling
      throw error;
    }
  };
}
