// Central configuration - all env access goes through here

import type { ProviderType } from './llm/types';

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (!value && defaultValue === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || defaultValue!;
}

export const config = {
  // LLM Provider selection
  llmProvider: getEnvVar('LLM_PROVIDER', 'ollama') as ProviderType,

  // Database (required)
  databaseUrl: () => getEnvVar('DATABASE_URL'),

  // OpenAI settings (required only if using OpenAI provider)
  openaiApiKey: () => getEnvVar('OPENAI_API_KEY'),

  // Ollama settings
  ollamaBaseUrl: getEnvVar('OLLAMA_BASE_URL', 'http://localhost:11434'),
  ollamaChatModel: getEnvVar('OLLAMA_CHAT_MODEL', 'llama3'),
  ollamaEmbedModel: getEnvVar('OLLAMA_EMBED_MODEL', 'nomic-embed-text'),

  // OpenAI model defaults (used when provider is 'openai')
  defaultChatModel: getEnvVar('DEFAULT_CHAT_MODEL', 'gpt-4o-mini'),
  defaultEmbeddingModel: getEnvVar('DEFAULT_EMBEDDING_MODEL', 'text-embedding-3-small'),

  // Shared LLM settings
  defaultTemperature: parseFloat(getEnvVar('DEFAULT_TEMPERATURE', '0.7')),
  defaultTopK: parseInt(getEnvVar('DEFAULT_TOP_K', '8'), 10),

  // RAG settings
  chunkSize: 500,
  chunkOverlap: 50,
  maxConversationHistory: 10,
  embeddingDimensions: parseInt(getEnvVar('EMBEDDING_DIMENSIONS', '768'), 10),
  minSimilarity: parseFloat(getEnvVar('MIN_SIMILARITY', '0.4')),
} as const;
