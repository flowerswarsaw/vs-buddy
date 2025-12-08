import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/admin/documents/[id]/preview - Get document with chunks for preview
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        chunks: {
          select: {
            id: true,
            content: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: document.id,
      title: document.title,
      rawText: document.rawText,
      tags: document.tags,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      chunks: document.chunks,
      chunksCount: document.chunks.length,
    });
  } catch (error) {
    console.error('Error fetching document preview:', error);
    return NextResponse.json(
      { error: 'Failed to fetch document preview' },
      { status: 500 }
    );
  }
}
