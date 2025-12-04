# VS Buddy

A production-grade RAG-powered internal knowledge assistant built with Next.js, OpenAI, and PostgreSQL with pgvector.

## Features

- **Chat Interface**: Simple, clean chat UI with conversation history
- **Knowledge Base**: Ingest text documents that get chunked and embedded for retrieval
- **RAG Pipeline**: Retrieval-Augmented Generation using OpenAI embeddings and chat completions
- **Admin Panel**: Configure system prompt, model settings, and manage knowledge base

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: PostgreSQL with pgvector extension
- **ORM**: Prisma
- **LLM**: OpenAI (gpt-4o-mini for chat, text-embedding-3-small for embeddings)

## Prerequisites

- Node.js 18+
- pnpm (or npm/yarn)
- PostgreSQL with pgvector extension enabled
  - Supabase, Neon, or any managed Postgres with pgvector works
  - Or local Postgres with `CREATE EXTENSION vector;`

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

Copy the example environment file:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your values:

```env
OPENAI_API_KEY=sk-your-openai-api-key
DATABASE_URL=postgresql://user:password@host:5432/vsbuddy
```

### 3. Set up the database

First, ensure the pgvector extension is enabled in your database:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Then run the migration:

```bash
# For development (creates tables and applies schema)
pnpm db:push

# Or for production (uses migration files)
npx prisma migrate deploy
```

Generate the Prisma client:

```bash
pnpm db:generate
```

### 4. Run the development server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) for the chat interface.
Open [http://localhost:3000/admin](http://localhost:3000/admin) for the admin panel.

## Usage

### Admin Panel (/admin)

1. **Configure Settings**: Set the system prompt and model parameters
2. **Ingest Documents**: Paste text content with a title and optional tags
3. **View Knowledge Base**: See all ingested documents and their chunk counts

### Chat Interface (/)

1. Start a new conversation or select an existing one
2. Ask questions - VS Buddy will search the knowledge base for relevant context
3. Responses are grounded in the ingested documents

## Project Structure

```
vs-buddy/
├── app/
│   ├── page.tsx                    # Chat UI
│   ├── admin/page.tsx              # Admin panel
│   └── api/
│       ├── chat/route.ts           # Chat endpoint (RAG pipeline)
│       ├── conversations/          # Conversation CRUD
│       └── admin/                  # Settings, ingest, documents
├── components/
│   ├── chat/                       # Chat UI components
│   └── admin/                      # Admin UI components
├── lib/
│   ├── db.ts                       # Prisma client
│   ├── openai.ts                   # OpenAI client
│   ├── config.ts                   # Configuration
│   └── rag/                        # RAG utilities
│       ├── chunk.ts                # Text splitting
│       ├── embed.ts                # Embeddings
│       ├── search.ts               # Vector search
│       └── prompt.ts               # Prompt building
└── prisma/
    └── schema.prisma               # Database schema
```

## RAG Configuration

Default settings (configurable via environment or admin panel):

- **Chunk size**: ~500 characters with 50 char overlap
- **Top-K retrieval**: 8 chunks
- **Conversation history**: Last 10 messages
- **Embedding model**: text-embedding-3-small (1536 dimensions)
- **Chat model**: gpt-4o-mini

## Scripts

```bash
pnpm dev          # Start development server
pnpm build        # Build for production
pnpm start        # Start production server
pnpm db:generate  # Generate Prisma client
pnpm db:push      # Push schema to database
pnpm db:migrate   # Run migrations
pnpm db:studio    # Open Prisma Studio
```

## Extending

The codebase is designed to be modular and extensible:

- **Different LLM providers**: Modify `lib/openai.ts` to add other providers
- **Multi-tenancy**: Add `userId`/`orgId` to Conversation, Document models
- **Authentication**: Add auth middleware to API routes
- **File uploads**: Extend the ingest endpoint to handle file parsing
