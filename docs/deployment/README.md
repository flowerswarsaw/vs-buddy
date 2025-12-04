# VS Buddy - Deployment Guide Overview

## Quick Start

Choose your deployment platform based on your needs:

- **[Vercel](./VERCEL.md)** - Fastest deployment, serverless, free tier available
- **[Railway](./RAILWAY.md)** - Always-on containers, no cold starts, simple setup
- **[Docker](./DOCKER.md)** - Self-hosted, full control, cost-effective at scale

---

## Platform Comparison

| Feature | Vercel | Railway | Docker (Self-Hosted) |
|---------|--------|---------|----------------------|
| **Setup Time** | 5 minutes | 10 minutes | 30 minutes |
| **Cold Starts** | Yes (1-3s) | No | No |
| **Execution Timeout** | 10s (Edge: 30s) | Unlimited | Unlimited |
| **Auto-Scaling** | Yes | Limited | Manual |
| **Cost (Low Traffic)** | $0-20/mo | $5-20/mo | $24-50/mo (VPS) |
| **Cost (High Traffic)** | $100-300/mo | $50-150/mo | $50-100/mo (VPS) |
| **Database Included** | No (use Neon/Supabase) | Yes (PostgreSQL) | Yes (via Docker) |
| **Custom Domain** | Free SSL | Free SSL | Manual (Let's Encrypt) |
| **Maintenance** | None | Minimal | Moderate |
| **Infrastructure Control** | Low | Medium | Full |
| **Best For** | MVPs, internal tools | Production apps | High-traffic, compliance |

---

## Decision Tree

### Choose Vercel if you want:
- ✅ Fastest time to deployment (5 minutes)
- ✅ Zero infrastructure management
- ✅ Free tier for testing
- ✅ Automatic preview deployments
- ❌ Can handle cold starts (1-3 second delay on first request)
- ❌ Traffic < 10,000 requests/day

**[→ Vercel Deployment Guide](./VERCEL.md)**

---

### Choose Railway if you want:
- ✅ Always-on containers (no cold starts)
- ✅ Consistent performance
- ✅ Integrated PostgreSQL with pgvector
- ✅ Easy scaling
- ✅ Simple pricing ($5-20/month typical)
- ❌ Traffic < 100,000 requests/day

**[→ Railway Deployment Guide](./RAILWAY.md)**

---

### Choose Docker (Self-Hosted) if you:
- ✅ Need full infrastructure control
- ✅ Have compliance requirements (HIPAA, GDPR, data residency)
- ✅ Want to minimize costs at scale
- ✅ Require air-gapped/offline deployments
- ✅ Have DevOps expertise
- ✅ Traffic > 100,000 requests/day

**[→ Docker Deployment Guide](./DOCKER.md)**

---

## Cost Comparison

### Monthly Cost by Traffic Level

#### Low Traffic (< 1,000 requests/day)

| Platform | Infrastructure | Database | OpenAI | **Total** |
|----------|----------------|----------|--------|-----------|
| **Vercel** | $0 (free tier) | $0 (Neon free) | $10-30 | **$10-30** |
| **Railway** | $5 | $8 | $10-30 | **$23-43** |
| **Docker (VPS)** | $24 (DigitalOcean) | Included | $10-30 | **$34-54** |

**Winner:** Vercel (free tier)

---

#### Medium Traffic (< 10,000 requests/day)

| Platform | Infrastructure | Database | OpenAI | **Total** |
|----------|----------------|----------|--------|-----------|
| **Vercel** | $20 (Pro) | $19 (Neon Pro) | $50-150 | **$89-189** |
| **Railway** | $10-20 | $8-15 | $50-150 | **$68-185** |
| **Docker (VPS)** | $48 (4GB RAM) | Included | $50-150 | **$98-198** |

**Winner:** Railway (balanced cost/performance)

---

#### High Traffic (< 100,000 requests/day)

| Platform | Infrastructure | Database | OpenAI | **Total** |
|----------|----------------|----------|--------|-----------|
| **Vercel** | $100-200 | $50-100 | $200-500 | **$350-800** |
| **Railway** | $50-100 | $20-40 | $200-500 | **$270-640** |
| **Docker (VPS)** | $96 (8GB RAM) | Included | $200-500 | **$296-596** |

**Winner:** Docker (self-hosted) - most cost-effective at scale

---

## Performance Comparison

### Response Times

| Platform | Cold Start | Warm Request | Database Query | Full Chat Request |
|----------|------------|--------------|----------------|-------------------|
| **Vercel** | 1-3s | 200-500ms | 20-100ms | 2-7s |
| **Railway** | N/A (always warm) | 100-300ms | 10-50ms | 1.5-6s |
| **Docker (VPS)** | N/A (always warm) | 80-250ms | 10-40ms | 1.5-6s |

**Notes:**
- Cold starts only affect Vercel on first request or after inactivity
- Database query times depend on database location and network latency
- Full chat request time dominated by OpenAI API latency (1-5s)

---

## Feature Support Matrix

| Feature | Vercel | Railway | Docker |
|---------|--------|---------|--------|
| **Serverless** | ✅ Yes | ❌ No | ❌ No |
| **Always-On** | ❌ No | ✅ Yes | ✅ Yes |
| **WebSocket/SSE** | ⚠️ Limited | ✅ Full Support | ✅ Full Support |
| **Long-Running Tasks** | ❌ No (10s limit) | ✅ Unlimited | ✅ Unlimited |
| **Background Jobs** | ⚠️ Via Vercel Cron | ✅ Yes | ✅ Yes |
| **Custom Networking** | ❌ Limited | ⚠️ Limited | ✅ Full Control |
| **Air-Gapped Deploy** | ❌ No | ❌ No | ✅ Yes |

---

## Database Options

### Vercel
- **Neon** (recommended) - Serverless PostgreSQL with pgvector
- **Supabase** - Alternative with more features
- **Planetscale** - MySQL (not compatible with pgvector)

### Railway
- **Built-in PostgreSQL** - Integrated, easy setup, includes pgvector
- Or connect to external database

### Docker
- **Self-hosted PostgreSQL** - Full control, included in Docker Compose
- **AWS RDS** - Managed PostgreSQL for production
- **GCP CloudSQL** - Alternative managed option

---

## Migration Between Platforms

### Vercel → Railway

1. Export database: `pg_dump $VERCEL_DB_URL > backup.sql`
2. Deploy to Railway (follow [Railway guide](./RAILWAY.md))
3. Import database: `psql $RAILWAY_DB_URL < backup.sql`
4. Update DNS to Railway domain
5. Monitor for 24-48 hours
6. Shut down Vercel deployment

### Railway → Docker

1. Export database from Railway
2. Set up Docker environment (follow [Docker guide](./DOCKER.md))
3. Import database to Docker PostgreSQL
4. Update DNS to your server IP
5. Monitor stability
6. Shut down Railway deployment

### Vercel → Docker

Same process as Vercel → Railway → Docker

---

## Post-Deployment Checklist

After deploying to any platform:

- [ ] Verify health check returns 200 OK
- [ ] Test database connectivity
- [ ] Test OpenAI API integration
- [ ] Change default admin password
- [ ] Configure custom domain (optional)
- [ ] Set up Sentry error tracking
- [ ] Configure automated backups
- [ ] Set up monitoring/alerts
- [ ] Review security headers
- [ ] Test full user workflow
- [ ] Document rollback procedure

---

## Deployment Guides

### Quick Links

- **[Vercel Deployment](./VERCEL.md)** - Serverless, fastest setup
- **[Railway Deployment](./RAILWAY.md)** - Containers, no cold starts
- **[Docker Deployment](./DOCKER.md)** - Self-hosted, full control

### Additional Resources

- [Production Readiness Checklist](../PRODUCTION_READINESS.md)
- [Sentry Error Tracking Setup](../SENTRY_SETUP.md)
- [Environment Variables Reference](../../.env.example)
- [Health Check API](../../app/api/health/route.ts)

---

## Support & Troubleshooting

### Platform-Specific Issues

- **Vercel:** Check [Vercel Status](https://vercel-status.com/)
- **Railway:** Join [Railway Discord](https://discord.gg/railway)
- **Docker:** Review [Docker Logs](./DOCKER.md#monitoring--logging)

### VS Buddy Issues

1. Check health endpoint: `/api/health?detailed=true`
2. Review logs for errors
3. Verify environment variables
4. Test OpenAI API key separately
5. Check database connectivity

### Common Issues

| Issue | Solution |
|-------|----------|
| Database connection fails | Verify `DATABASE_URL`, check pgvector extension |
| OpenAI API errors | Check API key, verify quota, check circuit breaker status |
| Build fails | Check Node.js version (20+), verify pnpm lockfile |
| Cold start too slow | Switch from Vercel to Railway or Docker |
| Out of memory | Increase RAM allocation, optimize queries |

---

## Next Steps

1. **Choose your platform** based on the decision tree above
2. **Follow the deployment guide** for your chosen platform
3. **Complete post-deployment checklist**
4. **Set up monitoring** and error tracking
5. **Test thoroughly** before announcing to users
6. **Document** your deployment process for your team

---

## Need Help?

- Review [Production Readiness Documentation](../PRODUCTION_READINESS.md)
- Check health endpoint for diagnostics: `/api/health?detailed=true`
- Review Sentry dashboard for errors (if configured)
- Check platform-specific logs and metrics

**Happy Deploying!** 🚀
