/**
 * OpenAI LLM Provider
 * Implements LLMProvider interface with circuit breaker and retry logic
 */

import OpenAI from 'openai';
import { config } from '../config';
import { withRetry } from '../resilience/retry';
import { CircuitBreaker } from '../resilience/circuit-breaker';
import { OpenAIError, ErrorCode } from '../errors';
import { log } from '../logger';
import type { LLMProvider, LLMMessage, ChatOptions, StreamOptions, StreamChunk } from './types';

const globalForOpenAI = globalThis as unknown as {
  openai: OpenAI | undefined;
  openaiChatCircuitBreaker: CircuitBreaker | undefined;
  openaiEmbeddingCircuitBreaker: CircuitBreaker | undefined;
};

// Lazy initialization of OpenAI client
function getOpenAIClient(): OpenAI {
  if (!globalForOpenAI.openai) {
    globalForOpenAI.openai = new OpenAI({
      apiKey: config.openaiApiKey(),
      timeout: 30000,
      maxRetries: 0, // We handle retries ourselves
    });
  }
  return globalForOpenAI.openai;
}

// Create circuit breakers for different OpenAI operations
const chatCircuitBreaker =
  globalForOpenAI.openaiChatCircuitBreaker ??
  new CircuitBreaker({
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000, // 1 minute
    onStateChange: (from, to) => {
      log.info(`OpenAI Chat circuit breaker state changed: ${from} -> ${to}`, {
        service: 'openai',
        operation: 'chat',
        from,
        to,
      });
    },
  });

const embeddingCircuitBreaker =
  globalForOpenAI.openaiEmbeddingCircuitBreaker ??
  new CircuitBreaker({
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000,
    onStateChange: (from, to) => {
      log.info(`OpenAI Embeddings circuit breaker state changed: ${from} -> ${to}`, {
        service: 'openai',
        operation: 'embeddings',
        from,
        to,
      });
    },
  });

if (process.env.NODE_ENV !== 'production') {
  globalForOpenAI.openaiChatCircuitBreaker = chatCircuitBreaker;
  globalForOpenAI.openaiEmbeddingCircuitBreaker = embeddingCircuitBreaker;
}

/**
 * Handle OpenAI errors and convert to our error types
 */
function handleOpenAIError(error: unknown): never {
  if (error instanceof OpenAI.APIError) {
    const { status, message, code } = error;

    // Rate limit errors
    if (status === 429 || code === 'rate_limit_exceeded') {
      throw new OpenAIError(
        'Rate limit exceeded. Please try again later.',
        ErrorCode.OPENAI_RATE_LIMIT,
        {},
        error
      );
    }

    // Authentication errors
    if (status === 401 || code === 'invalid_api_key') {
      throw new OpenAIError(
        'Invalid OpenAI API key',
        ErrorCode.OPENAI_AUTHENTICATION_ERROR,
        {},
        error
      );
    }

    // Timeout errors
    if (code === 'timeout') {
      throw new OpenAIError(
        'OpenAI request timed out',
        ErrorCode.OPENAI_TIMEOUT,
        {},
        error
      );
    }

    // Invalid request errors
    if (status === 400) {
      throw new OpenAIError(
        `Invalid request: ${message}`,
        ErrorCode.OPENAI_INVALID_REQUEST,
        {},
        error
      );
    }

    // Generic OpenAI error
    throw new OpenAIError(
      message || 'OpenAI API error',
      ErrorCode.OPENAI_API_ERROR,
      {},
      error
    );
  }

  // Non-OpenAI error
  if (error instanceof Error) {
    throw new OpenAIError(
      error.message || 'Unknown OpenAI error',
      ErrorCode.OPENAI_API_ERROR,
      {},
      error
    );
  }

  throw new OpenAIError(
    'Unknown error occurred during OpenAI request',
    ErrorCode.OPENAI_API_ERROR
  );
}

/**
 * OpenAI LLM Provider implementation
 */
export class OpenAIProvider implements LLMProvider {
  /**
   * Generate chat completion using OpenAI
   */
  async chat(messages: LLMMessage[], options?: ChatOptions): Promise<string> {
    try {
      const openai = getOpenAIClient();
      const response = await chatCircuitBreaker.execute(() =>
        withRetry(
          async () => {
            const result = await openai.chat.completions.create({
              model: options?.model ?? config.defaultChatModel,
              temperature: options?.temperature ?? config.defaultTemperature,
              max_tokens: options?.maxTokens ?? undefined,
              messages: messages.map((m) => ({
                role: m.role,
                content: m.content,
              })),
            });

            const content = result.choices[0]?.message?.content;
            if (!content) {
              throw new Error('No response from OpenAI');
            }
            return content;
          },
          {
            maxAttempts: 3,
            initialDelayMs: 1000,
            maxDelayMs: 10000,
            timeoutMs: 30000,
            onRetry: (error, attempt, delayMs) => {
              log.warn(`OpenAI Chat retry attempt ${attempt}, waiting ${Math.round(delayMs)}ms`, {
                service: 'openai',
                operation: 'chat',
                attempt,
                delayMs: Math.round(delayMs),
                error: error instanceof Error ? error.message : String(error),
              });
            },
          }
        )
      );

      return response;
    } catch (error) {
      handleOpenAIError(error);
    }
  }

  /**
   * Generate streaming chat completion using OpenAI
   */
  async *chatStream(messages: LLMMessage[], options?: StreamOptions): AsyncIterable<StreamChunk> {
    try {
      const openai = getOpenAIClient();

      const stream = await openai.chat.completions.create({
        model: options?.model ?? config.defaultChatModel,
        temperature: options?.temperature ?? config.defaultTemperature,
        max_tokens: options?.maxTokens ?? undefined,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        stream: true,
      });

      for await (const chunk of stream) {
        if (options?.signal?.aborted) {
          break;
        }

        const content = chunk.choices[0]?.delta?.content || '';
        const done = chunk.choices[0]?.finish_reason !== null;

        yield { content, done };

        if (done) break;
      }
    } catch (error) {
      handleOpenAIError(error);
    }
  }

  /**
   * Generate embeddings using OpenAI
   */
  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    try {
      const openai = getOpenAIClient();
      const response = await embeddingCircuitBreaker.execute(() =>
        withRetry(
          async () => {
            const result = await openai.embeddings.create({
              model: config.defaultEmbeddingModel,
              input: texts,
              dimensions: config.embeddingDimensions,
            });

            return result.data.map((d) => d.embedding);
          },
          {
            maxAttempts: 3,
            initialDelayMs: 1000,
            maxDelayMs: 10000,
            timeoutMs: 30000,
            onRetry: (error, attempt, delayMs) => {
              log.warn(`OpenAI Embeddings retry attempt ${attempt}, waiting ${Math.round(delayMs)}ms`, {
                service: 'openai',
                operation: 'embeddings',
                attempt,
                delayMs: Math.round(delayMs),
                error: error instanceof Error ? error.message : String(error),
              });
            },
          }
        )
      );

      return response;
    } catch (error) {
      handleOpenAIError(error);
    }
  }
}

/**
 * Get circuit breaker stats for monitoring
 */
export function getOpenAICircuitBreakerStats() {
  return {
    chat: chatCircuitBreaker.getStats(),
    embedding: embeddingCircuitBreaker.getStats(),
  };
}

/**
 * Reset circuit breakers (useful for testing or manual recovery)
 */
export function resetOpenAICircuitBreakers() {
  chatCircuitBreaker.reset();
  embeddingCircuitBreaker.reset();
}
