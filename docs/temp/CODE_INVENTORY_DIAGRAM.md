# Code Inventory: Visual Architecture

This document provides visual maps of the current code structure and how data flows through the system.

---

## 1. Current Architecture: Robinhood-Only

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Claude Code (IDE)                           │
│  MCP Server + Visual-Dev Skill + API-Discovery Skill               │
└────────────────────────────┬────────────────────────────────────────┘
                             │ (calls MCP tools)
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│        /packages/browser/src/mcp/server.ts (277 lines)             │
│                     MCP Tool Definitions                             │
│                                                                      │
│  ✅ browser_status, browser_screenshot, browser_navigate           │
│  ✅ browser_click, browser_type, browser_scroll, browser_key       │
│  ✅ browser_evaluate                                               │
│  ✅ browser_traffic, browser_traffic_clear                         │
│                                                                      │
│  Status: GENERIC (no domain coupling)                              │
└────────────────────────────┬────────────────────────────────────────┘
                             │ (invokes)
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│    /packages/browser/src/remote/index.ts (Patchright wrapper)      │
│                    Browser Automation                               │
│                                                                      │
│  • launchPersistentContext() → persistent browser profile          │
│  • Navigate, click, type, screenshot                               │
│  • Listen to CDP events                                            │
│  • Route interception (cdp.on('Network.requestIntercepted', ...)) │
│                                                                      │
│  Status: GENERIC (low-level browser control)                       │
└────────────────────────────┬────────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
    ┌────────────┐   ┌──────────────┐   ┌──────────────────┐
    │   Page 1   │   │   Page 2     │   │ Route Intercept  │
    │ (Login)    │   │ (Dashboard)  │   │ Handler          │
    └────────────┘   └──────────────┘   └────────┬─────────┘
                                                  │
                                                  ▼
                    ┌─────────────────────────────────────┐
                    │  RobinhoodInterceptor (328 lines)   │
                    │                                     │
                    │  ❌ HARDCODED ROBINHOOD LOGIC       │
                    │                                     │
                    │  • INTERCEPT_PATTERNS (hardcoded)   │
                    │    - api.robinhood.com/**           │
                    │    - bonfire.robinhood.com/**       │
                    │                                     │
                    │  • REQUIRED_HEADER_NAMES (hardcoded)│
                    │    - Authorization                  │
                    │    - X-Hyper-Ex                     │
                    │    - X-Robinhood-API-Version        │
                    │    - X-TimeZone-Id                  │
                    │                                     │
                    │  • handleRoute() extracts headers    │
                    │  • getHeaders() validates against   │
                    │    RobinhoodHeadersSchema           │
                    │  • waitForHeaders(timeout)          │
                    │    → Promise<RobinhoodHeaders|null> │
                    └────────────┬────────────────────────┘
                                 │
                                 ▼
          ┌──────────────────────────────────────┐
          │   Captured Headers (Map<string, string>)
          │                                       │
          │   Authorization: "Bearer eyJ..."     │
          │   X-Hyper-Ex: "IOS_V2_17.18.0"      │
          │   X-Robinhood-API-Version: "2.3.5"  │
          │   X-TimeZone-Id: "America/New_York" │
          └──────────────────────┬───────────────┘
                                 │
                 ┌───────────────┼───────────────┐
                 │               │               │
                 ▼               ▼               ▼
    ┌─────────────────┐ ┌───────────────────┐ ┌──────────────────┐
    │ 1. HTTP Buffer  │ │ 2. SessionManager │ │ 3. API Calls     │
    │ (Ring Buffer)   │ │ (Verify + Persist)│ │ (Domain-Specific)│
    │                 │ │                   │ │                  │
    │ /apps/api/src/  │ │ RobinhoodSession  │ │ RobinhoodAPI     │
    │ browser.ts:     │ │ Manager (505 L)   │ │ Client (860 L)   │
    │                 │ │                   │ │                  │
    │ trafficBuffer[] │ │ ❌ HARDCODED:    │ │ ❌ HARDCODED:    │
    │ (max 200)       │ │   'robinhood-     │ │   api.robinhood  │
    │ (max 50KB/entry)│ │    trading' profile│ │   bonfire.robin  │
    │                 │ │   robinhood-      │ │   40+ endpoints  │
    │ Store:          │ │   session.json    │ │ verify(),        │
    │ request {       │ │                   │ │ getStockQuote(), │
    │   method        │ │ Features:         │ │ getOptions...()  │
    │   url           │ │ • setHeaders()    │ │                  │
    │   headers       │ │ • getHeaders()    │ │ buildHeaders()   │
    │   body          │ │ • markVerified()  │ │ maps to fetch    │
    │ }               │ │ • clearSession()  │ │                  │
    │                 │ │ • listSessions()  │ │ Endpoint schemas:│
    │ response {      │ │                   │ │ • ActiveInstrum  │
    │   status        │ │ EventEmitter:     │ │ • MarketQuote    │
    │   headers       │ │ 'connected'       │ │ • OptionsChain   │
    │   body          │ │ 'verified'        │ │ • StockPosition  │
    │   timestamp     │ │ 'error'           │ │ • StockOrder     │
    │ }               │ │ 'disconnected'    │ │ • ... 15 more    │
    │                 │ │                   │ │                  │
    │ ✅ GENERIC      │ │ ⚠️ SEMI-GENERIC  │ │ ❌ DOMAIN-ONLY  │
    │ (Ring buffer)   │ │ (profile-aware,  │ │ (Robinhood APIs) │
    │                 │ │  but hardcoded   │ │                  │
    │                 │ │  session filename)│ │                  │
    └────────────┬────┘ └────────┬──────────┘ └──────────┬───────┘
                 │               │                       │
                 │               └───────────┬───────────┘
                 │                           │
                 └───────────────┬───────────┘
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │  API Endpoint: /traffic  │
                    │  (apps/api/src/browser)  │
                    │                          │
                    │  GET /traffic → returns  │
                    │  all captured entries    │
                    │  (Claude Code reads this)│
                    │                          │
                    │  DELETE /traffic → clears│
                    │  buffer                  │
                    └──────────────┬───────────┘
                                   │
                                   ▼
                    ┌──────────────────────────┐
                    │     Claude Code reads    │
                    │  captured traffic and    │
                    │  generates API client    │
                    │                          │
                    │  /packages/browser/src/  │
                    │   robinhood/types.ts    │
                    │   (791 lines: schemas)   │
                    │                          │
                    │   robinhood/api-client.ts│
                    │   (860 lines: methods)   │
                    └──────────────────────────┘
```

---

## 2. Data Flow: From User Action to API Client

```
User clicks "Capture Robinhood API"
    │
    ▼
Claude Code uses browser tools:
    │
    ├─ browser_navigate("https://robinhood.com/login")
    ├─ [waits for user to login manually]
    ├─ browser_navigate("https://robinhood.com/account")
    ├─ [browser makes API calls]
    └─ browser_traffic() → capture buffer
    │
    ▼
RobinhoodInterceptor (via CDP route handler):
    │
    ├─ Intercepts: https://api.robinhood.com/accounts/
    ├─ Extracts headers: Authorization, X-Hyper-Ex, ...
    ├─ Stores in: this.capturedHeaders (Map)
    ├─ Validates: RobinhoodHeadersSchema.safeParse()
    ├─ Emits: onHeadersCaptured callback
    ├─ Intercepts: https://api.robinhood.com/marketdata/quotes/
    └─ Stores request/response in trafficBuffer
    │
    ▼
Server-side: /apps/api/src/browser.ts
    │
    ├─ Receives headers from interceptor
    ├─ Stores in: RobinhoodSessionManager
    │  (persists to: ~/.../robinhood-trading/robinhood-session.json)
    ├─ Verifies: RobinhoodApiClient.verify()
    │  (calls /accounts/ to prove headers work)
    ├─ Updates session: markVerified() with account details
    └─ Emits SSE event: { type: 'verified', accountNumber: '...' }
    │
    ▼
Claude Code (reading captured traffic):
    │
    ├─ Reads GET /accounts/ response
    │  └─ Infers schema: { results: [{ account_number, cash, ... }] }
    ├─ Reads POST /orders/ response
    │  └─ Infers schema: { id, state, price, quantity, ... }
    ├─ Reads GET /marketdata/quotes/ response
    │  └─ Infers schema: { results: [{ symbol, bid_price, ask_price, ... }] }
    │
    ├─ Generates types.ts (791 lines of Zod schemas)
    │  ├─ ActiveInstrumentSchema
    │  ├─ MarketQuoteSchema
    │  ├─ StockOrderSchema
    │  └─ ... 17 more
    │
    ├─ Generates api-client.ts (860 lines of methods)
    │  ├─ buildHeaders() → extract Authorization, X-Hyper-Ex, ...
    │  ├─ getAccounts() → GET /accounts/
    │  ├─ getStockQuote() → GET /marketdata/quotes/
    │  ├─ getStockPositions() → GET /positions/
    │  ├─ getOptionsChain() → GET /options/chains/
    │  ├─ placeStockBuyOrder() → POST /orders/
    │  └─ ... 35 more methods
    │
    └─ Outputs: /packages/browser/src/robinhood/
       ├─ types.ts (schemas)
       ├─ api-client.ts (methods)
       └─ index.ts (exports)

User can now:
    const client = new RobinhoodApiClient(headers);
    const quote = await client.getStockQuote('AAPL');
    const account = await client.getPrimaryAccount();
```

---

## 3. Coupling Matrix: Which Files Depend on What

```
                    ┌─────────────────────────────────────────────────────────────┐
                    │ What Each File Depends On (Current State)                   │
                    └─────────────────────────────────────────────────────────────┘

apps/api/src/browser.ts (728 L):
    ├─ 🔴 Hardcoded: 'robinhood-trading' profile name
    ├─ 🔴 Hardcoded: RobinhoodInterceptor class (line 357)
    ├─ 🔴 Hardcoded: RobinhoodApiClient class (line 391)
    ├─ 🔴 Hardcoded: RobinhoodSessionManager class (line 410)
    ├─ 🟡 Profile-specific verification logic (lines 377–394)
    └─ 🟢 Generic: trafficBuffer (works for any domain)

robinhood/interceptor.ts (328 L):
    ├─ 🔴 Hardcoded: INTERCEPT_PATTERNS (robinhood.com domains)
    ├─ 🔴 Hardcoded: REQUIRED_HEADER_NAMES (Robinhood-specific headers)
    ├─ 🔴 Hardcoded: RobinhoodHeadersSchema validation
    └─ 🟢 Generic: CDP route interception mechanism

robinhood/auth.ts (337 L):
    ├─ 🔴 Hardcoded: ROBINHOOD_URLS (login, account URLs)
    ├─ 🔴 Hardcoded: profileName = 'robinhood-trading'
    ├─ 🔴 Hardcoded: accountSelector = '[data-testid="account-number"]'
    ├─ 🔴 Hardcoded: RobinhoodInterceptor instantiation
    └─ 🟢 Generic: launchPersistentContext, page navigation

robinhood/api-client.ts (860 L):
    ├─ 🔴 Hardcoded: ROBINHOOD_API_BASE = 'https://api.robinhood.com'
    ├─ 🔴 Hardcoded: ROBINHOOD_BONFIRE_BASE = 'https://bonfire.robinhood.com'
    ├─ 🔴 Hardcoded: All 40+ endpoint URLs
    ├─ 🔴 Hardcoded: buildHeaders() maps to Robinhood-specific headers
    ├─ 🔴 Hardcoded: verify() calls /accounts/ endpoint
    └─ 🔴 Domain-specific: All response schemas (ActiveInstrument, etc.)

robinhood/types.ts (791 L):
    ├─ 🔴 Hardcoded: RobinhoodHeadersSchema (4 specific headers)
    ├─ 🔴 Hardcoded: REQUIRED_HEADER_NAMES (must match headers)
    ├─ 🔴 Domain-specific: 20+ Robinhood response schemas
    └─ 🔴 Domain-specific: 10+ Robinhood request payloads

robinhood/session-manager.ts (505 L):
    ├─ 🟡 Profile-aware: constructor(profileName)
    ├─ 🔴 Hardcoded: SESSION_FILE = 'robinhood-session.json'
    ├─ 🔴 Hardcoded: DEFAULT_MAX_AGE_MS (30 days, Robinhood-specific)
    ├─ 🔴 Hardcoded: TOKEN_REFRESH_THRESHOLD_MS (20 hrs, Robinhood token lifecycle)
    └─ 🟢 Generic: EventEmitter pattern, persistence logic

mcp/server.ts (277 L):
    ├─ 🟢 Generic: All tools are domain-agnostic
    ├─ 🟢 Generic: browser_status, browser_navigate, browser_traffic
    └─ 🟢 Generic: No hardcoded URLs or headers
```

---

## 4. Coupling Scorecard

```
┌────────────────────────────────┬────────────────┬──────────────────────┐
│ File                           │ Coupling Level │ Refactor Effort      │
├────────────────────────────────┼────────────────┼──────────────────────┤
│ mcp/server.ts                  │ 🟢 NONE        │ ✅ No changes needed │
│                                │ (generic)      │                      │
├────────────────────────────────┼────────────────┼──────────────────────┤
│ apps/api/src/browser.ts        │ 🔴 HIGH        │ ⚠️ Major refactor    │
│                                │ (profile,      │ • Extract into config│
│                                │  interceptor,  │ • Plugin system      │
│                                │  verification) │ • Domain registry    │
├────────────────────────────────┼────────────────┼──────────────────────┤
│ robinhood/interceptor.ts       │ 🔴 HIGH        │ ⚠️ Extract to base   │
│                                │ (patterns,     │ • GenericInterceptor│
│                                │  headers,      │ • Config-driven     │
│                                │  schema)       │                      │
├────────────────────────────────┼────────────────┼──────────────────────┤
│ robinhood/auth.ts              │ 🔴 HIGH        │ ⚠️ Extract to base   │
│                                │ (URLs,         │ • GenericAuthService│
│                                │  selectors,    │ • Config-driven     │
│                                │  profile name) │                      │
├────────────────────────────────┼────────────────┼──────────────────────┤
│ robinhood/api-client.ts        │ 🔴 EXTREME     │ ✅ Keep as-is        │
│                                │ (endpoints,    │ (domain-specific,   │
│                                │  URLs, logic)  │  not meant to be    │
│                                │                │  generic)           │
├────────────────────────────────┼────────────────┼──────────────────────┤
│ robinhood/types.ts             │ 🔴 EXTREME     │ ✅ Keep as-is        │
│                                │ (domain        │ (domain-specific,   │
│                                │  schemas)      │  auto-generated)    │
├────────────────────────────────┼────────────────┼──────────────────────┤
│ robinhood/session-manager.ts   │ 🟡 MEDIUM      │ ⚠️ Move to generic   │
│                                │ (session file  │ • Rename for reuse  │
│                                │  naming,       │ • Config session    │
│                                │  token timing) │   filename          │
├────────────────────────────────┼────────────────┼──────────────────────┤
│ robinhood/index.ts             │ 🟢 NONE        │ ✅ Keep as-is        │
│                                │ (just exports) │ (re-export pattern) │
└────────────────────────────────┴────────────────┴──────────────────────┘

🟢 = No coupling (0–20%)     → ✅ No refactor needed
🟡 = Medium coupling (20–50%) → ⚠️ Extract specific concerns
🔴 = High coupling (50%+)    → ⚠️ Create base class, extend
```

---

## 5. Refactoring Plan: Before & After

### Before: Robinhood-Only

```
apps/api/src/browser.ts
│
└─→ if (profile === 'robinhood-trading') {
    ├─ new RobinhoodInterceptor()
    ├─ new RobinhoodApiClient()
    ├─ RobinhoodSessionManager.getInstance()
    └─ [Robinhood-specific verification logic]

packages/browser/src/robinhood/
├─ types.ts (791 L) ← Robinhood-specific schemas
├─ api-client.ts (860 L) ← 40+ Robinhood endpoints
├─ interceptor.ts (328 L) ← Hardcoded patterns/headers
├─ auth.ts (337 L) ← Hardcoded URLs
├─ session-manager.ts (505 L) ← Robinhood token lifecycle
└─ index.ts (24 L) ← Re-export
```

**Result:** To add LinkedIn, copy entire /robinhood/ folder and change every hardcoded constant.

### After: Generic Base + Domain Plugins

```
apps/api/src/browser.ts
│
└─→ DOMAIN_CONFIGS['robinhood'].interceptor
    ├─ DOMAIN_CONFIGS['linkedin'].interceptor
    └─ DOMAIN_CONFIGS['generic'].interceptor
    │
    └─ all extend GenericInterceptor
       (uses config, not hardcoded logic)

packages/browser/src/shared/ ⭐ NEW
├─ config.ts ← InterceptorConfig interface
├─ interceptor.ts ← GenericInterceptor (abstract, config-driven)
├─ auth.ts ← GenericAuthService (abstract, config-driven)
├─ session-manager.ts ← GenericSessionManager (concrete, reusable)
└─ types.ts ← Common interfaces

packages/browser/src/robinhood/ (REFACTORED)
├─ config.ts ⭐ NEW ← Robinhood-specific config
├─ types.ts ← Robinhood-specific schemas (UNCHANGED)
├─ api-client.ts ← Robinhood endpoints (UNCHANGED)
├─ interceptor.ts ← extends GenericInterceptor (REFACTORED)
├─ auth.ts ← extends GenericAuthService (REFACTORED)
└─ index.ts ← Re-export (UNCHANGED API)

packages/browser/src/linkedin/ ⭐ NEW
├─ config.ts ← LinkedIn-specific config
├─ types.ts ← LinkedIn-specific schemas (auto-generated)
├─ api-client.ts ← LinkedIn endpoints (auto-generated)
├─ interceptor.ts ← extends GenericInterceptor
├─ auth.ts ← extends GenericAuthService
└─ index.ts ← Re-export

packages/browser/src/generic/ ⭐ NEW
├─ config.ts ← Minimal config (patterns from CLI)
├─ interceptor.ts ← extends GenericInterceptor (no assumptions)
├─ auth.ts ← extends GenericAuthService (no assumptions)
└─ index.ts ← Re-export
```

**Result:** To add new domain, create 6 files (config, types, api-client, interceptor, auth, index). ~200 LOC each. ~90% reusable.

---

## 6. Dependency Graph: Current vs Proposed

### Current: Tight Coupling

```
┌────────────────────────────────────────────────┐
│ browser.ts (monolithic)                         │
│                                                │
│ • Profile hardcoding                           │
│ • Interceptor selection                        │
│ • Verification logic                           │
│ • Session management                           │
└──────────────┬────────────────────────────────┘
               │
    ┌──────────┴──────────┬──────────────┬──────────────┐
    │                     │              │              │
    ▼                     ▼              ▼              ▼
┌────────────┐   ┌───────────────┐  ┌─────────┐  ┌──────────┐
│ RobinHood  │   │ RobinHood     │  │RobinHood│  │ RobinHood│
│Interceptor│   │ SessionMgr    │  │  Auth   │  │  Client  │
└────────────┘   └───────────────┘  └─────────┘  └──────────┘
    │                │                  │            │
    └────────────────┼──────────────────┴────────────┘
                     │
             (All HARDCODED to Robinhood)
```

### Proposed: Pluggable Architecture

```
┌────────────────────────────────────────────────────────────┐
│ browser.ts (refactored to be generic)                      │
│                                                            │
│ • DOMAIN_CONFIGS map (plugin registry)                    │
│ • GenericSessionManager (cross-domain)                    │
│ • Verification interface (pluggable)                      │
└──────────────┬─────────────────────────────────────────────┘
               │
    ┌──────────┴──────────────────────┬─────────────────────┐
    │                                  │                     │
    ▼                                  ▼                     ▼
┌─────────────────┐   ┌──────────────────────┐   ┌──────────────┐
│ GenericSession  │   │ DOMAIN_CONFIGS       │   │ Pluggable    │
│ Manager (reuse) │   │                      │   │ Verification │
└─────────────────┘   │ • robinhood.config   │   │ Interface    │
                      │ • linkedin.config    │   │              │
                      │ • generic.config     │   └──────────────┘
                      └──────────┬───────────┘
                                 │
               ┌─────────────────┼─────────────────┐
               │                 │                 │
               ▼                 ▼                 ▼
        ┌────────────────┐ ┌──────────────┐ ┌──────────────┐
        │ RobinHood      │ │  LinkedIn    │ │    Generic   │
        │ Domain Plugin  │ │ Domain Plugin│ │ Domain Plugin│
        │                │ │              │ │              │
        │ config         │ │ config       │ │ config       │
        │ interceptor    │ │ interceptor  │ │ interceptor  │
        │ auth           │ │ auth         │ │ auth         │
        │ api-client     │ │ api-client   │ │ api-client   │
        │ types          │ │ types        │ │ (stub)       │
        └────────────────┘ └──────────────┘ └──────────────┘
               │                 │                 │
               └─────────────────┼─────────────────┘
                                 │
        (All extend GenericInterceptor, GenericAuthService)
        (All implement InterceptorConfig)
        (All pluggable via DOMAIN_CONFIGS)
```

---

## 7. Code Statistics

### Current State

| Component | Lines | Coupling | Reusability |
|-----------|-------|----------|-------------|
| mcp/server.ts | 277 | 🟢 None | 100% (used for all domains) |
| apps/api/src/browser.ts | 728 | 🔴 High | 0% (Robinhood only) |
| robinhood/interceptor.ts | 328 | 🔴 High | 0% (Robinhood patterns hardcoded) |
| robinhood/auth.ts | 337 | 🔴 High | 0% (Robinhood URLs hardcoded) |
| robinhood/api-client.ts | 860 | 🔴 Extreme | 0% (40+ Robinhood endpoints) |
| robinhood/types.ts | 791 | 🔴 Extreme | 0% (Robinhood schemas only) |
| robinhood/session-manager.ts | 505 | 🟡 Medium | 20% (profile-aware, but hardcoded filename/timing) |
| robinhood/index.ts | 24 | 🟢 None | 100% (just exports) |
| **TOTAL** | **3,850** | **🔴 HIGH** | **~10% (mostly just mcp/server)** |

### After Refactoring (Target)

| Component | Lines | Coupling | Reusability |
|-----------|-------|----------|-------------|
| shared/config.ts | 60 | 🟢 None | 100% |
| shared/interceptor.ts | 300 | 🟢 None | 100% (extended by all) |
| shared/auth.ts | 200 | 🟢 None | 100% (extended by all) |
| shared/session-manager.ts | 450 | 🟢 None | 100% (used by all domains) |
| shared/types.ts | 100 | 🟢 None | 100% |
| **shared/** TOTAL | **1,110** | 🟢 🟢 🟢 | **100% (all domains use)** |
| robinhood/config.ts | 50 | 🟢 Domain-specific | ✅ Clear/maintainable |
| robinhood/interceptor.ts | 30 | 🟢 Thin wrapper | ✅ ~20 lines |
| robinhood/auth.ts | 30 | 🟢 Thin wrapper | ✅ ~20 lines |
| robinhood/api-client.ts | 860 | 🔴 Extreme | ✅ (understood, domain-specific) |
| robinhood/types.ts | 791 | 🔴 Extreme | ✅ (auto-generated) |
| robinhood/index.ts | 24 | 🟢 None | ✅ |
| **robinhood/** TOTAL | **1,785** | 🟢 🟢 | **Domain-specific, clean** |
| linkedin/config.ts | 50 | 🟢 Domain-specific | ✅ |
| linkedin/interceptor.ts | 30 | 🟢 Thin wrapper | ✅ |
| linkedin/auth.ts | 30 | 🟢 Thin wrapper | ✅ |
| linkedin/api-client.ts | 500+ | 🔴 Extreme | ✅ (generated) |
| linkedin/types.ts | 400+ | 🔴 Extreme | ✅ (generated) |
| linkedin/index.ts | 24 | 🟢 None | ✅ |
| **linkedin/** TOTAL | **1,034+** | 🟢 🟢 | **Domain-specific, generated** |
| **TOTAL WITH LINKEDIN** | **~3,929** | **🟢 MEDIUM** | **~75% (shared + generated)** |

**Key Insight:** By extracting 1,110 LOC into shared/ abstractions, we:
- Reduce coupling in browser.ts by 80%
- Enable rapid domain addition (~30 min to add LinkedIn)
- Keep domain-specific code isolated and maintainable
- Reuse session management, header validation, persistence across all domains

---

## Appendix: File Sizes Visualization

```
Current State (3,850 LOC)

robinhood/
├─ types.ts          ████████████████████ 791 L
├─ api-client.ts     █████████████████████ 860 L
├─ session-manager.ts ████████ 505 L
├─ auth.ts           █████ 337 L
├─ interceptor.ts    ████ 328 L
└─ index.ts          ░ 24 L

apps/api/
├─ browser.ts        █████████████████████ 728 L
└─ ...

mcp/
└─ server.ts         ████ 277 L

COUPLING HOTSPOT: browser.ts (728 L) depends on all Robinhood classes
─────────────────────────────────────────────────────────────────


After Refactoring (shared + robinhood + linkedin = ~3,929 LOC)

shared/ (NEW, 1,110 LOC - reused 2x for robinhood + linkedin)
├─ interceptor.ts    ██████ 300 L
├─ session-manager.ts ███████ 450 L
├─ auth.ts           ███ 200 L
├─ config.ts         ░ 60 L
└─ types.ts          ░ 100 L

robinhood/ (REFACTORED, 1,785 LOC)
├─ types.ts          ████████████████████ 791 L (kept)
├─ api-client.ts     █████████████████████ 860 L (kept)
├─ config.ts         ░ 50 L (new, thin)
├─ interceptor.ts    ░ 30 L (thin wrapper)
├─ auth.ts           ░ 30 L (thin wrapper)
└─ index.ts          ░ 24 L

linkedin/ (NEW, 1,034+ LOC - auto-generated)
├─ api-client.ts     ███████████ 500+ L (generated)
├─ types.ts          █████████ 400+ L (generated)
├─ config.ts         ░ 50 L (config)
├─ interceptor.ts    ░ 30 L (thin wrapper)
├─ auth.ts           ░ 30 L (thin wrapper)
└─ index.ts          ░ 24 L

NO MORE COUPLING in browser.ts
─────────────────────────────────────────────────────────────────

Benefit: Adding 3rd domain (Twitter, Slack, etc.)
→ 60% of code is shared (session mgr, base interceptor, base auth)
→ 40% is domain-specific config + generated types/client
→ Time to add: ~30 min (config + generate schemas + test)
```

---

**Document Version:** 1.0
**Status:** Ready for Review
**Created:** 2026-03-15
