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

// POST /api/chat - Send a message and get a response
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { conversationId, message } = body;

    // Validate inputs
    if (!conversationId || typeof conversationId !== 'string') {
      return NextResponse.json(
        { error: 'conversationId is required' },
        { status: 400 }
      );
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'message is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    // Check conversation exists and user owns it
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Verify ownership
    if (conversation.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
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

        // Log retrieval stats for debugging
        const stats = getRetrievalStats(relevantChunks);
        console.log(
          `[RAG] Retrieved ${stats.count} chunks, ` +
          `avg similarity: ${(stats.avgSimilarity * 100).toFixed(1)}%, ` +
          `sources: ${stats.documents.join(', ') || 'none'}`
        );
      } catch (error) {
        console.error('Error during RAG search:', error);
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

    // Call OpenAI
    const assistantResponse = await chatCompletion(promptMessages, {
      model: settings.modelName,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
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
    console.error('Error in chat:', error);

    // Check for OpenAI-specific errors
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        return NextResponse.json(
          { error: 'OpenAI API key is invalid or missing' },
          { status: 500 }
        );
      }
      if (error.message.includes('rate limit')) {
        return NextResponse.json(
          { error: 'Rate limit exceeded. Please try again later.' },
          { status: 429 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    );
  }
}
