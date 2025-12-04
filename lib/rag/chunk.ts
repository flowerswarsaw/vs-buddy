import { config } from '../config';

/**
 * Split text into overlapping chunks for embedding.
 * Uses a simple character-based splitter with configurable size and overlap.
 */
export function splitTextIntoChunks(text: string): string[] {
  const { chunkSize, chunkOverlap } = config;
  const chunks: string[] = [];

  // Clean up the text - normalize whitespace
  const cleanedText = text.replace(/\s+/g, ' ').trim();

  if (cleanedText.length <= chunkSize) {
    return [cleanedText];
  }

  let start = 0;
  while (start < cleanedText.length) {
    let end = start + chunkSize;

    // If we're not at the end, try to break at a sentence or word boundary
    if (end < cleanedText.length) {
      // Look for sentence boundary (. ! ?) within the last 100 chars
      const lastPart = cleanedText.slice(Math.max(start, end - 100), end);
      const sentenceMatch = lastPart.match(/[.!?]\s+(?=[A-Z])/g);
      if (sentenceMatch) {
        const lastSentenceEnd = lastPart.lastIndexOf(sentenceMatch[sentenceMatch.length - 1]);
        if (lastSentenceEnd > 0) {
          end = Math.max(start, end - 100) + lastSentenceEnd + 2;
        }
      } else {
        // Fall back to word boundary
        const lastSpace = cleanedText.lastIndexOf(' ', end);
        if (lastSpace > start) {
          end = lastSpace;
        }
      }
    }

    const chunk = cleanedText.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    // Move start forward, accounting for overlap
    const nextStart = end - chunkOverlap;
    // Prevent infinite loop if overlap causes no progress
    start = nextStart > start ? nextStart : end;
  }

  return chunks;
}
