# Sentry Error Tracking Setup Guide

This guide explains how to configure Sentry for real-time error tracking and monitoring in VS Buddy.

## Overview

Sentry integration is already fully implemented in VS Buddy. You just need to configure your Sentry DSN to start tracking errors.

**What's already implemented:**
-  @sentry/nextjs SDK installed (v10.28.0)
-  Client, server, and edge runtime configuration files
-  Error tracking utilities (`/lib/error-tracking.ts`)
-  Integration with error handler
-  Sensitive data filtering
-  Breadcrumb tracking
-  User context tracking
-  Test endpoints for verification

---

## Quick Start

### 1. Create a Sentry Account

1. Go to [sentry.io](https://sentry.io/)
2. Sign up for a free account (100,000 errors/month free tier)
3. Create a new project
   - Platform: **Next.js**
   - Alert frequency: Choose your preference

### 2. Get Your DSN

After creating your project, Sentry will provide a DSN (Data Source Name) that looks like:

```
https://1234567890abcdef1234567890abcdef@o123456.ingest.sentry.io/7654321
```

### 3. Configure Environment Variables

Add your Sentry DSN to your `.env.local` file:

```bash
# Server-side error tracking
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id

# Client-side error tracking (browser)
NEXT_PUBLIC_SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
```

**Note:** You can use the same DSN for both server and client, or use separate DSNs for more granular control.

### 4. Restart Your Development Server

```bash
pnpm dev
```

You should see a log message:
```
[Sentry] Initialized successfully
```

---

## Verification

### Test Error Reporting

VS Buddy includes test endpoints to verify Sentry integration:

**Prerequisites:** You must be logged in as an admin user.

```bash
# Test operational error (lower severity)
curl http://localhost:3001/api/test/error?type=operational

# Test programming error (high severity)
curl http://localhost:3001/api/test/error?type=programming

# Test message capture
curl http://localhost:3001/api/test/error?type=message

# Test fatal error
curl http://localhost:3001/api/test/error?type=fatal

# Test thrown error (caught by Next.js error boundary)
curl http://localhost:3001/api/test/error?type=throw
```

**Expected behavior:**
- Errors appear in your Sentry dashboard within seconds
- Errors include context (requestId, tags, user info)
- Sensitive data (passwords, tokens) is redacted

---

## Configuration Details

### Configuration Files

Sentry is configured through three files:

1. **`sentry.client.config.ts`** - Browser/client-side errors
2. **`sentry.server.config.ts`** - Node.js/server-side errors
3. **`sentry.edge.config.ts`** - Edge runtime/middleware errors

All three files use the same initialization function from `/lib/error-tracking.ts`.

### Trace Sampling

By default, Sentry captures **10% of performance transactions** to avoid excessive data:

```typescript
tracesSampleRate: 0.1
```

To adjust:
- **Development:** Set to `1.0` (100%) for full visibility
- **Production:** Keep at `0.1` or lower to manage quota

### Sensitive Data Filtering

The following data is automatically redacted:

**Query Parameters:**
- `password`, `token`, `apiKey`, `api_key`, `authorization`, `secret`

**Headers:**
- `authorization`, `cookie`, `x-api-key`

**Request Body:**
- `password`, `token`, `apiKey`, `api_key`

See `/lib/error-tracking.ts` for the full implementation.

### Ignored Errors

These errors are NOT sent to Sentry (to reduce noise):

- Browser extension errors (`chrome-extension://`, `moz-extension://`)
- Network errors (`NetworkError`, `Network request failed`)
- Auth errors (`JWTSessionError`) - these are operational

---

## Usage in Code

### Capture Errors

```typescript
import { captureError } from '@/lib/error-tracking';

try {
  // Your code
} catch (error) {
  captureError(error as Error, {
    level: 'error',
    tags: {
      feature: 'chat',
      userId: user.id,
    },
    extra: {
      conversationId: conversationId,
      messageCount: messages.length,
    },
  });

  throw error;
}
```

### Capture Messages

```typescript
import { captureMessage } from '@/lib/error-tracking';

captureMessage('Unusual behavior detected', 'warning');
```

### Add Breadcrumbs

```typescript
import { addBreadcrumb } from '@/lib/error-tracking';

addBreadcrumb({
  message: 'User clicked export button',
  category: 'user-action',
  level: 'info',
  data: {
    conversationId: id,
  },
});
```

### Set User Context

```typescript
import { setUserContext } from '@/lib/error-tracking';

setUserContext({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
});
```

---

## Production Best Practices

### 1. Environment Variables

Use different DSNs for different environments:

```bash
# .env.production
SENTRY_DSN=https://prod-dsn@sentry.io/prod-project

# .env.development
SENTRY_DSN=https://dev-dsn@sentry.io/dev-project
```

### 2. Source Maps

For better error debugging, upload source maps to Sentry:

```bash
# Install Sentry CLI
npm install -g @sentry/cli

# Configure auth token
export SENTRY_AUTH_TOKEN=your-auth-token

# Upload source maps after build
sentry-cli sourcemaps upload --org your-org --project your-project ./build
```

### 3. Release Tracking

Tag errors with release versions:

```typescript
// sentry.server.config.ts
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  release: process.env.VERCEL_GIT_COMMIT_SHA || 'development',
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
});
```

### 4. Alerts

Configure alerts in Sentry dashboard:
- **Slack/Email** when error rate spikes
- **PagerDuty** for critical errors
- **Weekly digest** for error trends

### 5. Performance Monitoring

Enable performance monitoring for slow transactions:

```typescript
// Increase sample rate in production if needed
tracesSampleRate: 0.2, // 20% of transactions
```

---

## Troubleshooting

### No errors appearing in Sentry

**Check:**
1. DSN is correctly set in `.env.local`
2. Server was restarted after adding DSN
3. You see `[Sentry] Initialized successfully` in logs
4. You're not in test environment (`NODE_ENV !== 'test'`)

### Too many errors

**Solutions:**
1. Increase `ignoreErrors` list in `/lib/error-tracking.ts`
2. Adjust `beforeSend` filter to drop non-critical errors
3. Lower `tracesSampleRate` to reduce performance transactions

### Source maps not working

**Solutions:**
1. Upload source maps using Sentry CLI
2. Configure `SENTRY_AUTH_TOKEN` in CI/CD
3. Enable source maps in Next.js config:
   ```typescript
   // next.config.ts
   const nextConfig = {
     productionBrowserSourceMaps: true,
   };
   ```

---

## Cost Management

**Sentry free tier:**
- 100,000 errors per month
- 10,000 performance transactions per month

**To stay within limits:**
1. Set `tracesSampleRate` to 0.1 or lower
2. Filter out non-critical errors in `beforeSend`
3. Add common operational errors to `ignoreErrors`
4. Monitor quota usage in Sentry dashboard

---

## Additional Resources

- [Sentry Next.js Documentation](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Sentry Error Filtering](https://docs.sentry.io/platforms/javascript/configuration/filtering/)
- [Sentry Best Practices](https://docs.sentry.io/product/best-practices/)

---

## Support

If you encounter issues:
1. Check this documentation first
2. Review `/lib/error-tracking.ts` implementation
3. Check Sentry dashboard for DSN/project configuration
4. Test with `/api/test/error` endpoints (requires auth)
