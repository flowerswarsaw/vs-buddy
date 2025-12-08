import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { clearCache } from '@/lib/rag';

// DELETE /api/admin/documents/bulk - Delete multiple documents
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { ids } = await request.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'ids must be a non-empty array' },
        { status: 400 }
      );
    }

    // Validate all IDs are strings
    if (!ids.every((id) => typeof id === 'string')) {
      return NextResponse.json(
        { error: 'All ids must be strings' },
        { status: 400 }
      );
    }

    // Delete documents (chunks will be cascade deleted)
    const result = await prisma.document.deleteMany({
      where: {
        id: { in: ids },
      },
    });

    // Clear RAG cache since documents changed
    clearCache();

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
    });
  } catch (error) {
    console.error('Error bulk deleting documents:', error);
    return NextResponse.json(
      { error: 'Failed to delete documents' },
      { status: 500 }
    );
  }
}
