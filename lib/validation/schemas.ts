/**
 * Zod validation schemas for API inputs
 * Provides type-safe validation with detailed error messages
 */

import { z } from 'zod';

/**
 * Common validators
 */
export const uuidSchema = z.string().uuid('Invalid UUID format');
export const nonEmptyStringSchema = z.string().min(1, 'Cannot be empty').trim();
export const emailSchema = z.string().email('Invalid email format');

/**
 * Chat API schemas
 */
export const chatRequestSchema = z.object({
  conversationId: uuidSchema,
  message: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(10000, 'Message too long (max 10000 characters)')
    .trim(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

/**
 * Conversation API schemas
 */
export const createConversationSchema = z.object({
  title: z
    .string()
    .max(200, 'Title too long (max 200 characters)')
    .trim()
    .optional(),
});

export type CreateConversationRequest = z.infer<typeof createConversationSchema>;

export const updateConversationSchema = z.object({
  id: uuidSchema,
  title: z
    .string()
    .min(1, 'Title cannot be empty')
    .max(200, 'Title too long (max 200 characters)')
    .trim()
    .optional(),
});

export type UpdateConversationRequest = z.infer<typeof updateConversationSchema>;

export const deleteConversationSchema = z.object({
  id: uuidSchema,
});

export type DeleteConversationRequest = z.infer<typeof deleteConversationSchema>;

/**
 * Document upload schemas
 */
export const documentUploadSchema = z.object({
  filename: z
    .string()
    .min(1, 'Filename cannot be empty')
    .max(255, 'Filename too long (max 255 characters)')
    .trim()
    .refine(
      (name) => {
        // Allow common document extensions
        const allowedExtensions = ['.txt', '.pdf', '.docx', '.md', '.html'];
        return allowedExtensions.some((ext) => name.toLowerCase().endsWith(ext));
      },
      {
        message: 'Invalid file type. Allowed: .txt, .pdf, .docx, .md, .html',
      }
    ),
  content: z
    .string()
    .min(1, 'Content cannot be empty')
    .max(10_000_000, 'File too large (max 10MB)'), // ~10MB for text content
});

export type DocumentUploadRequest = z.infer<typeof documentUploadSchema>;

export const deleteDocumentSchema = z.object({
  id: uuidSchema,
});

export type DeleteDocumentRequest = z.infer<typeof deleteDocumentSchema>;

/**
 * Settings API schemas
 */
export const updateSettingsSchema = z.object({
  systemPrompt: z
    .string()
    .max(5000, 'System prompt too long (max 5000 characters)')
    .trim()
    .optional(),
  modelName: z
    .string()
    .min(1, 'Model name cannot be empty')
    .max(100, 'Model name too long')
    .trim()
    .optional(),
  temperature: z
    .number()
    .min(0, 'Temperature must be >= 0')
    .max(2, 'Temperature must be <= 2')
    .optional(),
  maxTokens: z
    .number()
    .int('Max tokens must be an integer')
    .positive('Max tokens must be positive')
    .max(100000, 'Max tokens too high')
    .nullable()
    .optional(),
});

export type UpdateSettingsRequest = z.infer<typeof updateSettingsSchema>;

/**
 * Auth schemas
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password too long'),
});

export type LoginRequest = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  name: z
    .string()
    .min(1, 'Name cannot be empty')
    .max(100, 'Name too long')
    .trim(),
  email: emailSchema,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password too long')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one lowercase letter, one uppercase letter, and one number'
    ),
});

export type RegisterRequest = z.infer<typeof registerSchema>;

/**
 * Query parameter schemas
 */
export const paginationSchema = z.object({
  page: z.coerce
    .number()
    .int('Page must be an integer')
    .positive('Page must be positive')
    .default(1),
  limit: z.coerce
    .number()
    .int('Limit must be an integer')
    .positive('Limit must be positive')
    .max(100, 'Limit too high (max 100)')
    .default(20),
});

export type PaginationParams = z.infer<typeof paginationSchema>;

export const searchQuerySchema = z.object({
  q: z
    .string()
    .min(1, 'Search query cannot be empty')
    .max(500, 'Search query too long')
    .trim(),
  topK: z.coerce
    .number()
    .int('topK must be an integer')
    .positive('topK must be positive')
    .max(50, 'topK too high (max 50)')
    .optional(),
  minSimilarity: z.coerce
    .number()
    .min(0, 'minSimilarity must be >= 0')
    .max(1, 'minSimilarity must be <= 1')
    .optional(),
});

export type SearchQueryParams = z.infer<typeof searchQuerySchema>;
