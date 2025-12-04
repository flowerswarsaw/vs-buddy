import { NextRequest, NextResponse } from 'next/server';
import { embedText, searchRelevantChunks, getRetrievalStats } from '@/lib/rag';
import { config } from '@/lib/config';
import type { SearchOptions } from '@/lib/types';

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
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, options = {} } = body;

    // Validate inputs
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'query is required and must be a non-empty string' },
        { status: 400 }
      );
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
    const queryEmbedding = await embedText(query.trim());
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
  } catch (error) {
    console.error('Error in RAG test:', error);

    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        return NextResponse.json(
          { error: 'OpenAI API key is invalid or missing' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to test RAG retrieval' },
      { status: 500 }
    );
  }
}
