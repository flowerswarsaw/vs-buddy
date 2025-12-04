import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/admin/documents - List all documents
export async function GET() {
  try {
    const documents = await prisma.document.findMany({
      select: {
        id: true,
        title: true,
        tags: true,
        createdAt: true,
        _count: {
          select: { chunks: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(
      documents.map((doc) => ({
        id: doc.id,
        title: doc.title,
        tags: doc.tags,
        createdAt: doc.createdAt,
        chunksCount: doc._count.chunks,
      }))
    );
  } catch (error) {
    console.error('Error fetching documents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch documents' },
      { status: 500 }
    );
  }
}
