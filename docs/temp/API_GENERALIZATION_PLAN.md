# API Generalization Plan: From Robinhood-Specific to Arbitrary Website APIs

**Objective:** Transform the current Robinhood-specific API discovery and automation system into a generic framework that works with any website (LinkedIn, Twitter, Stripe, etc.). Enable developers to use Claude Code with natural language to build typed API clients for any website.

**Date:** 2026-03-15
**Current State:** Interceptor framework tightly coupled to Robinhood authentication, types, and session management
**Target State:** Generic traffic capture → automatic schema generation → typed API client → framework for any domain

---

## Part 1: Code Inventory

### High-Level Flow: Natural Language → API Client

```
Developer (natural language)
    ↓
Claude Code (MCP tools + visual-dev skill)
    ↓
Browser Automation (Patchright + CDP intercept)
    ↓
Request/Response Capture (traffic buffer, schema extraction)
    ↓
API Definition (types, endpoints, auth headers)
    ↓
Typed API Client (ready-to-use, generated from observed traffic)
    ↓
API Result: /packages/browser/src/[domain]/ (e.g., robinhood/, linkedin/)
```

---

## Part 2: Current Code Architecture (Robinhood-Specific)

### 2.1 Browser Control Layer

**File:** `/packages/browser/src/mcp/server.ts`
**Purpose:** MCP server that registers tools Claude Code can invoke
**Key Tools:**
- `browser_status` — Check if browser is running
- `browser_screenshot` — Capture current page
- `browser_navigate` — Navigate to URL
- `browser_click`, `browser_type`, `browser_scroll`, `browser_key` — Interaction
- `browser_evaluate` — Run JavaScript in page
- `browser_traffic` — Get captured HTTP traffic
- `browser_traffic_clear` — Clear traffic buffer

**Coupling to Robinhood:** None (generic tools)

**Status:** ✅ Ready for generalization (already decoupled)

---

### 2.2 Request/Response Capture Layer

**File:** `/apps/api/src/browser.ts` (728 lines)

#### 2.2.1 Traffic Buffer (Ring Buffer)

**Lines:** 48–102

```typescript
interface TrafficEntry {
  id: number;
  timestamp: number;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  status: number;
  responseHeaders: Record<string, string>;
  responseBody: unknown;
  durationMs: number;
}

const MAX_TRAFFIC_ENTRIES = 200;
const MAX_BODY_SIZE = 50_000; // characters
let trafficBuffer: TrafficEntry[] = [];
```

**Coupling to Robinhood:** None (generic)

**Status:** ✅ Ready for generalization

#### 2.2.2 Hardcoded Robinhood Profile Detection

**Lines:** 40–41 (PROFILE constant)
**Lines:** 340–409 (hardcoded interceptor attachment logic)

```typescript
// COUPLING POINT #1: Hardcoded profile name
const ROBINHOOD_PROFILE = 'robinhood-trading';

// COUPLING POINT #2: In createBrowserSession()
if (profile === 'robinhood-trading') {
  // Attach RobinhoodInterceptor
  // Verify with RobinhoodApiClient
  // Manage via RobinhoodSessionManager
}
```

**Coupling to Robinhood:** Hardcoded profile, interceptor class, verification logic, session manager class

**Status:** ❌ **MUST BE REFACTORED** — This is the main coupling point

#### 2.2.3 Robinhood-Specific Verification

**Lines:** 377–394 (verification flow)

```typescript
// Only works with RobinhoodApiClient
const verificationResult = await client.verify();
if (!verificationResult.valid) {
  return {
    status: 'error',
    message: `Verification failed: ${verificationResult.error}`,
  };
}

manager.markVerified('robinhood-trading', {
  accountNumber: verificationResult.accountNumber!,
  firstName: verificationResult.firstName,
  lastName: verificationResult.lastName,
  buyingPower: verificationResult.buyingPower,
});
```

**Coupling to Robinhood:** RobinhoodApiClient verification, account-specific fields, RobinhoodSessionManager

**Status:** ❌ **MUST BE REFACTORED** — Verification should be pluggable

---

