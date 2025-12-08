import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getProvider } from '@/lib/llm';
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
import { log } from '@/lib/logger';

// POST /api/chat/stream - Send a message and get a streaming response
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const userId = session.user.id;
    const { conversationId, message } = await request.json();

    if (!conversationId || !message?.trim()) {
      return new Response(JSON.stringify({ error: 'Missing conversationId or message' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check conversation exists and user owns it
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation || conversation.userId !== userId) {
      return new Response(JSON.stringify({ error: 'Conversation not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
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
        const queryEmbedding = await embedText(message.trim());
        relevantChunks = await searchRelevantChunks(queryEmbedding, {
          topK: config.defaultTopK,
          minSimilarity: config.minSimilarity,
        });

        const stats = getRetrievalStats(relevantChunks);
        log.info(`RAG search (stream): ${stats.count} chunks found`, {
          requestId,
          threshold: config.minSimilarity,
          chunksFound: stats.count,
        });
      } catch (error) {
        log.error('Error during RAG search', error, { requestId });
      }
    }

    // Get conversation history
    const historyMessages = await prisma.message.findMany({
      where: {
        conversationId,
        id: { not: userMessage.id },
      },
      orderBy: { createdAt: 'desc' },
      take: config.maxConversationHistory,
    });

    const orderedHistory: ChatMessage[] = historyMessages
      .reverse()
      .map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
        createdAt: m.createdAt,
      }));

    // Build prompt
    const { messages: promptMessages } = buildPrompt({
      systemPrompt: settings.systemPrompt,
      contextChunks: relevantChunks,
      messages: orderedHistory,
      latestUserMessage: message.trim(),
    });

    // Create streaming response
    const encoder = new TextEncoder();
    let fullContent = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const provider = getProvider();

          for await (const chunk of provider.chatStream(promptMessages, {
            model: settings.modelName,
            temperature: settings.temperature,
            maxTokens: settings.maxTokens ?? undefined,
          })) {
            fullContent += chunk.content;

            const data = JSON.stringify({
              content: chunk.content,
              done: chunk.done,
            });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));

            if (chunk.done) {
              // Save the complete assistant message
              const assistantMessage = await prisma.message.create({
                data: {
                  conversationId,
                  role: 'assistant',
                  content: fullContent,
                },
              });

              // Update conversation timestamp
              await prisma.conversation.update({
                where: { id: conversationId },
                data: { updatedAt: new Date() },
              });

              // Send final message with ID
              const finalData = JSON.stringify({
                messageId: assistantMessage.id,
                done: true,
              });
              controller.enqueue(encoder.encode(`data: ${finalData}\n\n`));
            }
          }
        } catch (error) {
          log.error('Stream error', error, { requestId });
          const errorData = JSON.stringify({
            error: error instanceof Error ? error.message : 'Stream error',
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    log.error('Chat stream error', error, { requestId });
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
