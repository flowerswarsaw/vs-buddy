import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAdminAuth } from '@/lib/api-utils';
import { ValidationError } from '@/lib/errors';
import { config } from '@/lib/config';
import { getProviderType } from '@/lib/llm';

// Model options per provider
const OLLAMA_MODELS = [
  { value: 'llama3', label: 'Llama 3' },
  { value: 'llama3:70b', label: 'Llama 3 70B' },
  { value: 'mistral', label: 'Mistral' },
  { value: 'codellama', label: 'Code Llama' },
  { value: 'gemma2', label: 'Gemma 2' },
];

const OPENAI_MODELS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
];

function getDefaultModel(): string {
  const provider = getProviderType();
  return provider === 'ollama' ? config.ollamaChatModel : 'gpt-4o-mini';
}

function getAvailableModels() {
  const provider = getProviderType();
  return provider === 'ollama' ? OLLAMA_MODELS : OPENAI_MODELS;
}

const DEFAULT_SETTINGS = {
  systemPrompt: `You are VS Buddy, an internal assistant for the company. Be helpful, concise, and practical. Answer questions based on the knowledge base provided to you.`,
  modelName: getDefaultModel(),
  temperature: 0.7,
  maxTokens: null,
};

// GET /api/admin/settings - Get current settings
export const GET = withAdminAuth(async () => {
  let settings = await prisma.settings.findFirst();

  if (!settings) {
    // Create default settings if none exist
    settings = await prisma.settings.create({
      data: {
        ...DEFAULT_SETTINGS,
        modelName: getDefaultModel(),
      },
    });
  }

  // Return settings with provider info
  return NextResponse.json({
    ...settings,
    provider: getProviderType(),
    availableModels: getAvailableModels(),
  });
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
