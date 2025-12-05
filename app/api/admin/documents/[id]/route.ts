import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAdminAuth, RouteContext } from '@/lib/api-utils';
import { NotFoundError, ValidationError } from '@/lib/errors';

// GET /api/admin/documents/[id] - Get a single document with full details
export const GET = withAdminAuth<unknown, { id: string }>(async (
  request,
  session,
  context
) => {
  if (!context) {
    throw new ValidationError('Invalid route context', {
      userId: session.user?.id,
      path: request.nextUrl.pathname,
      method: request.method,
    });
  }

  const { id } = await context.params;

  const document = await prisma.document.findUnique({
    where: { id },
    include: {
      _count: {
        select: { chunks: true },
      },
    },
  });

  if (!document) {
    throw new NotFoundError('Document', {
      userId: session.user?.id,
      path: request.nextUrl.pathname,
      method: request.method,
    });
  }

  return NextResponse.json({
    id: document.id,
    title: document.title,
    rawText: document.rawText,
    tags: document.tags,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    chunksCount: document._count.chunks,
  });
});

// PATCH /api/admin/documents/[id] - Update document metadata (title, tags)
export const PATCH = withAdminAuth<unknown, { id: string }>(async (
  request,
  session,
  context
) => {
  if (!context) {
    throw new ValidationError('Invalid route context', {
      userId: session.user?.id,
      path: request.nextUrl.pathname,
      method: request.method,
    });
  }

  const { id } = await context.params;
  const body = await request.json();
  const { title, tags } = body;

  // Check document exists
  const existing = await prisma.document.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new NotFoundError('Document', {
      userId: session.user?.id,
      path: request.nextUrl.pathname,
      method: request.method,
    });
  }

  // Build update data
  const updateData: { title?: string; tags?: string[] } = {};

  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim().length === 0) {
      throw new ValidationError('Title must be a non-empty string', {
        userId: session.user?.id,
        path: request.nextUrl.pathname,
        method: request.method,
      });
    }
    updateData.title = title.trim();
  }

  if (tags !== undefined) {
    if (!Array.isArray(tags)) {
      throw new ValidationError('Tags must be an array', {
        userId: session.user?.id,
        path: request.nextUrl.pathname,
        method: request.method,
      });
    }
    updateData.tags = tags.filter((t): t is string => typeof t === 'string');
  }

  const document = await prisma.document.update({
    where: { id },
    data: updateData,
    include: {
      _count: {
        select: { chunks: true },
      },
    },
  });

  return NextResponse.json({
    id: document.id,
    title: document.title,
    tags: document.tags,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    chunksCount: document._count.chunks,
  });
});

// DELETE /api/admin/documents/[id] - Delete a document (chunks cascade)
export const DELETE = withAdminAuth<unknown, { id: string }>(async (
  request,
  session,
  context
) => {
  if (!context) {
    throw new ValidationError('Invalid route context', {
      userId: session.user?.id,
      path: request.nextUrl.pathname,
      method: request.method,
    });
  }

  const { id } = await context.params;

  // Check document exists
  const existing = await prisma.document.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new NotFoundError('Document', {
      userId: session.user?.id,
      path: request.nextUrl.pathname,
      method: request.method,
    });
  }

  // Delete document (chunks cascade automatically via Prisma schema)
  await prisma.document.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
});
