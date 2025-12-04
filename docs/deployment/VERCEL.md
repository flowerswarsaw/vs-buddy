# VS Buddy - Vercel Deployment Guide

## Overview

This guide walks you through deploying VS Buddy to Vercel, a serverless platform optimized for Next.js applications.

**Recommended for:**
- Quick deployment and testing
- Small to medium traffic (< 10,000 requests/day)
- Internal tools and MVPs
- Teams wanting minimal DevOps overhead

---

## Prerequisites

- Vercel account ([sign up free](https://vercel.com/signup))
- GitHub/GitLab/Bitbucket account
- PostgreSQL database with pgvector extension (use Neon or Supabase)
- OpenAI API key

---

## Step 1: Prepare Your Database

### Option A: Neon (Recommended)

1. Go to [Neon Console](https://console.neon.tech/)
2. Create a new project
3. Click "Enable pgvector" in the Extensions section
4. Copy the connection string (format: `postgresql://user:pass@host/db?sslmode=require`)

### Option B: Supabase

1. Go to [Supabase Dashboard](https://app.supabase.com/)
2. Create a new project
3. Go to SQL Editor and run:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
4. Get connection string from Project Settings > Database
5. Use the **Transaction** connection string (not Session)

---

## Step 2: Push Code to Git

1. Initialize git repository (if not already done):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. Push to GitHub:
   ```bash
   git remote add origin https://github.com/your-username/vs-buddy.git
   git branch -M main
   git push -u origin main
   ```

---

## Step 3: Deploy to Vercel

### Via Vercel Dashboard

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New..." > "Project"
3. Import your GitHub repository
4. Configure project:
   - **Framework Preset:** Next.js
   - **Root Directory:** ./
   - **Build Command:** `pnpm build` (auto-detected)
   - **Output Directory:** `.next` (auto-detected)

### Via Vercel CLI (Alternative)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Follow prompts to link project
```

---

## Step 4: Configure Environment Variables

In Vercel Dashboard > Your Project > Settings > Environment Variables, add:

### Required Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require

# OpenAI
OPENAI_API_KEY=sk-...

# Authentication
AUTH_SECRET=<generate with: openssl rand -base64 32>
NEXTAUTH_URL=https://your-app.vercel.app
```

### Optional Variables

```bash
# Sentry (Error Tracking)
SENTRY_DSN=https://xxx@o123456.ingest.sentry.io/7654321
NEXT_PUBLIC_SENTRY_DSN=https://xxx@o123456.ingest.sentry.io/7654321

# OpenAI Configuration (optional)
OPENAI_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

**Important:** Add these variables to:
- ✅ Production
- ✅ Preview (optional - for testing)
- ✅ Development (optional - for `vercel dev`)

---

## Step 5: Initialize Database

After deployment, run Prisma migrations:

### Option A: Via Terminal (Recommended)

```bash
# Install dependencies locally
pnpm install

# Set DATABASE_URL in .env.local
echo "DATABASE_URL=<your-production-db-url>" > .env.local

# Push schema
pnpm prisma db push

# Seed database (creates admin user)
pnpm prisma db seed
```

### Option B: Via Vercel CLI

```bash
# Pull environment variables
vercel env pull .env.local

# Run migrations
pnpm prisma db push

# Seed database
pnpm prisma db seed
```

---

## Step 6: Verify Deployment

1. **Health Check:**
   ```bash
   curl https://your-app.vercel.app/api/health
   ```
   Expected: `{"status": "healthy", ...}`

2. **Login:**
   - Go to `https://your-app.vercel.app`
   - Log in with:
     - Email: `admin@example.com`
     - Password: `changeme123`
   - **IMPORTANT:** Change password immediately!

3. **Test Chat:**
   - Create a new conversation
   - Send a test message
   - Verify OpenAI response

---

## Step 7: Custom Domain (Optional)

1. Go to Vercel Dashboard > Your Project > Settings > Domains
2. Add your domain (e.g., `chat.yourcompany.com`)
3. Follow DNS configuration instructions
4. Update `NEXTAUTH_URL` to your custom domain:
   ```bash
   NEXTAUTH_URL=https://chat.yourcompany.com
   ```
5. Redeploy to apply changes

---

## Performance Considerations

### Serverless Limitations

**Pros:**
- Auto-scaling
- Zero maintenance
- Cost-effective for low traffic

**Cons:**
- Cold starts (first request takes ~1-3s)
- 10-second execution timeout (Edge Functions: 30s)
- No persistent connections to database

### Optimization Tips

1. **Use Connection Pooling:**
   Update `DATABASE_URL` to include pooling:
   ```bash
   # Neon example (built-in pooling)
   DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/db?sslmode=require

   # Supabase example (use transaction mode)
   DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.xxx.supabase.co:5432/postgres?pgbouncer=true&connection_limit=1
   ```

2. **Enable Vercel Edge Functions (Optional):**
   For faster response times, deploy API routes as Edge Functions:
   ```typescript
   // app/api/health/route.ts
   export const runtime = 'edge'; // Add this line
   ```

3. **Reduce Cold Starts:**
   - Use Vercel Pro plan ($20/month) for better cold start performance
   - Consider keeping functions warm with a cron job (external service)

---

## Monitoring & Debugging

### View Logs

1. Vercel Dashboard > Your Project > Deployments
2. Click on a deployment
3. View "Functions" tab for logs

### Enable Sentry

Follow [Sentry Setup Guide](../SENTRY_SETUP.md) to enable error tracking.

### Performance Metrics

Check performance at: `https://your-app.vercel.app/api/admin/analytics`

---

## Updating Your Deployment

Vercel auto-deploys on every git push:

```bash
git add .
git commit -m "Update feature"
git push origin main
```

Vercel will:
1. Build your app
2. Run automatic checks
3. Deploy to production (if on `main` branch)

### Preview Deployments

- Every branch gets a unique preview URL
- Test changes before merging to main

---

## Cost Estimation

### Vercel Pricing

**Hobby (Free):**
- Up to 100 GB bandwidth
- Unlimited deployments
- Best for: Personal projects, MVPs

**Pro ($20/month):**
- 1 TB bandwidth
- Better cold start performance
- Team collaboration features
- Best for: Production apps with < 100K requests/month

**Enterprise (Custom):**
- Dedicated support
- SLA guarantees
- Best for: High-traffic applications

### Database Pricing

**Neon:**
- Free tier: 0.5 GB storage, 3 projects
- Pro: Starting at $19/month

**Supabase:**
- Free tier: 500 MB storage, 2 GB bandwidth
- Pro: Starting at $25/month

### Total Monthly Cost

**Hobby Setup:**
- Vercel: $0
- Neon/Supabase: $0
- OpenAI: ~$10-50 (depending on usage)
- **Total: $10-50/month**

**Production Setup:**
- Vercel Pro: $20
- Neon/Supabase Pro: $19-25
- OpenAI: ~$50-200 (depending on usage)
- **Total: $90-250/month**

---

## Troubleshooting

### Build Fails

**Error:** `Module not found`
- **Solution:** Ensure all dependencies are in `package.json`
- Run `pnpm install` locally and commit changes

**Error:** `Prisma schema not found`
- **Solution:** Ensure `prisma/schema.prisma` is committed to git

### Database Connection Fails

**Error:** `P1001: Can't reach database server`
- **Solution:** Check `DATABASE_URL` is correct and includes `sslmode=require`
- Verify database allows connections from Vercel IPs (0.0.0.0/0 for serverless)

**Error:** `too many clients`
- **Solution:** Enable connection pooling (see Performance section above)
- Reduce `connection_limit` in DATABASE_URL

### API Timeout

**Error:** `FUNCTION_INVOCATION_TIMEOUT`
- **Solution:** OpenAI request took > 10 seconds
- Upgrade to Vercel Pro for 30-second Edge Functions
- Or optimize OpenAI requests (smaller models, shorter context)

### Cold Start Issues

**Problem:** First request takes 2-3 seconds
- **Solution:** Expected behavior for serverless
- Upgrade to Vercel Pro for better cold starts
- Consider Railway or self-hosted for always-on containers

---

## Security Best Practices

1. **Change default admin password** immediately after first login
2. **Enable 2FA** for your Vercel account
3. **Restrict database access** to Vercel IPs only (if possible)
4. **Rotate AUTH_SECRET** periodically
5. **Monitor logs** for suspicious activity (use Sentry)
6. **Review environment variables** - ensure no secrets in git

---

## Backup & Disaster Recovery

### Database Backups

**Neon:**
- Automatic daily backups (7-day retention)
- Point-in-time recovery available on paid plans

**Supabase:**
- Automatic daily backups (free tier: 7 days, Pro: 30 days)
- Manual backup via SQL dump:
  ```bash
  pg_dump $DATABASE_URL > backup.sql
  ```

### Application Rollback

If a deployment breaks:
1. Go to Vercel Dashboard > Deployments
2. Find last working deployment
3. Click "..." > "Promote to Production"

---

## Next Steps

- [Configure Sentry error tracking](../SENTRY_SETUP.md)
- [Set up monitoring dashboards](../ops/monitoring.md)
- [Review production readiness checklist](../PRODUCTION_READINESS.md)
- [Explore optimization strategies](./optimization.md)

---

## Support

For Vercel-specific issues:
- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Support](https://vercel.com/support)

For VS Buddy issues:
- Check `/docs/PRODUCTION_READINESS.md`
- Review health endpoint: `/api/health?detailed=true`
