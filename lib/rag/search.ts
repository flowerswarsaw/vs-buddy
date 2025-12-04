import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { config } from '../config';
import type { ChunkSearchResult, SearchOptions } from '../types';
import { formatEmbeddingForPg } from './embed';

/**
 * Deduplicate chunks by removing those with similar content.
 * Uses first 100 chars as a signature to detect overlapping chunks.
 */
function deduplicateChunks(chunks: ChunkSearchResult[]): ChunkSearchResult[] {
  const seen = new Set<string>();
  return chunks.filter((chunk) => {
    // Normalize content for comparison
    const normalized = chunk.content.toLowerCase().replace(/\s+/g, ' ').trim();
    const key = normalized.slice(0, 100);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Search for the most relevant chunks using cosine similarity.
 *
 * Features:
 * - Similarity threshold filtering (default 0.7)
 * - Optional tag-based filtering
 * - Chunk deduplication
 * - Returns document metadata with each chunk
 */
export async function searchRelevantChunks(
  queryEmbedding: number[],
  options: SearchOptions = {}
): Promise<ChunkSearchResult[]> {
  const {
    topK = config.defaultTopK,
    minSimilarity = config.minSimilarity,
    tags,
    documentIds,
  } = options;

  const embeddingStr = formatEmbeddingForPg(queryEmbedding);

  // Build dynamic WHERE conditions
  const conditions: Prisma.Sql[] = [];

  // Similarity threshold
  conditions.push(
    Prisma.sql`1 - (c.embedding <=> ${embeddingStr}::vector) >= ${minSimilarity}`
  );

  // Tag filtering (if tags provided, document must have at least one matching tag)
  if (tags && tags.length > 0) {
    conditions.push(Prisma.sql`d.tags && ${tags}::text[]`);
  }

  // Document ID filtering
  if (documentIds && documentIds.length > 0) {
    conditions.push(Prisma.sql`c."documentId" = ANY(${documentIds}::text[])`);
  }

  const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;

  // Fetch extra results to account for deduplication
  const fetchLimit = topK * 2;

  const results = await prisma.$queryRaw<
    Array<{
      id: string;
      content: string;
      similarity: number;
      documentId: string;
      documentTitle: string;
    }>
  >`
    SELECT
      c.id,
      c.content,
      c."documentId" as "documentId",
      d.title as "documentTitle",
      1 - (c.embedding <=> ${embeddingStr}::vector) as similarity
    FROM "Chunk" c
    JOIN "Document" d ON c."documentId" = d.id
    ${whereClause}
    ORDER BY c.embedding <=> ${embeddingStr}::vector
    LIMIT ${fetchLimit}
  `;

  // Map results
  const chunks: ChunkSearchResult[] = results.map((r) => ({
    id: r.id,
    content: r.content,
    similarity: Number(r.similarity),
    documentId: r.documentId,
    documentTitle: r.documentTitle,
  }));

  // Deduplicate and limit to topK
  const deduplicated = deduplicateChunks(chunks);
  return deduplicated.slice(0, topK);
}

/**
 * Check if there are any chunks in the database.
 * Useful for determining if RAG should be used.
 */
export async function hasAnyChunks(): Promise<boolean> {
  const count = await prisma.chunk.count();
  return count > 0;
}

/**
 * Get retrieval statistics for debugging.
 */
export function getRetrievalStats(chunks: ChunkSearchResult[]): {
  count: number;
  avgSimilarity: number;
  minSimilarity: number;
  maxSimilarity: number;
  documents: string[];
} {
  if (chunks.length === 0) {
    return {
      count: 0,
      avgSimilarity: 0,
      minSimilarity: 0,
      maxSimilarity: 0,
      documents: [],
    };
  }

  const similarities = chunks.map((c) => c.similarity);
  const uniqueDocs = [...new Set(chunks.map((c) => c.documentTitle))];

  return {
    count: chunks.length,
    avgSimilarity: similarities.reduce((a, b) => a + b, 0) / similarities.length,
    minSimilarity: Math.min(...similarities),
    maxSimilarity: Math.max(...similarities),
    documents: uniqueDocs,
  };
}
