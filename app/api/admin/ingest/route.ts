import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { splitTextIntoChunks, embedTexts, formatEmbeddingForPg } from '@/lib/rag';

// POST /api/admin/ingest - Ingest a new document
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, text, tags } = body;

    // Validate inputs
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json(
        { error: 'title is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'text is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    // Parse tags
    const parsedTags: string[] = Array.isArray(tags)
      ? tags.filter((t): t is string => typeof t === 'string')
      : [];

    // Create document
    const document = await prisma.document.create({
      data: {
        title: title.trim(),
        rawText: text.trim(),
        tags: parsedTags,
      },
    });

    // Split into chunks
    const chunks = splitTextIntoChunks(text.trim());

    if (chunks.length === 0) {
      return NextResponse.json({
        document: {
          id: document.id,
          title: document.title,
          tags: document.tags,
          createdAt: document.createdAt,
        },
        chunksCount: 0,
      });
    }

    // Generate embeddings for all chunks
    const embeddings = await embedTexts(chunks);

    // Insert chunks with embeddings using raw SQL (for pgvector)
    for (let i = 0; i < chunks.length; i++) {
      const embeddingStr = formatEmbeddingForPg(embeddings[i]);
      await prisma.$executeRaw`
        INSERT INTO "Chunk" (id, "documentId", content, embedding, "createdAt")
        VALUES (
          ${`${document.id}-chunk-${i}`},
          ${document.id},
          ${chunks[i]},
          ${embeddingStr}::vector,
          NOW()
        )
      `;
    }

    return NextResponse.json({
      document: {
        id: document.id,
        title: document.title,
        tags: document.tags,
        createdAt: document.createdAt,
      },
      chunksCount: chunks.length,
    });
  } catch (error) {
    console.error('Error ingesting document:', error);
    return NextResponse.json(
      { error: 'Failed to ingest document' },
      { status: 500 }
    );
  }
}
