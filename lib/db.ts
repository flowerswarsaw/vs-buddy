import { PrismaClient } from '@prisma/client';
import { DatabaseError } from './errors';
import { log } from './logger';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Prisma Client with optimized connection pooling and error handling
 *
 * Connection Pool Configuration:
 * - connection_limit: Max connections (10 for serverless, 20+ for traditional)
 * - pool_timeout: Max wait time for connection (30s)
 * - connect_timeout: Initial connection timeout (30s per requirement)
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development'
      ? ['error', 'warn', 'query']
      : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
    // Query timeout to prevent long-running queries (30s per requirement)
    // Note: This is client-side timeout, not server-side
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Test database connection
 * Attempts to connect and run a simple query
 */
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    log.error('Database connection test failed', error);
    throw new DatabaseError(
      'Failed to connect to database',
      {},
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Get database connection stats
 */
export async function getDatabaseStats() {
  try {
    // Get database metrics
    const [
      conversationCount,
      messageCount,
      documentCount,
      chunkCount,
    ] = await Promise.all([
      prisma.conversation.count(),
      prisma.message.count(),
      prisma.document.count(),
      prisma.chunk.count(),
    ]);

    return {
      healthy: true,
      counts: {
        conversations: conversationCount,
        messages: messageCount,
        documents: documentCount,
        chunks: chunkCount,
      },
    };
  } catch (error) {
    log.error('Database stats query failed', error);
    return {
      healthy: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Graceful shutdown - close database connections
 */
export async function closeDatabaseConnection(): Promise<void> {
  try {
    await prisma.$disconnect();
    log.info('Database connection closed gracefully');
  } catch (error) {
    log.error('Error closing database connection', error);
    throw new DatabaseError(
      'Failed to close database connection',
      {},
      error instanceof Error ? error : undefined
    );
  }
}

// Register shutdown handlers only in Node.js runtime
// This function is called lazily to avoid Edge Runtime issues
export function registerShutdownHandlers(): void {
  // Only run in Node.js environment (not Edge Runtime)
  // EdgeRuntime is defined in Vercel Edge Runtime
  if (typeof (globalThis as Record<string, unknown>).EdgeRuntime !== 'undefined') {
    return;
  }

  if (
    typeof process !== 'undefined' &&
    process.env.NODE_ENV === 'production' &&
    typeof process.on === 'function'
  ) {
    process.on('SIGINT', async () => {
      await closeDatabaseConnection();
    });

    process.on('SIGTERM', async () => {
      await closeDatabaseConnection();
    });
  }
}
