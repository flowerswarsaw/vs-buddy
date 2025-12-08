import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { config } from '../config';
import type { ChunkSearchResult, SearchOptions } from '../types';
import { formatEmbeddingForPg } from './embed';
import { getCachedResults, setCachedResults } from './cache';

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
    useCache = true,
  } = options;

  // Check cache first (only if no filters applied)
  if (useCache && !tags?.length && !documentIds?.length) {
    const cached = getCachedResults(queryEmbedding);
    if (cached) {
      return cached.slice(0, topK);
    }
  }

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
  const finalResults = deduplicated.slice(0, topK);

  // Cache results if no filters applied
  if (useCache && !tags?.length && !documentIds?.length) {
    setCachedResults(queryEmbedding, finalResults);
  }

  return finalResults;
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

/**
 * Hybrid search options extending standard search options.
 */
export interface HybridSearchOptions extends SearchOptions {
  vectorWeight?: number;
  keywordWeight?: number;
}

/**
 * Extract search terms from query text.
 * Filters out common stop words and short words.
 */
function extractSearchTerms(query: string): string {
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
    'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'under', 'again', 'further', 'then', 'once', 'here',
    'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few',
    'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
    'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
    'and', 'but', 'if', 'or', 'because', 'as', 'until', 'while',
    'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
    'am', 'it', 'its', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours',
    'you', 'your', 'yours', 'he', 'him', 'his', 'she', 'her', 'hers',
    'they', 'them', 'their', 'theirs',
  ]);

  const words = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));

  // Return empty string if no valid words
  if (words.length === 0) return '';

  // Join with OR operator for tsquery
  return words.join(' | ');
}

/**
 * Hybrid search combining vector similarity with keyword matching.
 * Uses PostgreSQL full-text search for keyword component.
 *
 * The final score is: vectorWeight * vectorScore + keywordWeight * keywordScore
 */
export async function searchRelevantChunksHybrid(
  queryEmbedding: number[],
  queryText: string,
  options: HybridSearchOptions = {}
): Promise<ChunkSearchResult[]> {
  const {
    topK = config.defaultTopK,
    minSimilarity = config.minSimilarity,
    vectorWeight = 0.7,
    keywordWeight = 0.3,
    tags,
    documentIds,
  } = options;

  const embeddingStr = formatEmbeddingForPg(queryEmbedding);
  const searchTerms = extractSearchTerms(queryText);

  // If no search terms, fall back to pure vector search
  if (!searchTerms) {
    return searchRelevantChunks(queryEmbedding, options);
  }

  const fetchLimit = topK * 3; // Extra results for hybrid scoring

  // Build WHERE conditions
  const conditions: Prisma.Sql[] = [];
  conditions.push(
    Prisma.sql`1 - (c.embedding <=> ${embeddingStr}::vector) >= ${minSimilarity}`
  );

  if (tags && tags.length > 0) {
    conditions.push(Prisma.sql`d.tags && ${tags}::text[]`);
  }
  if (documentIds && documentIds.length > 0) {
    conditions.push(Prisma.sql`c."documentId" = ANY(${documentIds}::text[])`);
  }

  const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;

  // Hybrid query: vector similarity + keyword matching
  const results = await prisma.$queryRaw<
    Array<{
      id: string;
      content: string;
      documentId: string;
      documentTitle: string;
      vectorScore: number;
      keywordScore: number;
    }>
  >`
    WITH vector_results AS (
      SELECT
        c.id,
        c.content,
        c."documentId",
        d.title as "documentTitle",
        1 - (c.embedding <=> ${embeddingStr}::vector) as vector_score,
        ts_rank_cd(
          to_tsvector('english', c.content),
          to_tsquery('english', ${searchTerms})
        ) as keyword_score
      FROM "Chunk" c
      JOIN "Document" d ON c."documentId" = d.id
      ${whereClause}
    )
    SELECT
      id,
      content,
      "documentId",
      "documentTitle",
      vector_score as "vectorScore",
      keyword_score as "keywordScore"
    FROM vector_results
    ORDER BY (vector_score * ${vectorWeight} + keyword_score * ${keywordWeight}) DESC
    LIMIT ${fetchLimit}
  `;

  // Calculate combined similarity score
  const chunks: ChunkSearchResult[] = results.map((r) => ({
    id: r.id,
    content: r.content,
    similarity: Number(r.vectorScore) * vectorWeight + Number(r.keywordScore) * keywordWeight,
    documentId: r.documentId,
    documentTitle: r.documentTitle,
  }));

  // Deduplicate and limit
  return deduplicateChunks(chunks).slice(0, topK);
}
