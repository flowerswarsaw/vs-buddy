import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { AuthError } from '@/lib/errors';
import { handleApiError } from '@/lib/error-handler';
import { validateRequestBody } from '@/lib/validation/validator';
import { createConversationSchema } from '@/lib/validation/schemas';
import { checkRateLimit, RateLimits } from '@/lib/rate-limit';

// GET /api/conversations - List user's conversations
export async function GET(request: NextRequest) {
  // Apply rate limiting for read operations
  const rateLimitResponse = await checkRateLimit(request, RateLimits.READ);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const requestId = crypto.randomUUID();

  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new AuthError('Unauthorized', undefined, { requestId });
    }

    const conversations = await prisma.conversation.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return NextResponse.json(conversations);
  } catch (error) {
    return handleApiError(error, {
      requestId,
      userId: (await auth())?.user?.id,
      path: '/api/conversations',
      method: 'GET',
    });
  }
}

// POST /api/conversations - Create a new conversation
export async function POST(request: NextRequest) {
  // Apply rate limiting for write operations
  const rateLimitResponse = await checkRateLimit(request, RateLimits.READ);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const requestId = crypto.randomUUID();

  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new AuthError('Unauthorized', undefined, { requestId });
    }

    const userId = session.user.id;

    // Validate and sanitize request body (optional title)
    const validationResult = await validateRequestBody(
      request,
      createConversationSchema,
      { requestId, userId }
    );

    if (!validationResult.success) {
      throw validationResult.error;
    }

    const { title } = validationResult.data;

    const conversation = await prisma.conversation.create({
      data: {
        title: title || null,
        userId,
      },
    });

    return NextResponse.json(conversation);
  } catch (error) {
    return handleApiError(error, {
      requestId,
      userId: (await auth())?.user?.id,
      path: '/api/conversations',
      method: 'POST',
    });
  }
}
