// Central configuration - all env access goes through here

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (!value && defaultValue === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || defaultValue!;
}

export const config = {
  // Required
  openaiApiKey: () => getEnvVar('OPENAI_API_KEY'),
  databaseUrl: () => getEnvVar('DATABASE_URL'),

  // Optional with defaults
  defaultChatModel: getEnvVar('DEFAULT_CHAT_MODEL', 'gpt-4o-mini'),
  defaultEmbeddingModel: getEnvVar('DEFAULT_EMBEDDING_MODEL', 'text-embedding-3-small'),
  defaultTemperature: parseFloat(getEnvVar('DEFAULT_TEMPERATURE', '0.7')),
  defaultTopK: parseInt(getEnvVar('DEFAULT_TOP_K', '8'), 10),

  // RAG settings
  chunkSize: 500,
  chunkOverlap: 50,
  maxConversationHistory: 10,
  embeddingDimensions: 1536,
  minSimilarity: parseFloat(getEnvVar('MIN_SIMILARITY', '0.7')),
} as const;
