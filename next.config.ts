import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Exclude packages from bundling to avoid dynamic import issues with Turbopack
  serverExternalPackages: [
    'pdf-parse',
    'pino',
    'pino-pretty',
    'thread-stream',
  ],
};

export default nextConfig;
