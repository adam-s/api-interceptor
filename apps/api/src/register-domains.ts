/**
 * Domain Registration & Rate Limits
 *
 * Imports and registers all domain plugins at application startup.
 * Also registers outbound rate limits for known external APIs.
 *
 * The browser handler uses getDomain() to look up plugins by name —
 * it has zero knowledge of which domains are registered.
 *
 * @module api/register-domains
 */

import { registerDomain } from '@interceptor/browser/handler/domain-loader';
import { plugin as minuteinbox } from '@interceptor/domain-minuteinbox';

// ─── Domain plugins ──────────────────────────────────────────────────
// Only framework utilities are registered on base.
// Domain-specific plugins are imported on test branches.

registerDomain(minuteinbox);

// ─── Outbound rate limits (per-hostname) ─────────────────────────────
// Register per-host limits here when domain plugins use rateLimitedFetch().
// Example:
// import { registerRateLimit } from '@interceptor/shared';
// registerRateLimit('api.example.com', { maxPerMinute: 10, retryOn429: 2 });
