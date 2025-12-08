/**
 * Ollama LLM Provider
 * HTTP client for Ollama's local API with circuit breaker and retry logic
 */

import { config } from '../config';
import { withRetry } from '../resilience/retry';
import { CircuitBreaker } from '../resilience/circuit-breaker';
import { OllamaError, ErrorCode } from '../errors';
import { log } from '../logger';
import type { LLMProvider, LLMMessage, ChatOptions, StreamOptions, StreamChunk } from './types';

const globalForOllama = globalThis as unknown as {
  ollamaChatCircuitBreaker: CircuitBreaker | undefined;
  ollamaEmbeddingCircuitBreaker: CircuitBreaker | undefined;
};

// Create circuit breakers for different Ollama operations
const chatCircuitBreaker =
  globalForOllama.ollamaChatCircuitBreaker ??
  new CircuitBreaker({
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000, // 1 minute
    onStateChange: (from, to) => {
      log.info(`Ollama Chat circuit breaker state changed: ${from} -> ${to}`, {
        service: 'ollama',
        operation: 'chat',
        from,
        to,
      });
    },
  });

const embeddingCircuitBreaker =
  globalForOllama.ollamaEmbeddingCircuitBreaker ??
  new CircuitBreaker({
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000,
    onStateChange: (from, to) => {
      log.info(`Ollama Embeddings circuit breaker state changed: ${from} -> ${to}`, {
        service: 'ollama',
        operation: 'embeddings',
        from,
        to,
      });
    },
  });

if (process.env.NODE_ENV !== 'production') {
  globalForOllama.ollamaChatCircuitBreaker = chatCircuitBreaker;
  globalForOllama.ollamaEmbeddingCircuitBreaker = embeddingCircuitBreaker;
}

/**
 * Handle Ollama errors and convert to our error types
 */
function handleOllamaError(error: unknown): never {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Connection errors
    if (message.includes('econnrefused') || message.includes('connect')) {
      throw new OllamaError(
        'Cannot connect to Ollama. Make sure Ollama is running.',
        ErrorCode.OLLAMA_CONNECTION_ERROR,
        {},
        error
      );
    }

    // Timeout errors
    if (message.includes('timeout') || message.includes('etimedout')) {
      throw new OllamaError(
        'Ollama request timed out',
        ErrorCode.OLLAMA_TIMEOUT,
        {},
        error
      );
    }

    // Model not found
    if (message.includes('model') && message.includes('not found')) {
      throw new OllamaError(
        `Model not found. Run: ollama pull ${config.ollamaChatModel}`,
        ErrorCode.OLLAMA_MODEL_NOT_FOUND,
        {},
        error
      );
    }

    // Generic error
    throw new OllamaError(
      error.message || 'Ollama API error',
      ErrorCode.OLLAMA_API_ERROR,
      {},
      error
    );
  }

  throw new OllamaError(
    'Unknown error occurred during Ollama request',
    ErrorCode.OLLAMA_API_ERROR
  );
}

/**
 * Make HTTP request to Ollama API
 */
async function ollamaFetch<T>(endpoint: string, body: unknown): Promise<T> {
  const url = `${config.ollamaBaseUrl}${endpoint}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Ollama API error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<T>;
}

interface OllamaChatResponse {
  message: {
    role: string;
    content: string;
  };
  done: boolean;
}

interface OllamaEmbeddingResponse {
  embedding: number[];
}

/**
 * Ollama LLM Provider implementation
 */
export class OllamaProvider implements LLMProvider {
  /**
   * Generate chat completion using Ollama
   */
  async chat(messages: LLMMessage[], options?: ChatOptions): Promise<string> {
    try {
      const response = await chatCircuitBreaker.execute(() =>
        withRetry(
          async () => {
            const result = await ollamaFetch<OllamaChatResponse>('/api/chat', {
              model: options?.model ?? config.ollamaChatModel,
              messages: messages.map((m) => ({
                role: m.role,
                content: m.content,
              })),
              stream: false,
              options: {
                temperature: options?.temperature ?? config.defaultTemperature,
                num_predict: options?.maxTokens ?? undefined,
              },
            });

            if (!result.message?.content) {
              throw new Error('No response from Ollama');
            }

            return result.message.content;
          },
          {
            maxAttempts: 3,
            initialDelayMs: 1000,
            maxDelayMs: 10000,
            timeoutMs: 60000, // Ollama can be slower, especially for large models
            onRetry: (error, attempt, delayMs) => {
              log.warn(`Ollama Chat retry attempt ${attempt}, waiting ${Math.round(delayMs)}ms`, {
                service: 'ollama',
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
      handleOllamaError(error);
    }
  }

  /**
   * Generate streaming chat completion using Ollama
   */
  async *chatStream(messages: LLMMessage[], options?: StreamOptions): AsyncIterable<StreamChunk> {
    const url = `${config.ollamaBaseUrl}/api/chat`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options?.model ?? config.ollamaChatModel,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          stream: true,
          options: {
            temperature: options?.temperature ?? config.defaultTemperature,
            num_predict: options?.maxTokens ?? undefined,
          },
        }),
        signal: options?.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Ollama API error (${response.status}): ${errorText}`);
      }

      if (!response.body) {
        throw new Error('No response body from Ollama');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const json = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
            const content = json.message?.content || '';
            const isDone = json.done || false;

            yield { content, done: isDone };

            if (isDone) return;
          } catch {
            // Skip malformed JSON lines
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const json = JSON.parse(buffer) as { message?: { content?: string }; done?: boolean };
          yield { content: json.message?.content || '', done: true };
        } catch {
          // Ignore final parse error
        }
      }
    } catch (error) {
      handleOllamaError(error);
    }
  }

  /**
   * Generate embeddings using Ollama
   * Note: Ollama's embedding API takes single text, so we loop for batch
   */
  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    try {
      const response = await embeddingCircuitBreaker.execute(() =>
        withRetry(
          async () => {
            // Ollama embedding API takes single text, process in parallel
            const embeddings = await Promise.all(
              texts.map(async (text) => {
                const result = await ollamaFetch<OllamaEmbeddingResponse>('/api/embeddings', {
                  model: config.ollamaEmbedModel,
                  prompt: text,
                });

                if (!result.embedding || !Array.isArray(result.embedding)) {
                  throw new Error('Invalid embedding response from Ollama');
                }

                return result.embedding;
              })
            );

            return embeddings;
          },
          {
            maxAttempts: 3,
            initialDelayMs: 1000,
            maxDelayMs: 10000,
            timeoutMs: 60000,
            onRetry: (error, attempt, delayMs) => {
              log.warn(`Ollama Embeddings retry attempt ${attempt}, waiting ${Math.round(delayMs)}ms`, {
                service: 'ollama',
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
      handleOllamaError(error);
    }
  }
}

/**
 * Get circuit breaker stats for monitoring
 */
export function getOllamaCircuitBreakerStats() {
  return {
    chat: chatCircuitBreaker.getStats(),
    embedding: embeddingCircuitBreaker.getStats(),
  };
}

/**
 * Reset circuit breakers (useful for testing or manual recovery)
 */
export function resetOllamaCircuitBreakers() {
  chatCircuitBreaker.reset();
  embeddingCircuitBreaker.reset();
}
