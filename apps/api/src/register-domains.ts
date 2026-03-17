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
import { plugin as investing } from '@interceptor/domain-investing';
import { plugin as minuteinbox } from '@interceptor/domain-minuteinbox';
import { plugin as robinhood } from '@interceptor/domain-robinhood';
import { plugin as stubhub } from '@interceptor/domain-stubhub';
import { registerRateLimit } from '@interceptor/shared';

// ─── Domain plugins ──────────────────────────────────────────────────

registerDomain(robinhood);
registerDomain(investing);
registerDomain(minuteinbox);
registerDomain(stubhub);

// ─── Outbound rate limits (per-hostname) ─────────────────────────────
// These protect against 429s from external APIs. Limits are conservative
// estimates for unauthenticated access. Domain plugins using
// rateLimitedFetch() automatically respect these.

registerRateLimit('api.semanticscholar.org', { maxPerMinute: 10, retryOn429: 2 });
registerRateLimit('eutils.ncbi.nlm.nih.gov', { maxPerMinute: 30 });
registerRateLimit('export.arxiv.org', { maxPerMinute: 20 });
registerRateLimit('efts.sec.gov', { maxPerMinute: 10, retryOn429: 1 });
registerRateLimit('feeds.finance.yahoo.com', { maxPerMinute: 30 });
