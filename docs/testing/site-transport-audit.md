# Site Transport Audit

Research-backed transport classification for every website referenced in `prompts/`. Use as a starting point when beginning each iteration — verify before relying, APIs change.

*Last researched: March 2026*

## Transport by Site

| Prompt | Site | Transport | Auth | Anti-bot | Key Endpoint |
|--------|------|-----------|------|----------|-------------|
| 01 | StubHub | SSR (`__NEXT_DATA__`) + REST JSON | Session cookies | Aggressive (AWS WAF, fingerprinting) | `/secure/rv` (search), SSR pages |
| 01 | Ticketmaster | REST JSON (Discovery API v2) | API key (free) | PerimeterX on web; API is open | `app.ticketmaster.com/discovery/v2/events.json` |
| 02 | Yahoo Finance | REST JSON + crumb/cookie | Crumb handshake | Moderate | `query1.finance.yahoo.com/v7/finance/quote` |
| 03 | Airbnb | GraphQL (persisted queries) | `x-airbnb-api-key` header | Extreme (Akamai) | `/api/v3/StaysSearch/{hash}` |
| 03 | VRBO | REST JSON | Session | Moderate | Internal XHR |
| 03 | Zillow | GraphQL (persisted queries) | Session | Extreme (PerimeterX) | `/graphql` |
| 04 | LinkedIn | REST-li / Voyager API | `li_at` + `JSESSIONID` cookies, CSRF | Aggressive (behavioral) | `/voyager/api/identity/dash/profiles` |
| 04 | Indeed | REST JSON | Session | Moderate+ | Internal search API |
| 04 | Glassdoor | REST JSON | Session | Aggressive (DataDome) | Internal API |
| 04 | Dice | REST JSON | None | Minimal | Internal API |
| 05 | PubMed | REST XML (E-utilities) | API key (optional) | Trivial | `eutils.ncbi.nlm.nih.gov/entrez/eutils/` |
| 05 | Semantic Scholar | REST JSON (public) | API key (optional) | Trivial | `api.semanticscholar.org/graph/v1/` |
| 05 | ArXiv | REST XML/Atom | None | Trivial | `export.arxiv.org/api/query` |
| 06 | SEC EDGAR | REST JSON + XBRL | User-Agent required | Trivial | `efts.sec.gov/LATEST/search-index` |
| 07 | Reddit | REST JSON (`.json` suffix) | OAuth2 (optional) | Trivial | Append `.json` to any URL |
| 08 | YouTube | JSON + protobuf (InnerTube) | `INNERTUBE_API_KEY` | Extreme | `/youtubei/v1/search` (handled by yt-dlp) |
| 09 | LinkedIn | (same as prompt 04) | | | |

## Transport Distribution

- **~90% REST JSON** — the baseline. Every site uses it in some form.
- **GraphQL (persisted queries)** — Airbnb, Zillow. Hash-based lookups with `PersistedQueryNotFound` error flow.
- **REST XML/Atom** — PubMed, ArXiv, SEC EDGAR (XBRL). Namespace-aware XML parsing required.
- **Protobuf** — YouTube only, bypassed by yt-dlp in prompt design.
- **Custom query language** — LinkedIn Voyager (Rest-li `decoration` parameter over JSON).

## Anti-bot Tiers

| Tier | Sites | Strategy |
|------|-------|----------|
| **Trivial** | PubMed, ArXiv, Semantic Scholar, SEC EDGAR, Reddit, Dice | Rate limiting only. Direct fetch works. |
| **Moderate** | Ticketmaster (API key), Yahoo Finance (crumb), VRBO, PACER | Auth handshake required. Browser optional. |
| **Aggressive** | StubHub, Indeed, Glassdoor, LinkedIn | Fingerprinting + behavioral analysis. Browser required, go slow. |
| **Extreme** | Airbnb, Zillow, YouTube | Akamai/PerimeterX/cipher challenges. Residential proxies may be needed. |

## GitHub References

| Site | Repo | Language | Notes |
|------|------|----------|-------|
| Yahoo Finance | `gadicc/yahoo-finance2` | Node | Crumb/cookie handling |
| Yahoo Finance | `ranaroussi/yfinance` | Python | Dominant Python library |
| YouTube | `LuanRT/YouTube.js` | JS | 5k+ stars, definitive InnerTube client |
| LinkedIn | `nsandman/linkedin-api` | Python | Voyager API with all headers/endpoints |
| Airbnb | `zxol/airbnbapi` | JS | GraphQL migration notes |
| Reddit | `Pyprohly/reddit-api-doc-notes` | Docs | Comprehensive unofficial API docs |
| Ticketmaster | `SerhiiVoznyi/Ticketmaster-SDK` | .NET | Discovery API wrapper |

## Test Server Coverage

The `packages/test-server/` emulates these transport patterns locally:

| Real-World Pattern | Test Server Endpoint | Transport Type |
|-------------------|---------------------|---------------|
| Ticketmaster Discovery API | `/api/json/*` | JSON API |
| Yahoo Finance crumb auth | `/api/crumb/*` | JSON + auth handshake |
| Airbnb/Zillow persisted queries | `/api/v3/:op/:hash` | GraphQL persisted |
| StubHub `__NEXT_DATA__` | `/ssr/*` | Pure SSR |
| Ticketmaster hybrid pages | `/hybrid/*` | SSR + deferred XHR |
| Real-time price feeds | `/ws/prices` | WebSocket |
| Event stream updates | `/sse/prices` | Server-Sent Events |
| Encoded API responses | `/api/encoded/proto/*` | Protobuf |
| Encoded API responses | `/api/encoded/msgpack/*` | MessagePack |
| Encoded API responses | `/api/encoded/b64/*` | Base64 JSON |
| gRPC microservices | `/grpc/testserver.*` | gRPC-Web |
| Standard GraphQL | `/graphql` | GraphQL |
