import { getProvider } from '../llm';

/**
 * Embed a single text string.
 */
export async function embedText(text: string): Promise<number[]> {
  const provider = getProvider();
  const embeddings = await provider.embed([text]);
  return embeddings[0];
}

/**
 * Embed multiple text strings in a single API call.
 * More efficient than calling embedText multiple times.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }
  const provider = getProvider();
  return provider.embed(texts);
}

/**
 * Format embedding array for pgvector insertion.
 * Converts number[] to a string format like '[0.1,0.2,0.3]'
 */
export function formatEmbeddingForPg(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
