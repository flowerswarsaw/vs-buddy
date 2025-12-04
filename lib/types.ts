// Shared TypeScript types

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: Date;
}

export interface ConversationWithMessages {
  id: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
  messages: ChatMessage[];
}

export interface DocumentInfo {
  id: string;
  title: string;
  tags: string[];
  createdAt: Date;
}

export interface Settings {
  id: string;
  systemPrompt: string;
  modelName: string;
  temperature: number;
  maxTokens: number | null;
}

export interface ChunkSearchResult {
  id: string;
  content: string;
  similarity: number;
  documentId: string;
  documentTitle: string;
}

export interface SearchOptions {
  topK?: number;
  minSimilarity?: number;
  tags?: string[];
  documentIds?: string[];
}

// API request/response types
export interface ChatRequest {
  conversationId: string;
  message: string;
}

export interface ChatResponse {
  message: ChatMessage;
}

export interface IngestRequest {
  title: string;
  text: string;
  tags?: string[];
}

export interface IngestResponse {
  document: DocumentInfo;
  chunksCount: number;
}
