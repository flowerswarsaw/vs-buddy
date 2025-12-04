import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAdminAuth } from '@/lib/api-utils';

// GET /api/admin/documents - List all documents
export const GET = withAdminAuth(async () => {
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
});
