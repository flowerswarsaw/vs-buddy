import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth-utils';
import { withAdminAuth } from '@/lib/api-utils';
import { ValidationError } from '@/lib/errors';

// GET /api/admin/users - List all users
export const GET = withAdminAuth(async () => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(users);
});

// POST /api/admin/users - Create a new user
export const POST = withAdminAuth(async (request: NextRequest, session) => {
  const body = await request.json();
  const { email, name, password, role = 'USER' } = body;

  // Validate inputs
  if (!email || typeof email !== 'string') {
    throw new ValidationError('Email is required', {
      userId: session.user.id,
      path: request.nextUrl.pathname,
      method: request.method,
    });
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters', {
      userId: session.user.id,
      path: request.nextUrl.pathname,
      method: request.method,
    });
  }

  if (role !== 'USER' && role !== 'ADMIN') {
    throw new ValidationError('Invalid role', {
      userId: session.user.id,
      path: request.nextUrl.pathname,
      method: request.method,
    });
  }

  // Check if email already exists
  const existing = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existing) {
    throw new ValidationError('Email already exists', {
      userId: session.user.id,
      path: request.nextUrl.pathname,
      method: request.method,
    });
  }

  // Create user
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      name: name || null,
      passwordHash,
      role,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
  });

  return NextResponse.json(user);
});
