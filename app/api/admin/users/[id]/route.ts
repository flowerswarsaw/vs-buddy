import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth-utils';
import { withAdminAuth } from '@/lib/api-utils';
import { NotFoundError, ValidationError } from '@/lib/errors';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PATCH /api/admin/users/[id] - Update a user
export const PATCH = withAdminAuth(async (
  request: NextRequest,
  session,
  context?: RouteContext
) => {
  if (!context) {
    throw new ValidationError('Invalid route context', {
      userId: session.user.id,
      path: request.nextUrl.pathname,
      method: request.method,
    });
  }

  const { id } = await context.params;
  const body = await request.json();
  const { name, role, password } = body;

  // Find existing user
  const existing = await prisma.user.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new NotFoundError('User', {
      userId: session.user.id,
      path: request.nextUrl.pathname,
      method: request.method,
    });
  }

  // Prevent admin from demoting themselves
  if (id === session.user.id && role && role !== 'ADMIN') {
    throw new ValidationError('Cannot change your own role', {
      userId: session.user.id,
      path: request.nextUrl.pathname,
      method: request.method,
    });
  }

  // Build update data
  const updateData: {
    name?: string | null;
    role?: 'USER' | 'ADMIN';
    passwordHash?: string;
  } = {};

  if (name !== undefined) {
    updateData.name = name || null;
  }

  if (role && (role === 'USER' || role === 'ADMIN')) {
    updateData.role = role;
  }

  if (password && typeof password === 'string' && password.length >= 8) {
    updateData.passwordHash = await hashPassword(password);
  }

  const user = await prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(user);
});

// DELETE /api/admin/users/[id] - Delete a user
export const DELETE = withAdminAuth(async (
  request: NextRequest,
  session,
  context?: RouteContext
) => {
  if (!context) {
    throw new ValidationError('Invalid route context', {
      userId: session.user.id,
      path: request.nextUrl.pathname,
      method: request.method,
    });
  }

  const { id } = await context.params;

  // Prevent admin from deleting themselves
  if (id === session.user.id) {
    throw new ValidationError('Cannot delete your own account', {
      userId: session.user.id,
      path: request.nextUrl.pathname,
      method: request.method,
    });
  }

  // Check user exists
  const existing = await prisma.user.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new NotFoundError('User', {
      userId: session.user.id,
      path: request.nextUrl.pathname,
      method: request.method,
    });
  }

  await prisma.user.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
});
