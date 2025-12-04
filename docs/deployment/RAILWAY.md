# VS Buddy - Railway Deployment Guide

## Overview

This guide walks you through deploying VS Buddy to Railway, a platform that provides always-on containers with zero cold starts.

**Recommended for:**
- Medium to high traffic applications
- Production workloads requiring consistent performance
- Teams that need always-on services
- WebSocket/streaming applications

**Advantages over Vercel:**
- ✅ No cold starts (always-on containers)
- ✅ Longer execution times (no 10-second limit)
- ✅ Persistent database connections
- ✅ Better for WebSocket/SSE streaming
- ✅ Integrated PostgreSQL with pgvector

---

## Prerequisites

- Railway account ([sign up free](https://railway.app/))
- GitHub/GitLab account
- OpenAI API key

---

## Step 1: Create Railway Project

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Authorize Railway to access your repositories
5. Select your VS Buddy repository

---

## Step 2: Add PostgreSQL Database

1. In your Railway project, click "New"
2. Select "Database" > "Add PostgreSQL"
3. Railway will create a PostgreSQL instance
4. Click on the PostgreSQL service
5. Go to "Variables" tab
6. Note the `DATABASE_URL` (automatically configured)

### Enable pgvector Extension

1. Click on PostgreSQL service
2. Go to "Data" tab or connect via CLI:
   ```bash
   railway connect postgres
   ```
3. Run SQL command:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
4. Verify:
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'vector';
   ```

---

## Step 3: Configure Environment Variables

In Railway Dashboard > Your Service > Variables, add:

### Required Variables

```bash
# OpenAI
OPENAI_API_KEY=sk-...

# Authentication
AUTH_SECRET=<generate with: openssl rand -base64 32>
NEXTAUTH_URL=${{RAILWAY_PUBLIC_DOMAIN}}  # Railway auto-fills this

# Node Environment
NODE_ENV=production
```

### Optional Variables

```bash
# Sentry (Error Tracking)
SENTRY_DSN=https://xxx@o123456.ingest.sentry.io/7654321
NEXT_PUBLIC_SENTRY_DSN=https://xxx@o123456.ingest.sentry.io/7654321

# OpenAI Configuration
OPENAI_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Database Connection Pool (optional)
DATABASE_URL=${{DATABASE_URL}}?connection_limit=10&pool_timeout=30
```

**Note:** `DATABASE_URL` is automatically set by Railway when you add PostgreSQL. No need to manually configure it.

---

## Step 4: Configure Build Settings

Railway auto-detects Next.js projects. Verify settings:

1. Click on your service
2. Go to "Settings" tab
3. Verify:
   - **Build Command:** `pnpm install && pnpm build` (auto-detected)
   - **Start Command:** `pnpm start` (auto-detected)
   - **Watch Paths:** `/` (auto-detected)

### Custom Build (if needed)

If you need custom build settings:

**Create `railway.json` in project root:**
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "pnpm install && pnpm prisma generate && pnpm build"
  },
  "deploy": {
    "startCommand": "pnpm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

---

## Step 5: Initialize Database

After deployment, run Prisma migrations:

### Option A: Railway CLI (Recommended)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Run migrations
railway run pnpm prisma db push

# Seed database
railway run pnpm prisma db seed
```

### Option B: Connect Directly

```bash
# Get DATABASE_URL from Railway dashboard
export DATABASE_URL="postgresql://postgres:xxx@containers-us-west-xxx.railway.app:5432/railway"

# Run migrations
pnpm prisma db push

# Seed database
pnpm prisma db seed
```

---

## Step 6: Deploy

Railway automatically deploys on every git push:

```bash
git add .
git commit -m "Initial deployment"
git push origin main
```

Railway will:
1. Detect changes
2. Build your application
3. Deploy to production
4. Assign a public domain (e.g., `vs-buddy-production.up.railway.app`)

---

## Step 7: Verify Deployment

1. **Get your domain:**
   - Railway Dashboard > Your Service > Settings > "Generate Domain"
   - Note the public URL

2. **Health Check:**
   ```bash
   curl https://vs-buddy-production.up.railway.app/api/health
   ```
   Expected: `{"status": "healthy", ...}`

3. **Login:**
   - Go to your Railway domain
   - Log in with:
     - Email: `admin@example.com`
     - Password: `changeme123`
   - **IMPORTANT:** Change password immediately!

4. **Test Chat:**
   - Create a new conversation
   - Send a test message
   - Verify OpenAI response

---

## Step 8: Custom Domain (Optional)

1. Go to Railway Dashboard > Your Service > Settings
2. Scroll to "Domains"
3. Click "Custom Domain"
4. Add your domain (e.g., `chat.yourcompany.com`)
5. Configure DNS:
   - Add CNAME record: `chat` → `vs-buddy-production.up.railway.app`
6. Update `NEXTAUTH_URL`:
   ```bash
   NEXTAUTH_URL=https://chat.yourcompany.com
   ```
7. Railway will auto-provision SSL certificate

---

## Performance Optimization

### Resource Allocation

**Starter Plan (Free):**
- 512 MB RAM
- 1 vCPU
- 500 hours/month execution time
- Shared resources

**Developer Plan ($5/month per service):**
- Up to 8 GB RAM
- Up to 8 vCPUs
- Unlimited execution time
- Better performance

### Configure Resources

1. Go to Railway Dashboard > Service > Settings
2. Scroll to "Resources"
3. Adjust based on traffic:
   - **Low traffic (< 1000 req/day):** 512 MB RAM, 0.5 vCPU
   - **Medium traffic (< 10,000 req/day):** 1 GB RAM, 1 vCPU
   - **High traffic (< 100,000 req/day):** 2 GB RAM, 2 vCPUs

### Database Connection Pooling

Railway PostgreSQL includes connection pooling by default. Optimize with:

```bash
# In DATABASE_URL variable
${{DATABASE_URL}}?connection_limit=20&pool_timeout=30&connect_timeout=10
```

### Enable HTTP/2

Railway automatically enables HTTP/2 for better performance. No configuration needed.

---

## Monitoring & Logging

### View Logs

**Via Dashboard:**
1. Railway Dashboard > Your Service
2. Click "View Logs"
3. Real-time log streaming

**Via CLI:**
```bash
railway logs
```

### Metrics

Railway provides built-in metrics:
1. Go to Service > "Metrics" tab
2. View:
   - CPU usage
   - Memory usage
   - Network traffic
   - Response times

### Sentry Integration

Follow [Sentry Setup Guide](../SENTRY_SETUP.md) for error tracking.

---

## Auto-Scaling (Optional)

Railway supports horizontal scaling (Pro plan):

```bash
# railway.json
{
  "deploy": {
    "replicas": {
      "min": 1,
      "max": 5
    }
  }
}
```

**Note:** Requires load balancer configuration for multiple replicas.

---

## CI/CD & Deployment

### Automatic Deployments

Railway auto-deploys on push to main branch.

### Branch Previews

Every branch gets a preview deployment:
- Push to feature branch
- Railway creates ephemeral environment
- Test changes before merging

### Manual Rollback

1. Go to Railway Dashboard > Service > "Deployments"
2. Find previous working deployment
3. Click "..." > "Rollback"

---

## Backup & Disaster Recovery

### Database Backups

**Automatic Backups:**
- Railway Pro: Automatic daily backups (7-day retention)
- Starter: No automatic backups

**Manual Backup:**
```bash
# Connect to database
railway connect postgres

# Or use pg_dump
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql
```

**Restore from Backup:**
```bash
psql $DATABASE_URL < backup-20250101.sql
```

### Application Snapshot

Create snapshot of environment variables:
```bash
railway variables --json > variables-backup.json
```

Restore variables:
```bash
cat variables-backup.json | railway variables --import
```

---

## Cost Estimation

### Railway Pricing

**Hobby (Free):**
- $5 free credit/month
- 500 hours execution time
- Best for: Development, testing, low-traffic apps

**Developer ($5/month per service):**
- Usage-based pricing: ~$0.000002/GB-second
- Typical cost: $5-20/month for small apps
- Best for: Production apps with medium traffic

**Pro ($20/month + usage):**
- Advanced features (backups, autoscaling)
- Priority support
- Best for: High-traffic production apps

### Cost Breakdown Example

**Small Production App:**
- App Service: $10/month
- PostgreSQL: $8/month
- OpenAI API: $50/month
- **Total: $68/month**

**Medium Production App:**
- App Service: $20/month (2 GB RAM)
- PostgreSQL: $15/month (larger instance)
- OpenAI API: $150/month
- **Total: $185/month**

---

## Troubleshooting

### Build Fails

**Error:** `pnpm: command not found`
- **Solution:** Railway should auto-detect pnpm. Force detection:
  ```json
  // railway.json
  {
    "build": {
      "builder": "NIXPACKS"
    }
  }
  ```

**Error:** `Prisma schema not found`
- **Solution:** Ensure `postinstall` script runs `prisma generate`:
  ```json
  // package.json
  {
    "scripts": {
      "postinstall": "prisma generate"
    }
  }
  ```

### Database Connection Issues

**Error:** `P1001: Can't reach database server`
- **Solution:** Verify pgvector extension is installed
- Check Railway PostgreSQL service is running
- Restart database service if needed

**Error:** `too many connections`
- **Solution:** Add connection pooling to DATABASE_URL:
  ```bash
  ?connection_limit=10&pool_timeout=30
  ```

### Application Crashes

**Error:** Out of memory (OOM)
- **Solution:** Increase RAM allocation in Service Settings
- Check for memory leaks in logs
- Optimize database queries

**Error:** Container restart loop
- **Solution:** Check logs for startup errors
- Verify all environment variables are set
- Ensure database is accessible

---

## Security Best Practices

1. **Enable Private Networking:** Connect app and database via private network (faster + more secure)
2. **Restrict Database Access:** Use Railway's internal networking (no public exposure)
3. **Rotate Secrets:** Change `AUTH_SECRET` periodically
4. **Monitor Access:** Review deployment logs regularly
5. **Use Branch Deployments:** Test changes before merging to production

---

## Migration from Vercel

If migrating from Vercel to Railway:

1. **Export database:**
   ```bash
   pg_dump $VERCEL_DATABASE_URL > migration.sql
   ```

2. **Import to Railway:**
   ```bash
   psql $RAILWAY_DATABASE_URL < migration.sql
   ```

3. **Update environment variables** in Railway

4. **Deploy to Railway** (follow steps above)

5. **Update DNS** to point to Railway domain

6. **Monitor both deployments** for 24-48 hours

7. **Shut down Vercel deployment** once stable

---

## Next Steps

- [Configure monitoring dashboards](../ops/monitoring.md)
- [Set up Sentry error tracking](../SENTRY_SETUP.md)
- [Review production readiness checklist](../PRODUCTION_READINESS.md)
- [Explore optimization strategies](./optimization.md)

---

## Support

For Railway-specific issues:
- [Railway Documentation](https://docs.railway.app/)
- [Railway Discord Community](https://discord.gg/railway)

For VS Buddy issues:
- Check `/docs/PRODUCTION_READINESS.md`
- Review health endpoint: `/api/health?detailed=true`
