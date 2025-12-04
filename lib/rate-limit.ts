/**
 * Rate limiting utilities
 * Prevents abuse by limiting the number of requests from a single IP/user
 */

import { NextRequest, NextResponse } from 'next/server';
import { RateLimitError } from './errors';

export interface RateLimitConfig {
  /**
   * Maximum number of requests allowed in the time window
   */
  maxRequests: number;

  /**
   * Time window in milliseconds
   */
  windowMs: number;

  /**
   * Optional message to return when rate limit is exceeded
   */
  message?: string;

  /**
   * Skip rate limiting based on request
   */
  skip?: (request: NextRequest) => boolean | Promise<boolean>;

  /**
   * Custom key generator for rate limiting
   * Defaults to IP address
   */
  keyGenerator?: (request: NextRequest) => string | Promise<string>;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * In-memory rate limit store
 * For production, use Redis or similar distributed cache
 */
class RateLimitStore {
  private store: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Clean up expired entries every minute
    if (typeof setInterval !== 'undefined') {
      this.cleanupInterval = setInterval(() => {
        this.cleanup();
      }, 60000);
    }
  }

  get(key: string): RateLimitEntry | undefined {
    const entry = this.store.get(key);
    if (entry && entry.resetAt > Date.now()) {
      return entry;
    }
    // Entry expired, remove it
    if (entry) {
      this.store.delete(key);
    }
    return undefined;
  }

  set(key: string, entry: RateLimitEntry): void {
    this.store.set(key, entry);
  }

  reset(key: string): void {
    this.store.delete(key);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetAt <= now) {
        this.store.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
  }
}

// Global store instance
const globalForRateLimit = globalThis as unknown as {
  rateLimitStore: RateLimitStore | undefined;
};

export const rateLimitStore =
  globalForRateLimit.rateLimitStore ?? new RateLimitStore();

if (process.env.NODE_ENV !== 'production') {
  globalForRateLimit.rateLimitStore = rateLimitStore;
}

/**
 * Get client identifier from request
 * Uses IP address, with fallback to a constant for local development
 */
function getClientIdentifier(request: NextRequest): string {
  // Try to get real IP from headers (for reverse proxies)
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    // Take the first IP in the list
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Fallback to request IP
  const ip = request.ip;
  if (ip) {
    return ip;
  }

  // For local development, use a constant
  return 'localhost';
}

/**
 * Check if request exceeds rate limit
 * Returns null if within limit, error response if exceeded
 */
export async function checkRateLimit(
  request: NextRequest,
  config: RateLimitConfig
): Promise<NextResponse | null> {
  // Check if we should skip rate limiting
  if (config.skip && (await config.skip(request))) {
    return null;
  }

  // Generate rate limit key
  const key = config.keyGenerator
    ? await config.keyGenerator(request)
    : getClientIdentifier(request);

  const rateLimitKey = `${request.nextUrl.pathname}:${key}`;

  // Get current rate limit entry
  const entry = rateLimitStore.get(rateLimitKey);
  const now = Date.now();

  if (!entry) {
    // First request in this window
    rateLimitStore.set(rateLimitKey, {
      count: 1,
      resetAt: now + config.windowMs,
    });
    return null;
  }

  // Check if limit exceeded
  if (entry.count >= config.maxRequests) {
    const resetIn = Math.ceil((entry.resetAt - now) / 1000);

    return NextResponse.json(
      {
        error: {
          message:
            config.message ||
            `Too many requests. Please try again in ${resetIn} seconds.`,
          code: 'RATE_LIMIT_EXCEEDED',
          details: {
            limit: config.maxRequests,
            windowMs: config.windowMs,
            resetAt: new Date(entry.resetAt).toISOString(),
          },
        },
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(resetIn),
          'X-RateLimit-Limit': String(config.maxRequests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.floor(entry.resetAt / 1000)),
        },
      }
    );
  }

  // Increment counter
  entry.count++;
  rateLimitStore.set(rateLimitKey, entry);

  // Return null (no error) with rate limit headers
  // Note: We can't modify headers on null response, so actual rate limit headers
  // should be added by the API route itself
  return null;
}

/**
 * Rate limit middleware wrapper for API routes
 *
 * @example
 * export const POST = withRateLimit(
 *   { maxRequests: 10, windowMs: 60000 },
 *   async (request) => {
 *     // Your handler code
 *     return NextResponse.json({ success: true });
 *   }
 * );
 */
export function withRateLimit(
  config: RateLimitConfig,
  handler: (request: NextRequest) => Promise<Response>
) {
  return async (request: NextRequest): Promise<Response> => {
    // Check rate limit
    const rateLimitResponse = await checkRateLimit(request, config);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Proceed with handler
    return await handler(request);
  };
}

/**
 * Predefined rate limit configs
 */
export const RateLimits = {
  // Strict limit for expensive operations (chat, embeddings)
  CHAT: {
    maxRequests: 20,
    windowMs: 60 * 1000, // 20 requests per minute
    message: 'Too many chat requests. Please wait before sending more messages.',
  },

  // Medium limit for document uploads
  UPLOAD: {
    maxRequests: 5,
    windowMs: 60 * 1000, // 5 uploads per minute
    message: 'Too many upload requests. Please wait before uploading more files.',
  },

  // Lenient limit for read operations
  READ: {
    maxRequests: 100,
    windowMs: 60 * 1000, // 100 requests per minute
  },

  // Very strict limit for auth operations (prevent brute force)
  AUTH: {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000, // 5 attempts per 15 minutes
    message: 'Too many authentication attempts. Please try again later.',
  },

  // Admin operations
  ADMIN: {
    maxRequests: 50,
    windowMs: 60 * 1000, // 50 requests per minute
  },
} as const satisfies Record<string, RateLimitConfig>;

/**
 * Reset rate limit for a specific key
 * Useful for testing or manual intervention
 */
export function resetRateLimit(request: NextRequest, pathname?: string): void {
  const key = getClientIdentifier(request);
  const path = pathname || request.nextUrl.pathname;
  rateLimitStore.reset(`${path}:${key}`);
}
