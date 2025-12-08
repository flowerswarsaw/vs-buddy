import type { ChunkSearchResult } from '../types';

interface CacheEntry {
  results: ChunkSearchResult[];
  timestamp: number;
}

// In-memory cache with TTL
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100; // Max entries to prevent memory bloat

/**
 * Generate a cache key from embedding.
 * Uses first 16 values rounded to reduce key space.
 */
function getCacheKey(embedding: number[]): string {
  // Use first 16 dimensions rounded to 3 decimal places
  return embedding
    .slice(0, 16)
    .map((v) => Math.round(v * 1000))
    .join(',');
}

/**
 * Get cached search results if available and not expired.
 */
export function getCachedResults(embedding: number[]): ChunkSearchResult[] | null {
  const key = getCacheKey(embedding);
  const entry = cache.get(key);

  if (!entry) return null;

  // Check if expired
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }

  return entry.results;
}

/**
 * Cache search results.
 */
export function setCachedResults(embedding: number[], results: ChunkSearchResult[]): void {
  // Evict oldest entries if cache is full
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }

  cache.set(getCacheKey(embedding), {
    results,
    timestamp: Date.now(),
  });
}

/**
 * Clear all cached results.
 * Should be called when documents are added/removed.
 */
export function clearCache(): void {
  cache.clear();
}

/**
 * Get cache statistics.
 */
export function getCacheStats(): { size: number; maxSize: number; ttlMs: number } {
  return {
    size: cache.size,
    maxSize: MAX_CACHE_SIZE,
    ttlMs: CACHE_TTL_MS,
  };
}