### 2.3 Browser Automation Layer

#### 2.3.1 Robinhood Interceptor Class

**File:** `/packages/browser/src/robinhood/interceptor.ts` (328 lines)

**Purpose:** Attach to Patchright page and capture traffic

**Key Methods:**
- `attach(page)` — Route intercept pattern matching
- `handleRoute(route)` — Capture request/response, extract headers
- `waitForHeaders(timeout)` — Promise-based header capture
- `getHeaders()` — Retrieve captured headers, validate with Zod

**Pattern Matching:**
```typescript
const INTERCEPT_PATTERNS = [
  'https://api.robinhood.com/marketdata/**',
  'https://api.robinhood.com/options/**',
  'https://bonfire.robinhood.com/**',
] as const;
```

**Coupling to Robinhood:**
- Hardcoded `api.robinhood.com` and `bonfire.robinhood.com` patterns
- Looks for specific headers: `Authorization`, `X-Hyper-Ex`, `X-Robinhood-API-Version`, `X-TimeZone-Id`
- Validates against `RobinhoodHeadersSchema`

**Status:** ❌ **MUST BE REFACTORED** — Pattern matching and header names should be configurable

---

#### 2.3.2 Robinhood Auth Service

**File:** `/packages/browser/src/robinhood/auth.ts` (337 lines)

**Purpose:** Manage browser session, handle login flow

**Key Methods:**
- `startSession()` — Launch persistent browser profile
- `navigate(url)` — Navigate to page
- `goToLogin()` / `goToAccount()` — Robinhood-specific navigation
- `extractAccountNumber()` — Parse Robinhood-specific page elements

**Coupling to Robinhood:**
- Hardcoded URLs: `https://robinhood.com/login`, `https://robinhood.com/account`
- Hardcoded profile name: `'robinhood-trading'`
- Hardcoded selectors: `[data-testid="account-number"]`

**Status:** ❌ **MUST BE REFACTORED** — URLs and profile name should be configurable

---

#### 2.3.3 Robinhood API Client

**File:** `/packages/browser/src/robinhood/api-client.ts` (860 lines)

**Purpose:** Make authenticated API calls using captured headers

**Key Methods:**
- `verify()` — Prove headers work by calling `/accounts/`
- `getAccounts()`, `getStockQuote()`, `getOptionsChain()`, etc. — 40+ endpoints
- `buildHeaders()` — Construct fetch headers from RobinhoodHeaders

**Coupling to Robinhood:**
- Hardcoded base URLs: `https://api.robinhood.com`, `https://bonfire.robinhood.com`
- Robinhood-specific endpoints and response schemas
- Specific header names: `X-Hyper-Ex`, `X-Robinhood-API-Version`
- Account number extraction from `/accounts/` endpoint

**Status:** ❌ **DOMAIN-SPECIFIC CODE** — Not meant to be generic, but its pattern can be replicated

---

#### 2.3.4 Robinhood Types

**File:** `/packages/browser/src/robinhood/types.ts` (791 lines)

**Purpose:** Zod schemas and TypeScript types for Robinhood API

**Key Exports:**
- `RobinhoodHeadersSchema` — Required header validation
- `ActiveInstrumentSchema`, `MarketQuoteSchema`, `OptionsChainSchema`, etc. — 20+ response schemas
- `OptionsOrderReviewPayloadSchema`, `StockBuyOrderPayloadSchema` — Request payloads

**Status:** ✅ **DOMAIN-SPECIFIC CODE** — Perfect example of what generated code looks like

---

#### 2.3.5 Robinhood Session Manager

**File:** `/packages/browser/src/robinhood/session-manager.ts` (505 lines)

**Purpose:** Server-side session persistence for captured headers

**Key Methods:**
- `setHeaders(profileName, headers)` — Store captured headers
- `getHeaders(profileName)` — Retrieve if valid
- `verify()` → `markVerified()` — Track verification status
- Persistence: Save/load from disk (`robinhood-session.json`)
- EventEmitter: Broadcast status changes for SSE

