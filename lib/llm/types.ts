/**
 * LLM Provider Types
 * Abstraction layer for different LLM providers (Ollama, OpenAI, etc.)
 */

export type LLMMessageRole = 'system' | 'user' | 'assistant';

export interface LLMMessage {
  role: LLMMessageRole;
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface StreamChunk {
  content: string;
  done: boolean;
}

export interface StreamOptions extends ChatOptions {
  signal?: AbortSignal;
}

export interface LLMProvider {
  /**
   * Generate embeddings for an array of texts
   * @param texts - Array of strings to embed
   * @returns Promise of 2D array of embeddings
   */
  embed(texts: string[]): Promise<number[][]>;

  /**
   * Generate a chat completion
   * @param messages - Array of messages in the conversation
   * @param options - Optional chat parameters
   * @returns Promise of the assistant's response content
   */
  chat(messages: LLMMessage[], options?: ChatOptions): Promise<string>;

  /**
   * Generate a streaming chat completion
   * @param messages - Array of messages in the conversation
   * @param options - Optional stream parameters including abort signal
   * @returns AsyncIterable of stream chunks
   */
  chatStream(messages: LLMMessage[], options?: StreamOptions): AsyncIterable<StreamChunk>;
}

export type ProviderType = 'ollama' | 'openai';
