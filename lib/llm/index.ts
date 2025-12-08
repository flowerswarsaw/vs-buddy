/**
 * LLM Provider Factory
 * Creates the appropriate LLM provider based on configuration
 */

import { config } from '../config';
import type { LLMProvider, ProviderType } from './types';
import { OllamaProvider, getOllamaCircuitBreakerStats, resetOllamaCircuitBreakers } from './ollama';
import { OpenAIProvider, getOpenAICircuitBreakerStats, resetOpenAICircuitBreakers } from './openai';

// Re-export types
export type { LLMProvider, LLMMessage, LLMMessageRole, ChatOptions, ProviderType } from './types';

// Singleton provider instance
let providerInstance: LLMProvider | null = null;

/**
 * Get the configured LLM provider
 * Uses singleton pattern to reuse the same instance
 */
export function getProvider(): LLMProvider {
  if (providerInstance) {
    return providerInstance;
  }

  const providerType = config.llmProvider;

  switch (providerType) {
    case 'ollama':
      providerInstance = new OllamaProvider();
      break;
    case 'openai':
      providerInstance = new OpenAIProvider();
      break;
    default:
      throw new Error(`Unknown LLM provider: ${providerType}`);
  }

  return providerInstance;
}

/**
 * Get the current provider type
 */
export function getProviderType(): ProviderType {
  return config.llmProvider;
}

/**
 * Get circuit breaker stats for the current provider
 */
export function getCircuitBreakerStats() {
  const providerType = config.llmProvider;

  switch (providerType) {
    case 'ollama':
      return getOllamaCircuitBreakerStats();
    case 'openai':
      return getOpenAICircuitBreakerStats();
    default:
      return { chat: null, embedding: null };
  }
}

/**
 * Reset circuit breakers for the current provider
 */
export function resetCircuitBreakers() {
  const providerType = config.llmProvider;

  switch (providerType) {
    case 'ollama':
      resetOllamaCircuitBreakers();
      break;
    case 'openai':
      resetOpenAICircuitBreakers();
      break;
  }
}

/**
 * Reset the provider instance (useful for testing)
 */
export function resetProvider() {
  providerInstance = null;
}