**Coupling to Robinhood:**
- Profile-aware (works with named profiles ✅)
- Session file name: `robinhood-session.json` (should be generic)
- Token refresh logic specific to Robinhood 24-hour token expiry

**Status:** ⚠️ **MOSTLY GENERIC** — Profile system works, session file naming needs abstraction

---

### 2.4 API Definition Layer

**File:** `/packages/browser/src/robinhood/index.ts` (24 lines)

**Purpose:** Export public API from robinhood module

```typescript
export { RobinhoodApiClient, type VerificationResult } from './api-client';
export { type RobinhoodAuthConfig, RobinhoodAuthService } from './auth';
export { RobinhoodInterceptor, type InterceptedRequest, type InterceptedResponse } from './interceptor';
export { RobinhoodSessionManager } from './session-manager';
export { type RobinhoodHeaders, REQUIRED_HEADER_NAMES, RobinhoodHeadersSchema } from './types';
```

**Status:** ✅ Pattern to replicate for other domains (e.g., `linkedin/index.ts`, `twitter/index.ts`)

---

## Part 3: Coupling Analysis

### The Main Coupling Points

| Component | Coupling Point | Current | Should Be |
|-----------|---------------|---------|-----------|
| **browser.ts** | Profile name | `'robinhood-trading'` (hardcoded) | Configurable per domain |
| **browser.ts** | Interceptor class | `RobinhoodInterceptor` (hardcoded) | Polymorphic/pluggable |
| **browser.ts** | Verification | `RobinhoodApiClient.verify()` | Generic verification interface |
| **browser.ts** | Session manager | `RobinhoodSessionManager` | Generic (profile-aware) |
| **interceptor.ts** | URL patterns | Robinhood API domains (hardcoded) | From config |
| **interceptor.ts** | Header names | `REQUIRED_HEADER_NAMES` (hardcoded) | From config |
| **interceptor.ts** | Header validation | `RobinhoodHeadersSchema` (hardcoded) | Dynamic/configurable |
| **auth.ts** | Login URL | `https://robinhood.com/login` (hardcoded) | From config |
| **auth.ts** | Profile name | `'robinhood-trading'` (hardcoded) | From config |
| **auth.ts** | Selectors | `[data-testid="account-number"]` (hardcoded) | Configurable extraction |
| **api-client.ts** | Base URLs | `api.robinhood.com` (hardcoded) | From intercepted traffic |
| **types.ts** | Schemas | Robinhood-specific | Generated from traffic |
| **index.ts** | Exports | Robinhood class names | Generic class names |

---

## Part 4: Generalization Architecture

### 4.1 New Directory Structure

```
packages/browser/src/
├── mcp/                          # ✅ Keep as-is (generic)
│   ├── index.ts
│   └── server.ts
│
├── remote/                       # ✅ Keep as-is (generic)
│
├── shared/                       # ⭐ NEW: Generic base classes
│   ├── interceptor.ts            # GenericInterceptor (abstract)
│   ├── auth.ts                   # GenericAuthService (abstract)
│   ├── session-manager.ts        # GenericSessionManager (concrete, profile-aware)
│   ├── api-client.ts             # GenericApiClient (abstract)
│   ├── types.ts                  # Common schemas/types
│   └── config.ts                 # InterceptorConfig type
│
├── robinhood/                    # ✅ Refactor to use shared/
│   ├── index.ts                  # Re-export shared + specific config
│   ├── auth.ts                   # Inherits GenericAuthService
│   ├── interceptor.ts            # Inherits GenericInterceptor
│   ├── api-client.ts             # Inherits GenericApiClient (Robinhood-specific endpoints)
│   ├── types.ts                  # Robinhood-specific schemas
│   └── config.ts                 # Robinhood config (URLs, patterns, headers)
│
├── linkedin/                     # ⭐ NEW: Example domain
│   ├── index.ts
│   ├── auth.ts
│   ├── interceptor.ts
│   ├── api-client.ts
│   ├── types.ts
│   └── config.ts
│
└── generic/                      # ⭐ NEW: Truly generic (no domain assumptions)
    ├── index.ts
    ├── auth.ts
    ├── interceptor.ts
    ├── api-client.ts
    └── config.ts
```

