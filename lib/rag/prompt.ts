import type { ChatMessage, Settings, ChunkSearchResult } from '../types';
import type { LLMMessage } from '../llm';

const DEFAULT_SYSTEM_PROMPT = `You are VS Buddy, an internal assistant. Your primary job is to answer questions using the knowledge base provided to you. Be helpful, concise, and practical. Always check the provided context first before answering.`;

const RAG_INSTRUCTIONS = `
IMPORTANT INSTRUCTIONS:
- Use ONLY the provided context for specific facts and information.
- Each context chunk shows its source document and relevance score.
- Prefer higher relevance chunks when information conflicts.
- If the answer is not in the context, clearly say "I don't have that information in my knowledge base."
- Be concise and practical. No corporate fluff.
- If you're unsure, say so rather than making things up.
`;

const NO_CONTEXT_INSTRUCTIONS = `
NOTE: No relevant information was found in the knowledge base for this query.
- If this is a general question you can answer from your training, do so.
- If it requires specific company/internal knowledge, clearly state that you don't have that information.
`;

interface BuildPromptParams {
  systemPrompt: string | null;
  contextChunks: ChunkSearchResult[];
  messages: ChatMessage[];
  latestUserMessage: string;
}

interface BuiltPrompt {
  messages: LLMMessage[];
}

/**
 * Format context chunks with source attribution and confidence scores.
 */
function formatContextWithSources(chunks: ChunkSearchResult[]): string {
  return chunks
    .map((chunk, i) => {
      const relevance = Math.round(chunk.similarity * 100);
      return `[${i + 1}. ${chunk.documentTitle} | ${relevance}% match]\n${chunk.content}`;
    })
    .join('\n\n---\n\n');
}

/**
 * Build the prompt for chat completion with RAG context.
 */
export function buildPrompt(params: BuildPromptParams): BuiltPrompt {
  const { systemPrompt, contextChunks, messages, latestUserMessage } = params;

  const llmMessages: LLMMessage[] = [];

  // Build system message
  let systemContent = systemPrompt || DEFAULT_SYSTEM_PROMPT;

  // Add context if we have chunks
  if (contextChunks.length > 0) {
    const contextSection = formatContextWithSources(contextChunks);
    systemContent += `\n\n${RAG_INSTRUCTIONS}\n\nCONTEXT FROM KNOWLEDGE BASE:\n---\n${contextSection}\n---`;
  } else {
    // No context found - add special instructions
    systemContent += `\n\n${NO_CONTEXT_INSTRUCTIONS}`;
  }

  llmMessages.push({
    role: 'system',
    content: systemContent,
  });

  // Add conversation history (excluding the latest message which we'll add separately)
  for (const msg of messages) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      llmMessages.push({
        role: msg.role,
        content: msg.content,
      });
    }
  }

  // Add the latest user message
  llmMessages.push({
    role: 'user',
    content: latestUserMessage,
  });

  return { messages: llmMessages };
}

/**
 * Legacy function for backward compatibility.
 * Converts string[] to ChunkSearchResult[] format.
 */
export function buildPromptFromStrings(params: {
  systemPrompt: string | null;
  contextChunks: string[];
  messages: ChatMessage[];
  latestUserMessage: string;
}): BuiltPrompt {
  const chunks: ChunkSearchResult[] = params.contextChunks.map((content, i) => ({
    id: `legacy-${i}`,
    content,
    similarity: 1.0,
    documentId: 'unknown',
    documentTitle: 'Document',
  }));

  return buildPrompt({
    ...params,
    contextChunks: chunks,
  });
}

/**
 * Get settings or return defaults.
 */
export function getSettingsOrDefaults(settings: Settings | null): {
  systemPrompt: string;
  modelName: string;
  temperature: number;
  maxTokens: number | null;
} {
  return {
    systemPrompt: settings?.systemPrompt || DEFAULT_SYSTEM_PROMPT,
    modelName: settings?.modelName || 'gpt-4o-mini',
    temperature: settings?.temperature ?? 0.7,
    maxTokens: settings?.maxTokens ?? null,
  };
}
