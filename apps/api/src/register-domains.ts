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
import { plugin as boardshop } from '@interceptor/domain-boardshop';
import { plugin as stubhub } from '@interceptor/domain-stubhub';
import { plugin as ticketmaster } from '@interceptor/domain-ticketmaster';
import { registerRateLimit } from '@interceptor/shared';

// ─── Domain plugins ──────────────────────────────────────────────────
// boardshop is the reference example on base. Real domain plugins are
// imported on test branches (e.g., test/tickets-v1, test/jobs-v1).

registerDomain(boardshop);
registerDomain(stubhub);
registerDomain(ticketmaster);

// ─── Outbound rate limits (per-hostname) ─────────────────────────────
// Register per-host limits here when domain plugins use rateLimitedFetch().

registerRateLimit('api.boardshop.example.com', { maxPerMinute: 30, retryOn429: 2 });
registerRateLimit('www.ticketmaster.com', { maxPerMinute: 20, retryOn429: 2 });
registerRateLimit('www.stubhub.com', { maxPerMinute: 15, retryOn429: 2 });