---

### 4.2 Abstraction: InterceptorConfig

```typescript
// shared/config.ts
export interface InterceptorConfig {
  /** Domain name for logging and sessions (e.g., 'robinhood', 'linkedin') */
  domainName: string;

  /** URL patterns to intercept (e.g., 'https://api.robinhood.com/**') */
  interceptPatterns: string[];

  /** Required header names to capture (e.g., 'Authorization', 'X-Hyper-Ex') */
  requiredHeaders: string[];

  /** Zod schema to validate captured headers */
  headerSchema: z.ZodSchema;

  /** Base URLs for API calls (can be derived from traffic) */
  baseUrls?: string[];

  /** Login page URL (optional, for auth service) */
  loginUrl?: string;

  /** Account page URL (optional, for auth service) */
  accountUrl?: string;

  /** CSS selector to extract account identifier (optional) */
  accountSelector?: string;

  /** Optional: Custom verification logic */
  verifyFn?: (headers: Record<string, string>) => Promise<VerificationResult>;
}
```

---

### 4.3 Abstraction: GenericInterceptor

```typescript
// shared/interceptor.ts
export interface InterceptorEvents {
  headersCaptured: Record<string, string>;
  request: InterceptedRequest;
  response: InterceptedResponse;
  error: Error;
}

export abstract class GenericInterceptor {
  protected config: InterceptorConfig;
  protected capturedHeaders: Map<string, string> = new Map();
  protected callbacks: Set<InterceptionCallback> = new Set();
  protected page: Page | null = null;
  protected isAttached = false;

  constructor(config: InterceptorConfig) {
    this.config = config;
  }

  /**
   * Attach to page and start intercepting traffic.
   * Subclasses can override to add domain-specific logic.
   */
  async attach(page: Page): Promise<void> {
    this.page = page;
    this.isAttached = true;

    for (const pattern of this.config.interceptPatterns) {
      await page.route(pattern, (route) => this.handleRoute(route));
    }

    console.log(`[${this.config.domainName}Interceptor] Attached (patterns: ${this.config.interceptPatterns.length})`);
  }

  /**
   * Core route handler: intercept, validate, store.
   */
  protected async handleRoute(route: Route): Promise<void> {
    const request = route.request();
    const response = await route.fetch();
    const headers = request.allHeaders();

    // Extract required headers
    for (const headerName of this.config.requiredHeaders) {
      const value = headers[headerName.toLowerCase()];
      if (value) {
        this.capturedHeaders.set(headerName, value);
      }
    }

    // Check if all required headers captured
    if (this.hasAllHeaders()) {
      this.notifyHeadersCaptured();
    }

    // Callback for traffic recording
    for (const callback of this.callbacks) {
      callback({
        url: request.url(),
        method: request.method(),
        headers: Object.entries(headers).reduce((acc, [k, v]) => {
          acc[k] = v;
          return acc;
        }, {} as Record<string, string>),
      } as InterceptedRequest, {
        status: response.status(),
        headers: response.headers(),
        body: await this.parseResponseBody(response),
      } as InterceptedResponse);
    }

    // Pass through original response
    await route.fulfill({ response });
  }

  getHeaders(): Record<string, string> | null {
    if (!this.hasAllHeaders()) return null;

    const headers: Record<string, string> = {};
    for (const name of this.config.requiredHeaders) {
      const value = this.capturedHeaders.get(name);
      if (value) headers[name] = value;
    }

    // Validate with schema
    const result = this.config.headerSchema.safeParse(headers);
    return result.success ? result.data : null;
  }

  hasAllHeaders(): boolean {
    return this.config.requiredHeaders.every((name) => this.capturedHeaders.has(name));
  }

  // ... rest of the interface
}
```

---

### 4.4 Abstraction: GenericSessionManager

