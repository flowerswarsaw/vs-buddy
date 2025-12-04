import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { splitTextIntoChunks, embedTexts, formatEmbeddingForPg } from '@/lib/rag';
import {
  parseFileContent,
  validateFileSize,
  isSupportedFileType,
  getTitleFromFilename,
  getSupportedExtensionsString,
} from '@/lib/file-parser';
import { withAdminAuth } from '@/lib/api-utils';
import { FileUploadError, ErrorCode } from '@/lib/errors';

// POST /api/admin/upload - Upload and ingest a file
export const POST = withAdminAuth(async (request: NextRequest, session) => {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const titleInput = formData.get('title') as string | null;
  const tagsInput = formData.get('tags') as string | null;

  // Validate file
  if (!file) {
    throw new FileUploadError('No file provided', ErrorCode.INVALID_INPUT, {
      userId: session.user.id,
      path: request.nextUrl.pathname,
      method: request.method,
    });
  }

  if (!isSupportedFileType(file.name)) {
    throw new FileUploadError(
      `Unsupported file type. Supported: ${getSupportedExtensionsString()}`,
      ErrorCode.INVALID_FILE_TYPE,
      {
        userId: session.user.id,
        path: request.nextUrl.pathname,
        method: request.method,
        metadata: { filename: file.name },
      }
    );
  }

  try {
    validateFileSize(file.size);
  } catch (err) {
    throw new FileUploadError(
      err instanceof Error ? err.message : 'File too large',
      ErrorCode.FILE_TOO_LARGE,
      {
        userId: session.user.id,
        path: request.nextUrl.pathname,
        method: request.method,
        metadata: { fileSize: file.size },
      }
    );
  }

  // Parse file content
  let text: string;
  try {
    const buffer = await file.arrayBuffer();
    text = await parseFileContent(buffer, file.name);
  } catch (err) {
    throw new FileUploadError(
      err instanceof Error ? err.message : 'Failed to parse file',
      ErrorCode.INVALID_INPUT,
      {
        userId: session.user.id,
        path: request.nextUrl.pathname,
        method: request.method,
        metadata: { filename: file.name },
      }
    );
  }

  // Determine title
  const title = titleInput?.trim() || getTitleFromFilename(file.name);

  // Parse tags
  const tags: string[] = tagsInput
    ? tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
    : [];

  // Create document
  const document = await prisma.document.create({
    data: {
      title,
      rawText: text,
      tags,
    },
  });

  // Split into chunks
  const chunks = splitTextIntoChunks(text);

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
