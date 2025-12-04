import OpenAI from 'openai';
import { config } from './config';

const globalForOpenAI = globalThis as unknown as {
  openai: OpenAI | undefined;
};

export const openai =
  globalForOpenAI.openai ??
  new OpenAI({
    apiKey: config.openaiApiKey(),
  });

if (process.env.NODE_ENV !== 'production') {
  globalForOpenAI.openai = openai;
}

// Chat completion wrapper
export async function chatCompletion(
  messages: OpenAI.ChatCompletionMessageParam[],
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number | null;
  } = {}
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: options.model ?? config.defaultChatModel,
    temperature: options.temperature ?? config.defaultTemperature,
    max_tokens: options.maxTokens ?? undefined,
    messages,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OpenAI');
  }
  return content;
}

// Embedding wrapper
export async function createEmbedding(
  input: string | string[]
): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: config.defaultEmbeddingModel,
    input,
    dimensions: config.embeddingDimensions,
  });

  return response.data.map((d) => d.embedding);
}