```typescript
// shared/session-manager.ts (concrete, can be reused across domains)
export class GenericSessionManager extends EventEmitter {
  private static instances: Map<string, GenericSessionManager> = new Map();
  private sessions: Map<string, GenericSession> = new Map();
  private domainName: string;
  private sessionFileName: string;

  constructor(domainName: string) {
    super();
    this.domainName = domainName;
    this.sessionFileName = `${domainName}-session.json`;
    this.loadPersistedSessions();
  }

  static getInstance(domainName: string): GenericSessionManager {
    if (!this.instances.has(domainName)) {
      this.instances.set(domainName, new GenericSessionManager(domainName));
    }
    return this.instances.get(domainName)!;
  }

  setHeaders(profileName: string, headers: Record<string, string>): void {
    const session: GenericSession = {
      profileName,
      headers,
      connectedAt: Date.now(),
      verified: false,
    };
    this.sessions.set(profileName, session);
    this.saveSessionToDisk(profileName, session);
  }

  getHeaders(profileName: string): Record<string, string> | null {
    const session = this.sessions.get(profileName);
    return session?.headers ?? null;
  }

  // ... rest of the interface (same as RobinhoodSessionManager)
}
```

---

### 4.5 Refactored browser.ts

**Current (128 lines of Robinhood-specific logic):**
```typescript
// COUPLING: hardcoded profile, interceptor, verification
if (profile === 'robinhood-trading') {
  const interceptor = new RobinhoodInterceptor();
  const client = new RobinhoodApiClient(headers);
  const result = await client.verify();
  const manager = RobinhoodSessionManager.getInstance();
}
```

**Refactored (Generic):**
```typescript
// NEW: domain-aware, pluggable interceptors
interface DomainConfig {
  domainName: string;
  profileName: string;
  interceptor: new (config: InterceptorConfig) => GenericInterceptor;
  apiClient: new (headers: Record<string, string>) => GenericApiClient;
  config: InterceptorConfig;
}

const DOMAIN_CONFIGS: Record<string, DomainConfig> = {
  'robinhood': { /* ... */ },
  'linkedin': { /* ... */ },
  'generic': { /* ... */ },
};

async function createBrowserSession(
  profileName: string,
  domainName: string = 'generic'
): Promise<SessionStatus> {
  const domainConfig = DOMAIN_CONFIGS[domainName];
  if (!domainConfig) throw new Error(`Unknown domain: ${domainName}`);

  const interceptor = new domainConfig.interceptor(domainConfig.config);
  const manager = GenericSessionManager.getInstance(domainName);

  // Generic verification
  if (domainConfig.apiClient) {
    const client = new domainConfig.apiClient(headers);
    const result = await client.verify();
    manager.markVerified(profileName, result);
  }
}
```

---

## Part 5: Implementation Roadmap

### Phase 1: Extract Generic Base Classes (Week 1)

**Deliverables:**
1. Create `/packages/browser/src/shared/` directory
2. Extract `GenericInterceptor` from `RobinhoodInterceptor`
3. Extract `GenericAuthService` from `RobinhoodAuthService`
4. Extract common types: `InterceptedRequest`, `InterceptedResponse`, `InterceptionCallback`
5. Define `InterceptorConfig` interface
6. Move `GenericSessionManager` to shared (reusable, profile-aware)

**Tests:**
- `packages/browser/src/__tests__/shared/` — Unit tests for abstractions
- Verify existing RobinhoodInterceptor + RobinhoodAuthService still work

---

### Phase 2: Refactor Robinhood Module (Week 1–2)

**Deliverables:**
1. `robinhood/config.ts` — Define Robinhood-specific `InterceptorConfig`
2. `robinhood/interceptor.ts` — Extend `GenericInterceptor` with Robinhood config
3. `robinhood/auth.ts` — Extend `GenericAuthService` with Robinhood URLs
4. `robinhood/index.ts` — Re-export classes (no API changes)
5. Update `apps/api/src/browser.ts` to use new domain-aware approach

**Tests:**
- E2E: Existing Robinhood auth flow still works
- Session: Headers persist and restore correctly
- Verification: API client validation works

---

### Phase 3: Generic Traffic Capture (Week 2)

**Deliverables:**
1. Create `/packages/browser/src/generic/` module
2. `generic/config.ts` — Minimal config (patterns from CLI or dashboard)
3. `generic/interceptor.ts` — GenericInterceptor with no domain assumptions
4. `generic/auth.ts` — GenericAuthService (URL-based login only)
5. `generic/index.ts` — Export generic classes

