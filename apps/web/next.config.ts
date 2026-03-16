import { resolve } from 'node:path';
import * as dotenv from 'dotenv';
import type { NextConfig } from 'next';

// Load root .env so monorepo-wide vars are available
dotenv.config({ path: resolve(import.meta.dirname, '../../.env') });

const nextConfig: NextConfig = {
	transpilePackages: ['@interceptor/shared'],

	// Proxy /api/* and /browser/* to the Hono API server
	// Dashboard components call relative URLs — no CORS issues
	async rewrites() {
		return [
			{
				source: '/api/:path*',
				destination: 'http://localhost:3001/api/:path*',
			},
			{
				source: '/browser/:path*',
				destination: 'http://localhost:3001/browser/:path*',
			},
		];
	},
};

export default nextConfig;
