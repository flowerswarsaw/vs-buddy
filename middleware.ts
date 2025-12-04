import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

/**
 * Security headers configuration
 */
function addSecurityHeaders(response: NextResponse): NextResponse {
  const headers = response.headers;

  // Prevent clickjacking attacks
  headers.set('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  headers.set('X-Content-Type-Options', 'nosniff');

  // Control referrer information
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Restrict feature access
  headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  );

  // Content Security Policy
  // Note: This is a strict policy - adjust as needed for your app
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // unsafe-inline needed for Next.js
    "style-src 'self' 'unsafe-inline'", // unsafe-inline needed for styled components
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.openai.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  headers.set('Content-Security-Policy', cspDirectives.join('; '));

  // Strict Transport Security (HTTPS only) - only in production
  if (process.env.NODE_ENV === 'production') {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // XSS Protection (legacy browsers)
  headers.set('X-XSS-Protection', '1; mode=block');

  return response;
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const isAdmin = req.auth?.user?.role === 'ADMIN';

  // Public routes - login page
  if (pathname.startsWith('/login')) {
    // Redirect to home if already logged in
    if (isLoggedIn) {
      const response = NextResponse.redirect(new URL('/', req.url));
      return addSecurityHeaders(response);
    }
    return addSecurityHeaders(NextResponse.next());
  }

  // Public API routes - auth and health checks
  if (pathname.startsWith('/api/auth') || pathname.startsWith('/api/health')) {
    return addSecurityHeaders(NextResponse.next());
  }

  // Require login for all other routes
  if (!isLoggedIn) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    const response = NextResponse.redirect(loginUrl);
    return addSecurityHeaders(response);
  }

  // Admin-only routes
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    if (!isAdmin) {
      // Non-admins get redirected to home
      const response = NextResponse.redirect(new URL('/', req.url));
      return addSecurityHeaders(response);
    }
  }

  return addSecurityHeaders(NextResponse.next());
});

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