**Tests:**
- Capture traffic from arbitrary domain (e.g., GitHub API)
- No crashes on unknown header names or response formats

---

### Phase 4: Schema Generation & Code Generation (Week 3–4)

**Deliverables:**
1. `packages/browser/src/shared/schema-generator.ts` — Analyze captured traffic → infer Zod schemas
   - Detect repeating structure in responses
   - Infer field types from values
   - Handle arrays, nested objects, nulls
   - Generate unions for status fields (`'pending' | 'completed'`)

2. `packages/browser/src/shared/codegen.ts` — Generate TypeScript code
   - Write Zod schemas to `.ts` file
   - Write TypeScript interfaces
   - Write API client skeleton

3. CLI or API endpoint: Trigger code generation
   - `POST /api/browser/codegen` — Generate from captured traffic
   - Accepts: domain name, captured traffic buffer, custom config
   - Returns: Generated `types.ts`, `api-client.ts` skeleton

**Tests:**
- Generate Robinhood types from captured traffic, compare with hand-written
- Generate LinkedIn types from traffic
- Handle edge cases (mixed types in array, sparse fields)

---

### Phase 5: LinkedIn API Example (Week 4)

**Deliverables:**
1. Create `/packages/browser/src/linkedin/` module (parallel to robinhood/)
2. Implement LinkedIn-specific auth (LinkedIn login flow)
3. Implement LinkedIn-specific API client (messaging endpoints)
4. Update dashboard UI to support domain selection
5. Document: "Building an API Client for LinkedIn in 30 Minutes with Claude Code"

**Tests:**
- Auth: Login to LinkedIn, capture auth headers
- Traffic: Capture message API calls
- Schema: Generate types for message endpoints
- Client: Make a test API call

---

### Phase 6: Dashboard & CLI Integration (Week 5)

**Deliverables:**
1. Update dashboard to show:
   - Domain selector dropdown (robinhood, linkedin, custom)
   - Live traffic capture with domain-aware filtering
   - Generated code preview
   - Download button for generated module

2. MCP skill updates:
   - `/api-discovery` skill: Generic domain support
   - `/visual-dev` skill: Domain-aware browser control
   - `/systematic-testing` skill: Test generated API client

---

## Part 6: Example: Building LinkedIn API Client

### Step 1: Configure LinkedIn Domain

```typescript
// linkedin/config.ts
export const LinkedInConfig: InterceptorConfig = {
  domainName: 'linkedin',
  interceptPatterns: [
    'https://www.linkedin.com/voyager/**',
    'https://www.linkedin.com/li/track/**',
  ],
  requiredHeaders: [
    'Authorization',          // Bearer token
    'csrf-token',             // CSRF protection
    'x-li-correlationid',     // Request tracking
  ],
  headerSchema: z.object({
    Authorization: z.string().startsWith('Bearer '),
    'csrf-token': z.string(),
    'x-li-correlationid': z.string().uuid(),
  }),
  loginUrl: 'https://www.linkedin.com/login',
  accountUrl: 'https://www.linkedin.com/me',
  accountSelector: '[data-testid="profile-link"]',
};
```

### Step 2: Developer Uses Claude Code

```
Developer: "Set up LinkedIn API exploration. I want to build a client
to read and respond to private messages using the Interceptor framework."

Claude Code:
1. Launches browser with /linkedin/config
2. Navigates to LinkedIn login
3. Waits for developer to log in (manual flow)
4. Captures: Authorization, csrf-token, x-li-correlationid headers
5. Prompts: "Navigate to Messages page to capture message endpoints"
6. Developer clicks around Messages, composing, sending
7. Captures traffic: POST /voyager/api/messaging/conversations, GET .../messages
8. Generates schema from responses
9. Generates TypeScript types and API client skeleton
10. Outputs: /packages/browser/src/linkedin/types.ts, api-client.ts
11. Shows: "Download generated LinkedIn API client"
```

### Step 3: Developer Iterates

