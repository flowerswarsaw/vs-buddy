/**
 * Sentry configuration for client-side (browser)
 * This file is imported by Next.js automatically
 */

import { initSentry } from './lib/error-tracking';

initSentry({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1, // 10% of transactions in production
});
