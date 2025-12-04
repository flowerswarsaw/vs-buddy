import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { splitTextIntoChunks, embedTexts, formatEmbeddingForPg } from '@/lib/rag';
import {
  parseFileContent,
  validateFileSize,
  isSupportedFileType,
  getTitleFromFilename,
  getSupportedExtensionsString,
} from '@/lib/file-parser';

// POST /api/admin/upload - Upload and ingest a file
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const titleInput = formData.get('title') as string | null;
    const tagsInput = formData.get('tags') as string | null;

    // Validate file
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!isSupportedFileType(file.name)) {
      return NextResponse.json(
        { error: `Unsupported file type. Supported: ${getSupportedExtensionsString()}` },
        { status: 400 }
      );
    }

    try {
      validateFileSize(file.size);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'File too large' },
        { status: 400 }
      );
    }

    // Parse file content
    let text: string;
    try {
      const buffer = await file.arrayBuffer();
      text = await parseFileContent(buffer, file.name);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to parse file' },
        { status: 400 }
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
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { error: 'Failed to process file' },
      { status: 500 }
    );
  }
}
