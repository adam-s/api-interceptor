# Phase 4: Real-World Multi-Domain APIs (MinuteInbox + Investing.com)

**Objective:** Demonstrate the framework end-to-end by creating APIs for two real websites.

**Timeline:** 2-3 hours (depends on site responsiveness)
**Effort:** ~10 hours active work
**Deliverables:** minuteinbox-api-client.ts + investing-api-client.ts + working auth

---

## Tasks

### Task 1: MinuteInbox Domain Config & Interceptor
```typescript
// packages/browser/src/minuteinbox/config.ts
export const minuteinboxInterceptorConfig: InterceptorConfig = {
  domainName: 'minuteinbox',
  interceptPatterns: [
    'https://www.minuteinbox.com/api/**',
  ],
  requiredHeaders: ['Authorization'], // or session cookie
  headerSchema: z.object({
    Cookie: z.string().optional(),
    Authorization: z.string().optional(),
  }),
  loginUrl: 'https://www.minuteinbox.com/',
};

// packages/browser/src/minuteinbox/interceptor.ts
export class MinuteInboxInterceptor extends GenericInterceptor {
  constructor() {
    super(minuteinboxInterceptorConfig);
  }
}
```

### Task 2: Investing.com Domain Config & Interceptor
```typescript
// packages/browser/src/investing/config.ts
export const investingInterceptorConfig: InterceptorConfig = {
  domainName: 'investing',
  interceptPatterns: [
    'https://www.investing.com/api/**',
    'https://api.investing.com/**',
  ],
  requiredHeaders: ['Authorization', 'X-CSRF-Token'],
  headerSchema: z.object({
    Authorization: z.string(),
    'X-CSRF-Token': z.string(),
  }),
  loginUrl: 'https://www.investing.com/login/',
  accountUrl: 'https://www.investing.com/account/',
};

// packages/browser/src/investing/interceptor.ts
export class InvestingInterceptor extends GenericInterceptor {
  constructor() {
    super(investingInterceptorConfig);
  }
}
```

### Task 3: Register in Domain Config
```typescript
// packages/browser/src/domain-config.ts
export const DOMAIN_CONFIGS: Record<string, DomainConfig> = {
  // ... existing configs ...
  minuteinbox: {
    ...minuteinboxInterceptorConfig,
    createInterceptor: () => new MinuteInboxInterceptor(),
    // No verification needed for minuteinbox
  },
  investing: {
    ...investingInterceptorConfig,
    createInterceptor: () => new InvestingInterceptor(),
    verifyCredentials: async (headers) => {
      try {
        const res = await fetch('https://www.investing.com/api/user/profile', { headers });
        if (!res.ok) return { valid: false, error: 'Unauthorized' };
        const data = await res.json();
        return {
          valid: true,
          accountNumber: data.user_id,
          firstName: data.first_name,
          lastName: data.last_name,
        };
      } catch (e) {
        return { valid: false, error: String(e) };
      }
    },
  },
};
```

### Task 4: Browser Automation
- Open minuteinbox.com in browser profile `minuteinbox-demo`
- Capture the generated email address
- Open investing.com in browser profile `investing-demo`
- Register new account with:
  - Email: from minuteinbox
  - Name: Migel Hernandez
  - Capture auth cookies/tokens
- Verify session works (navigate account page)

### Task 5: Traffic Capture
- MCP tools will capture all API calls:
  - MinuteInbox: email generation, inbox checks
  - Investing: login, account fetch, calendar queries
- Store traffic in `/browser/traffic` buffer

### Task 6: API Client Generation
```bash
pnpm codegen minuteinbox --output ./generated/minuteinbox-api-client.ts
pnpm codegen investing --output ./generated/investing-api-client.ts
```

### Task 7: Test Generated Clients
```typescript
import { createMinuteInboxClient } from './generated/minuteinbox-api-client';
import { createInvestingClient } from './generated/investing-api-client';

const minuteInbox = createMinuteInboxClient(minuteinboxHeaders);
const investing = createInvestingClient(investingHeaders);

// Test API calls...
```

---

## Success Criteria

✅ MinuteInbox account created + email generated
✅ Investing.com account created with that email
✅ Auth credentials captured in browser profile
✅ Traffic from both domains captured (≥10 calls each)
✅ API clients auto-generated with ≥5 methods each
✅ Generated clients are valid TypeScript (typecheck passes)
✅ Can make real API calls with generated clients

---

## Value Demonstrated

1. **Zero manual API documentation** - APIs reverse-engineered from traffic
2. **Multi-domain support** - Same framework handles entirely different sites
3. **Type safety** - Generated Zod schemas + TypeScript types
4. **Real authentication** - Browser captures and persists auth
5. **One-command generation** - `pnpm codegen <domain>` creates full client
6. **Extensibility** - Adding minuteinbox + investing required ZERO changes to core

---

## What Comes After Phase 4

Phase 5: Production-Ready Framework
- Package as npm module
- Add CI/CD for tests
- Docker support
- Documentation site

---

## Go/No-Go

**Status:** 🚀 READY - This is the real test!
