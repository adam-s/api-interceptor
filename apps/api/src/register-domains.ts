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
import { registerRateLimit } from '@interceptor/shared';
import { plugin as boardshop } from '@interceptor/domain-boardshop';

// ─── Domain plugins ──────────────────────────────────────────────────
// boardshop is the reference example on base. Real domain plugins are
// imported on test branches (e.g., test/tickets-v1, test/jobs-v1).

registerDomain(boardshop);

// ─── Outbound rate limits (per-hostname) ─────────────────────────────
// Register per-host limits here when domain plugins use rateLimitedFetch().

registerRateLimit('api.boardshop.example.com', { maxPerMinute: 30, retryOn429: 2 });
