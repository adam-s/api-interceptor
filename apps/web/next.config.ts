import { resolve } from 'node:path';
import * as dotenv from 'dotenv';
import type { NextConfig } from 'next';

// Load root .env so monorepo-wide vars (DATABASE_URL, AUTH_SECRET) are available
dotenv.config({ path: resolve(import.meta.dirname, '../../.env') });

const nextConfig: NextConfig = {
	transpilePackages: ['@interceptor/shared', '@interceptor/db'],
};

export default nextConfig;
