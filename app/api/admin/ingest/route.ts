import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { splitTextIntoChunks, embedTexts, formatEmbeddingForPg } from '@/lib/rag';
import { withAdminAuth } from '@/lib/api-utils';
import { ValidationError } from '@/lib/errors';

// POST /api/admin/ingest - Ingest a new document
export const POST = withAdminAuth(async (request: NextRequest, session) => {
  const body = await request.json();
  const { title, text, tags } = body;

  // Validate inputs
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    throw new ValidationError('title is required and must be a non-empty string', {
      userId: session.user.id,
      path: request.nextUrl.pathname,
      method: request.method,
    });
  }

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new ValidationError('text is required and must be a non-empty string', {
      userId: session.user.id,
      path: request.nextUrl.pathname,
      method: request.method,
    });
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

  // Batch insert chunks with embeddings using single SQL statement (10x faster than sequential inserts)
  // Build VALUES clauses for all chunks
  const valuesList = chunks.map((chunk, i) => {
    const embeddingStr = formatEmbeddingForPg(embeddings[i]);
    const chunkId = `${document.id}-chunk-${i}`;
    // Use Prisma.sql for safe parameter interpolation, Prisma.raw for vector cast
    return Prisma.sql`(
      ${chunkId},
      ${document.id},
      ${chunk},
      ${Prisma.raw(`'${embeddingStr}'::vector`)},
      NOW()
    )`;
  });

  // Combine all VALUES into single INSERT statement
  const values = Prisma.join(valuesList, ',');

  await prisma.$executeRaw`
    INSERT INTO "Chunk" (id, "documentId", content, embedding, "createdAt")
    VALUES ${values}
  `;

  return NextResponse.json({
    document: {
      id: document.id,
      title: document.title,
      tags: document.tags,
      createdAt: document.createdAt,
    },
    chunksCount: chunks.length,
  });
});
