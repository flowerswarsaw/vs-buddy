import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAdminAuth } from '@/lib/api-utils';
import { ValidationError } from '@/lib/errors';

const DEFAULT_SETTINGS = {
  systemPrompt: `You are VS Buddy, an internal assistant for the company. Be helpful, concise, and practical. Answer questions based on the knowledge base provided to you.`,
  modelName: 'gpt-4o-mini',
  temperature: 0.7,
  maxTokens: null,
};

// GET /api/admin/settings - Get current settings
export const GET = withAdminAuth(async () => {
  let settings = await prisma.settings.findFirst();

  if (!settings) {
    // Create default settings if none exist
    settings = await prisma.settings.create({
      data: DEFAULT_SETTINGS,
    });
  }

  return NextResponse.json(settings);
});

// PUT /api/admin/settings - Update settings
export const PUT = withAdminAuth(async (request: NextRequest, session) => {
  const body = await request.json();
  const { systemPrompt, modelName, temperature, maxTokens } = body;

  // Validate inputs
  if (systemPrompt !== undefined && typeof systemPrompt !== 'string') {
    throw new ValidationError('systemPrompt must be a string', {
      userId: session.user.id,
      path: request.nextUrl.pathname,
      method: request.method,
    });
  }

  if (modelName !== undefined && typeof modelName !== 'string') {
    throw new ValidationError('modelName must be a string', {
      userId: session.user.id,
      path: request.nextUrl.pathname,
      method: request.method,
    });
  }

  if (temperature !== undefined && (typeof temperature !== 'number' || temperature < 0 || temperature > 2)) {
    throw new ValidationError('temperature must be a number between 0 and 2', {
      userId: session.user.id,
      path: request.nextUrl.pathname,
      method: request.method,
    });
  }

  // Get existing settings or create new
  let settings = await prisma.settings.findFirst();

  const updateData = {
    ...(systemPrompt !== undefined && { systemPrompt }),
    ...(modelName !== undefined && { modelName }),
    ...(temperature !== undefined && { temperature }),
    ...(maxTokens !== undefined && { maxTokens }),
  };

  if (settings) {
    settings = await prisma.settings.update({
      where: { id: settings.id },
      data: updateData,
    });
  } else {
    settings = await prisma.settings.create({
      data: {
        ...DEFAULT_SETTINGS,
        ...updateData,
      },
    });
  }

  return NextResponse.json(settings);
});
