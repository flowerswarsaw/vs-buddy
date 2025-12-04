import { NextRequest, NextResponse } from 'next/server';
import { embedText, searchRelevantChunks, getRetrievalStats } from '@/lib/rag';
import { config } from '@/lib/config';
import type { SearchOptions } from '@/lib/types';
import { withAdminAuth } from '@/lib/api-utils';
import { ValidationError, OpenAIError, ErrorCode } from '@/lib/errors';

/**
 * POST /api/admin/rag-test
 *
 * Test RAG retrieval without generating a response.
 * Useful for debugging and tuning search parameters.
 *
 * Request body:
 * {
 *   "query": "What is the refund policy?",
 *   "options": {
 *     "topK": 10,
 *     "minSimilarity": 0.5,
 *     "tags": ["policy"]
 *   }
 * }
 */
export const POST = withAdminAuth(async (request: NextRequest, session) => {
  const body = await request.json();
  const { query, options = {} } = body;

  // Validate inputs
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    throw new ValidationError('query is required and must be a non-empty string', {
      userId: session.user.id,
      path: request.nextUrl.pathname,
      method: request.method,
    });
  }

  // Merge with defaults
  const searchOptions: SearchOptions = {
    topK: options.topK ?? config.defaultTopK,
    minSimilarity: options.minSimilarity ?? config.minSimilarity,
    tags: options.tags,
    documentIds: options.documentIds,
  };

  // Time embedding generation
  const embedStart = performance.now();
  let queryEmbedding;
  try {
    queryEmbedding = await embedText(query.trim());
  } catch (error) {
    if (error instanceof Error && error.message.includes('API key')) {
      throw new OpenAIError(
        'OpenAI API key is invalid or missing',
        ErrorCode.OPENAI_AUTHENTICATION_ERROR,
        {
          userId: session.user.id,
          path: request.nextUrl.pathname,
          method: request.method,
        },
        error
      );
    }
    throw error;
  }
  const embedTime = performance.now() - embedStart;

  // Time search
  const searchStart = performance.now();
  const results = await searchRelevantChunks(queryEmbedding, searchOptions);
  const searchTime = performance.now() - searchStart;

  // Get stats
  const stats = getRetrievalStats(results);

  return NextResponse.json({
    query: query.trim(),
    options: searchOptions,
    timing: {
      embedding_ms: Math.round(embedTime),
      search_ms: Math.round(searchTime),
      total_ms: Math.round(embedTime + searchTime),
    },
    stats: {
      count: stats.count,
      avgSimilarity: Math.round(stats.avgSimilarity * 100) / 100,
      minSimilarity: Math.round(stats.minSimilarity * 100) / 100,
      maxSimilarity: Math.round(stats.maxSimilarity * 100) / 100,
      documents: stats.documents,
    },
    results: results.map((r) => ({
      id: r.id,
      documentId: r.documentId,
      documentTitle: r.documentTitle,
      similarity: Math.round(r.similarity * 100) / 100,
      content: r.content,
    })),
  });
});
