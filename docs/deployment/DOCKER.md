# VS Buddy - Docker Deployment Guide

## Overview

This guide walks you through self-hosting VS Buddy using Docker and Docker Compose.

**Recommended for:**
- Full control over infrastructure
- On-premise deployments
- High-traffic applications
- Compliance requirements (data residency, HIPAA, etc.)
- Cost optimization at scale

**Advantages:**
- ✅ Complete infrastructure control
- ✅ No vendor lock-in
- ✅ Cost-effective at scale
- ✅ Custom networking and security
- ✅ Air-gapped/offline deployments possible

---

## Prerequisites

- Docker 20.10+ ([install](https://docs.docker.com/engine/install/))
- Docker Compose 2.0+ ([install](https://docs.docker.com/compose/install/))
- 2 GB RAM minimum (4 GB recommended)
- 10 GB disk space
- OpenAI API key

---

## Quick Start

```bash
# Clone repository
git clone https://github.com/your-username/vs-buddy.git
cd vs-buddy

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
nano .env

# Start services
docker-compose up -d

# Initialize database
docker-compose exec app pnpm prisma db push
docker-compose exec app pnpm prisma db seed

# View logs
docker-compose logs -f app
```

Access VS Buddy at `http://localhost:3000`

---

## Step 1: Create Docker Files

### Dockerfile

Create `Dockerfile` in project root:

```dockerfile
# syntax=docker/dockerfile:1

FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Generate Prisma Client
RUN pnpm prisma generate

# Build Next.js application
ENV NEXT_TELEMETRY_DISABLED 1
RUN pnpm build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Set correct permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
```

### next.config.ts Update

Ensure your `next.config.ts` includes standalone output:

```typescript
const nextConfig: NextConfig = {
  output: 'standalone', // Add this line
  // ... other config
};
```

---

## Step 2: Create docker-compose.yml

Create `docker-compose.yml` in project root:

```yaml
version: '3.8'

services:
  # PostgreSQL Database
  postgres:
    image: pgvector/pgvector:pg16
    container_name: vs-buddy-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD:-changeme}
      POSTGRES_DB: vsbuddy
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  # VS Buddy Application
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: vs-buddy-app
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      # Database
      DATABASE_URL: postgresql://postgres:${DB_PASSWORD:-changeme}@postgres:5432/vsbuddy

      # OpenAI
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      OPENAI_MODEL: ${OPENAI_MODEL:-gpt-4o-mini}
      OPENAI_EMBEDDING_MODEL: ${OPENAI_EMBEDDING_MODEL:-text-embedding-3-small}

      # Authentication
      AUTH_SECRET: ${AUTH_SECRET}
      NEXTAUTH_URL: ${NEXTAUTH_URL:-http://localhost:3000}

      # Sentry (Optional)
      SENTRY_DSN: ${SENTRY_DSN:-}
      NEXT_PUBLIC_SENTRY_DSN: ${NEXT_PUBLIC_SENTRY_DSN:-}

      # Application
      NODE_ENV: production
    ports:
      - "3000:3000"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

volumes:
  postgres_data:
    driver: local

networks:
  default:
    name: vs-buddy-network
```

---

## Step 3: Configure Environment

Create `.env` file:

```bash
# Database
DB_PASSWORD=your-secure-password-here

# OpenAI
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Authentication (generate with: openssl rand -base64 32)
AUTH_SECRET=your-secret-here-generate-with-openssl-rand

# Application URL
NEXTAUTH_URL=http://localhost:3000

# Sentry (Optional)
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
```

**Generate AUTH_SECRET:**
```bash
openssl rand -base64 32
```

---

## Step 4: Build and Start

```bash
# Build images
docker-compose build

# Start services in detached mode
docker-compose up -d

# View logs
docker-compose logs -f

# Check status
docker-compose ps
```

---

## Step 5: Initialize Database

```bash
# Run Prisma migrations
docker-compose exec app pnpm prisma db push

# Seed database (creates admin user)
docker-compose exec app pnpm prisma db seed

# Verify database
docker-compose exec postgres psql -U postgres -d vsbuddy -c "\dx"
```

Expected output should include `vector` extension.

---

## Step 6: Verify Deployment

1. **Health Check:**
   ```bash
   curl http://localhost:3000/api/health
   ```

2. **Access Application:**
   - Go to `http://localhost:3000`
   - Login:
     - Email: `admin@example.com`
     - Password: `changeme123`
   - **IMPORTANT:** Change password immediately!

3. **Test Chat:**
   - Create a conversation
   - Send a test message
   - Verify OpenAI response

---

## Production Deployment

### Using Nginx Reverse Proxy

Create `nginx.conf`:

```nginx
events {
    worker_connections 1024;
}

http {
    upstream vsbuddy {
        server app:3000;
    }

    server {
        listen 80;
        server_name your-domain.com;

        # Security headers
        add_header X-Frame-Options "DENY" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;

        # Proxy to Next.js app
        location / {
            proxy_pass http://vsbuddy;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;

            # Timeouts
            proxy_connect_timeout 60s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
        }

        # Health check endpoint
        location /api/health {
            proxy_pass http://vsbuddy;
            access_log off;
        }
    }
}
```

Update `docker-compose.yml` to add Nginx:

```yaml
services:
  # ... existing services ...

  nginx:
    image: nginx:alpine
    container_name: vs-buddy-nginx
    depends_on:
      - app
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro  # SSL certificates
    restart: unless-stopped
```

### Enable HTTPS with Let's Encrypt

```bash
# Install certbot
sudo apt install certbot

# Generate certificate
sudo certbot certonly --standalone -d your-domain.com

# Copy certificates to project
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ./ssl/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ./ssl/
sudo chown $USER:$USER ./ssl/*
```

Update `nginx.conf` for HTTPS:

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # ... rest of nginx config ...
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

---

## Monitoring & Logging

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f app

# Last 100 lines
docker-compose logs --tail=100 app
```

### Resource Usage

```bash
# Container stats
docker stats vs-buddy-app vs-buddy-postgres

# Disk usage
docker system df
```

### Health Checks

```bash
# Check container health
docker ps

# Detailed health status
docker inspect --format='{{json .State.Health}}' vs-buddy-app | jq
```

---

## Backup & Restore

### Database Backup

```bash
# Create backup
docker-compose exec postgres pg_dump -U postgres vsbuddy > backup-$(date +%Y%m%d-%H%M%S).sql

# Or use Docker volume backup
docker run --rm -v vs-buddy_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres-backup-$(date +%Y%m%d).tar.gz -C /data .
```

### Restore Database

```bash
# From SQL dump
cat backup-20250104-120000.sql | docker-compose exec -T postgres psql -U postgres -d vsbuddy

# From volume backup
docker run --rm -v vs-buddy_postgres_data:/data -v $(pwd):/backup alpine sh -c "cd /data && tar xzf /backup/postgres-backup-20250104.tar.gz"
```

### Application Backup

```bash
# Backup environment and data
tar czf vs-buddy-backup-$(date +%Y%m%d).tar.gz .env docker-compose.yml nginx.conf ssl/

# Backup Docker volumes
docker run --rm -v vs-buddy_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/volumes-backup.tar.gz -C /data .
```

---

## Scaling & Performance

### Horizontal Scaling

Update `docker-compose.yml`:

```yaml
services:
  app:
    # ... existing config ...
    deploy:
      replicas: 3  # Run 3 instances

  nginx:
    # Add load balancing in nginx.conf
    # upstream backend {
    #   server app:3000;
    #   least_conn;
    # }
```

### Vertical Scaling

```yaml
services:
  app:
    # ... existing config ...
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 4G
        reservations:
          cpus: '1.0'
          memory: 2G
```

### Database Optimization

```bash
# Connect to database
docker-compose exec postgres psql -U postgres -d vsbuddy

# Analyze and vacuum
VACUUM ANALYZE;

# Check index usage
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
```

---

## Security Hardening

### 1. Use Docker Secrets

```yaml
services:
  app:
    secrets:
      - openai_api_key
      - auth_secret
    environment:
      OPENAI_API_KEY_FILE: /run/secrets/openai_api_key

secrets:
  openai_api_key:
    file: ./secrets/openai_api_key.txt
  auth_secret:
    file: ./secrets/auth_secret.txt
```

### 2. Network Isolation

```yaml
services:
  postgres:
    networks:
      - backend
    # Remove ports exposure for production

  app:
    networks:
      - frontend
      - backend

  nginx:
    networks:
      - frontend

networks:
  frontend:
  backend:
    internal: true  # No external access
```

### 3. Read-Only Root Filesystem

```yaml
services:
  app:
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp
      - /var/cache
```

---

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose logs app

# Check health status
docker inspect vs-buddy-app | grep -A 10 Health

# Rebuild image
docker-compose build --no-cache app
docker-compose up -d app
```

### Database Connection Issues

```bash
# Check database is ready
docker-compose exec postgres pg_isready

# Check connectivity from app
docker-compose exec app nc -zv postgres 5432

# Verify pgvector extension
docker-compose exec postgres psql -U postgres -d vsbuddy -c "SELECT * FROM pg_extension WHERE extname='vector';"
```

### Out of Disk Space

```bash
# Clean unused images
docker system prune -a

# Remove old logs
truncate -s 0 $(docker inspect --format='{{.LogPath}}' vs-buddy-app)
```

---

## Cost Estimation

### Self-Hosted on VPS

**Small VPS (2 vCPU, 4 GB RAM):**
- DigitalOcean/Vultr: $24/month
- OpenAI API: $50/month
- **Total: $74/month**

**Medium VPS (4 vCPU, 8 GB RAM):**
- DigitalOcean/Vultr: $48/month
- OpenAI API: $150/month
- **Total: $198/month**

### AWS/GCP Cloud

**Small (t3.medium EC2 + RDS):**
- EC2: $30/month
- RDS PostgreSQL: $50/month
- OpenAI API: $50/month
- **Total: $130/month**

---

## Next Steps

- [Set up monitoring](../ops/monitoring.md)
- [Configure automated backups](../ops/backups.md)
- [Review production readiness checklist](../PRODUCTION_READINESS.md)
- [Set up CI/CD pipeline](../ops/cicd.md)

---

## Support

For Docker issues:
- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Reference](https://docs.docker.com/compose/)

For VS Buddy issues:
- Check `/docs/PRODUCTION_READINESS.md`
- Review health endpoint: `/api/health?detailed=true`
