import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { chatCompletion } from '@/lib/openai';
import {
  embedText,
  searchRelevantChunks,
  buildPrompt,
  getSettingsOrDefaults,
  hasAnyChunks,
  getRetrievalStats,
} from '@/lib/rag';
import { config } from '@/lib/config';
import { auth } from '@/lib/auth';
import type { ChatMessage, ChunkSearchResult } from '@/lib/types';
import { AuthError, NotFoundError } from '@/lib/errors';
import { handleApiError } from '@/lib/error-handler';
import { validateRequestBody } from '@/lib/validation/validator';
import { chatRequestSchema } from '@/lib/validation/schemas';
import { checkRateLimit, RateLimits } from '@/lib/rate-limit';
import { log } from '@/lib/logger';
import { measurePerformance } from '@/lib/monitoring/performance-middleware';
import { PerformanceTimer } from '@/lib/monitoring/metrics';

// POST /api/chat - Send a message and get a response
export async function POST(request: NextRequest) {
  return measurePerformance(request, async () => {
    // Apply rate limiting
    const rateLimitResponse = await checkRateLimit(request, RateLimits.CHAT);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
    const requestId = crypto.randomUUID();

    try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new AuthError('Unauthorized', undefined, { requestId });
    }

    const userId = session.user.id;

    // Validate and sanitize request body
    const validationResult = await validateRequestBody(request, chatRequestSchema, {
      requestId,
      userId,
    });

    if (!validationResult.success) {
      throw validationResult.error;
    }

    const { conversationId, message } = validationResult.data;

    // Check conversation exists and user owns it
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundError('Conversation', { requestId, userId });
    }

    // Verify ownership
    if (conversation.userId !== userId) {
      throw new NotFoundError('Conversation', { requestId, userId });
    }

    // Get settings
    const settingsRow = await prisma.settings.findFirst();
    const settings = getSettingsOrDefaults(settingsRow);

    // Create user message
    const userMessage = await prisma.message.create({
      data: {
        conversationId,
        role: 'user',
        content: message.trim(),
      },
    });

    // Update conversation title if this is the first message
    if (!conversation.title) {
      const title = message.trim().slice(0, 50) + (message.length > 50 ? '...' : '');
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { title },
      });
    }

    // Get context chunks via RAG (if we have any documents)
    let relevantChunks: ChunkSearchResult[] = [];
    const hasChunks = await hasAnyChunks();

    if (hasChunks) {
      try {
        // Time embedding generation
        const embeddingTimer = new PerformanceTimer('openai.embedding', {
          requestId,
        });
        const queryEmbedding = await embedText(message.trim());
        embeddingTimer.end();

        // Time RAG search
        const searchTimer = new PerformanceTimer('rag.search', {
          requestId,
        });
        relevantChunks = await searchRelevantChunks(queryEmbedding, {
          topK: config.defaultTopK,
          minSimilarity: config.minSimilarity,
        });
        const searchDuration = searchTimer.end();

        // Log retrieval stats for debugging
        const stats = getRetrievalStats(relevantChunks);
        log.debug(`RAG retrieved ${stats.count} chunks in ${searchDuration}ms`, {
          requestId,
          count: stats.count,
          avgSimilarity: (stats.avgSimilarity * 100).toFixed(1) + '%',
          sources: stats.documents.join(', ') || 'none',
          searchDuration,
        });
      } catch (error) {
        log.error('Error during RAG search', error, { requestId });
        // Continue without RAG context if search fails
      }
    }

    // Get conversation history (last N messages)
    const historyMessages = await prisma.message.findMany({
      where: {
        conversationId,
        id: { not: userMessage.id }, // Exclude the message we just created
      },
      orderBy: { createdAt: 'desc' },
      take: config.maxConversationHistory,
    });

    // Reverse to get chronological order
    const orderedHistory: ChatMessage[] = historyMessages
      .reverse()
      .map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
        createdAt: m.createdAt,
      }));

    // Build prompt with full chunk metadata (source attribution)
    const { messages: promptMessages } = buildPrompt({
      systemPrompt: settings.systemPrompt,
      contextChunks: relevantChunks,
      messages: orderedHistory,
      latestUserMessage: message.trim(),
    });

    // Call OpenAI with timing
    const chatTimer = new PerformanceTimer('openai.chat', {
      requestId,
      model: settings.modelName,
    });
    const assistantResponse = await chatCompletion(promptMessages, {
      model: settings.modelName,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
    });
    const chatDuration = chatTimer.end();

    log.debug(`OpenAI chat completed in ${chatDuration}ms`, {
      requestId,
      model: settings.modelName,
      duration: chatDuration,
    });

    // Save assistant message
    const assistantMessage = await prisma.message.create({
      data: {
        conversationId,
        role: 'assistant',
        content: assistantResponse,
      },
    });

    // Update conversation timestamp
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

      return NextResponse.json({
        message: {
          id: assistantMessage.id,
          role: assistantMessage.role,
          content: assistantMessage.content,
          createdAt: assistantMessage.createdAt,
        },
      });
    } catch (error) {
      return handleApiError(error, {
        requestId,
        userId: (await auth())?.user?.id,
        path: '/api/chat',
        method: 'POST',
      });
    }
  });
}