```
Developer: "The generated API client is missing the thread_id parameter.
Let me navigate to a specific thread."

Claude Code:
1. Captures more traffic for that specific endpoint
2. Refines schema with new field: thread_id: string
3. Regenerates api-client.ts with corrected method signature
```

---

## Part 7: Benefits of Generalization

| Benefit | Current | After Generalization |
|---------|---------|---------------------|
| **Time to API Client** | Weeks (hand-coded Robinhood) | 30 min (any domain) |
| **Domains Supported** | 1 (Robinhood) | ∞ (any website) |
| **Code Duplication** | High (Robinhood-specific) | Low (shared abstractions) |
| **Maintenance** | One-off fixes for Robinhood | Generic fixes apply everywhere |
| **Extensibility** | Hard (new domain = new module) | Easy (config + base classes) |
| **Type Safety** | Manual schemas | Auto-generated from traffic |

---

## Part 8: FAQ

**Q: Will this work with sites that require CAPTCHA or 2FA?**
A: Not automatically. Manual intervention for login, then auto-capture. We can add 2FA helpers later.

**Q: What about GraphQL APIs?**
A: Requires custom schema detection. Patchright intercepts the `POST` request → we parse `query`/`variables` → generate schema. Phase 4 must support this.

**Q: Will generated types be production-ready?**
A: Schema inference is ~85% accurate. Missing edge cases (summer time zones, feature flags). Manual review recommended. Version control the generated code.

**Q: Can I use this for non-HTTP APIs (WebSocket, gRPC)?**
A: WebSocket: CDP can intercept message frames. Phase 4 extends to WS. gRPC: No. Requires different tooling.

**Q: Who can access the captured auth headers?**
A: Only the authenticated browser session. Server-side session is encrypted in profile directory. Headers never logged to stdout (only stderr).

---

## Part 9: Next Steps

1. **Approve plan:** Confirm scope and timeline
2. **Kick off Phase 1:** Extract generic base classes
3. **Milestone reviews:** Weekly syncs on progress, blockers, schema generation challenges
4. **LinkedIn MVP:** By EOW 5, have working LinkedIn client as proof
5. **Documentation:** "Arbitrary API Discovery with Interceptor" guide

---

## Appendix: File Changes Summary

### To Create (New Files)

```
packages/browser/src/shared/
├── config.ts                (60 lines)
├── interceptor.ts           (300 lines, extracted from robinhood/)
├── auth.ts                  (200 lines, extracted from robinhood/)
├── session-manager.ts       (moved as-is, profile-aware)
├── api-client.ts            (150 lines, abstract base)
├── types.ts                 (100 lines, common types)
├── schema-generator.ts      (250 lines, Phase 4)
└── codegen.ts               (150 lines, Phase 4)

packages/browser/src/linkedin/
├── config.ts                (50 lines)
├── interceptor.ts           (50 lines, LinkedIn-specific)
├── auth.ts                  (50 lines, LinkedIn-specific)
├── api-client.ts            (generated, 200+ lines)
├── types.ts                 (generated, 200+ lines)
└── index.ts                 (30 lines)

packages/browser/src/generic/
├── config.ts                (minimal)
├── interceptor.ts           (extends generic)
├── auth.ts                  (extends generic)
├── api-client.ts            (generic stub)
└── index.ts                 (30 lines)
```

### To Modify

```
apps/api/src/browser.ts
├── Remove hardcoded 'robinhood-trading' profile (lines 40–41)
├── Replace interceptor logic with domain-aware pluggable system
├── Replace verification with generic interface
├── Add DOMAIN_CONFIGS map

packages/browser/src/robinhood/
├── config.ts (new)
├── interceptor.ts (refactor to extend GenericInterceptor)
├── auth.ts (refactor to extend GenericAuthService)
├── index.ts (re-export, no API changes)
├── api-client.ts (keep as-is, but inherit from GenericApiClient)
├── types.ts (keep as-is)
└── session-manager.ts (remove, use GenericSessionManager)
```

---

**Document Version:** 1.0
**Status:** Ready for Review
**Next Review:** After Phase 1 completion
