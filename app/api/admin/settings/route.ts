import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const DEFAULT_SETTINGS = {
  systemPrompt: `You are VS Buddy, an internal assistant for the company. Be helpful, concise, and practical. Answer questions based on the knowledge base provided to you.`,
  modelName: 'gpt-4o-mini',
  temperature: 0.7,
  maxTokens: null,
};

// GET /api/admin/settings - Get current settings
export async function GET() {
  try {
    let settings = await prisma.settings.findFirst();

    if (!settings) {
      // Create default settings if none exist
      settings = await prisma.settings.create({
        data: DEFAULT_SETTINGS,
      });
    }

    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

// PUT /api/admin/settings - Update settings
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { systemPrompt, modelName, temperature, maxTokens } = body;

    // Validate inputs
    if (systemPrompt !== undefined && typeof systemPrompt !== 'string') {
      return NextResponse.json(
        { error: 'systemPrompt must be a string' },
        { status: 400 }
      );
    }

    if (modelName !== undefined && typeof modelName !== 'string') {
      return NextResponse.json(
        { error: 'modelName must be a string' },
        { status: 400 }
      );
    }

    if (temperature !== undefined && (typeof temperature !== 'number' || temperature < 0 || temperature > 2)) {
      return NextResponse.json(
        { error: 'temperature must be a number between 0 and 2' },
        { status: 400 }
      );
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
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
