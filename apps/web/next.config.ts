import { resolve } from 'node:path';
import * as dotenv from 'dotenv';
import type { NextConfig } from 'next';

// Load root .env so monorepo-wide vars are available
dotenv.config({ path: resolve(import.meta.dirname, '../../.env') });

const nextConfig: NextConfig = {
	transpilePackages: ['@interceptor/shared'],

	// Proxy /api/* and /browser/* to the Hono API server
	// Port is configurable via API_PORT env var (default: 3001)
	// Dashboard components call relative URLs — no CORS issues
	async rewrites() {
		const apiPort = process.env.API_PORT ?? '3001';
		console.log(`[next.config] Proxying /api/* → http://localhost:${apiPort}`);
		return [
			{
				source: '/api/:path*',
				destination: `http://localhost:${apiPort}/api/:path*`,
			},
			{
				source: '/browser/:path*',
				destination: `http://localhost:${apiPort}/browser/:path*`,
			},
		];
	},
};

export default nextConfig;
