# Phase 2: Remove Profile-Based Coupling & Enable Multi-Domain Support

**Objective:** Decouple `apps/api/src/browser.ts` from Robinhood, enabling generic API discovery for any website.

**Timeline:** 2-3 days
**Effort:** ~20 hours
**Deliverables:** Domain-agnostic browser API with DOMAIN_CONFIGS registry

---

## Current Coupling (What We're Fixing)

### Hardcoded Robinhood Artifacts
```typescript
// Line 41: Hardcoded profile name
const ROBINHOOD_PROFILE = 'robinhood-trading';

// Line 44: RobinhoodInterceptor hardcoded
let activeInterceptor: RobinhoodInterceptor | null = null;

// Lines 340-409: Robinhood-specific interceptor attachment
if (profile === ROBINHOOD_PROFILE) {
  activeInterceptor = new RobinhoodInterceptor();
  activeInterceptor.onHeadersCaptured = async (headers) => {
    // Robinhood-specific verification logic
    const client = new RobinhoodApiClient(headers);
    const result = await client.verify();
    // Send robinhood_verified message
  };
}

// Lines 502-514: Robinhood login page detection
if (profile === ROBINHOOD_PROFILE) {
  const isLoginPage = changedUrl.includes('robinhood.com/login');
  // Send robinhood_login_page_detected message
}
```

---

## Solution Architecture

### 1. Domain Configuration Registry

Create `packages/browser/src/registry.ts`:
```typescript
interface DomainConfig {
  // From InterceptorConfig
  domainName: string;
  interceptPatterns: string[];
  requiredHeaders: string[];
  headerSchema: z.ZodSchema;
  baseUrls?: string[];
  loginUrl?: string;
  accountUrl?: string;

  // Domain-specific callbacks
  createInterceptor: () => GenericInterceptor;

  // Optional: custom verification
  verifyCredentials?: (headers: Record<string, string>) => Promise<VerificationResult>;

  // Optional: login detection
  detectLoginPage?: (url: string) => boolean;

  // WebSocket message callbacks
  onVerified?: (result: VerificationResult) => { type: string; [key: string]: unknown };
  onVerificationFailed?: (error: string) => { type: string; error: string };
  onLoginDetected?: () => { type: string; [key: string]: unknown };
}

export const DOMAIN_CONFIGS: Record<string, DomainConfig> = {
  'robinhood': {
    ...robinhoodInterceptorConfig,
    createInterceptor: () => new RobinhoodInterceptor(),
    verifyCredentials: async (headers) => {
      const client = new RobinhoodApiClient(headers);
      return client.verify();
    },
    detectLoginPage: (url) => url.includes('robinhood.com/login'),
    onVerified: (result) => ({
      type: 'robinhood_verified',
      accountNumber: result.accountNumber,
      firstName: result.firstName,
      lastName: result.lastName,
      buyingPower: result.buyingPower,
    }),
    onVerificationFailed: (error) => ({
      type: 'robinhood_verification_failed',
      error,
    }),
    onLoginDetected: () => ({
      type: 'robinhood_login_page_detected',
    }),
  },
  'linkedin': {
    // Define LinkedIn config here
  },
};
```

### 2. Refactored browser.ts

**Key changes:**

**Before:**
```typescript
let activeInterceptor: RobinhoodInterceptor | null = null;

if (profile === ROBINHOOD_PROFILE) {
  activeInterceptor = new RobinhoodInterceptor();
  activeInterceptor.onHeadersCaptured = async (headers) => {
    const result = await client.verify();
    // Send robinhood_verified
  };
}
```

**After:**
```typescript
let activeInterceptor: GenericInterceptor | null = null;
let activeDomainConfig: DomainConfig | undefined;

if (profile) {
  activeDomainConfig = DOMAIN_CONFIGS[profile];
  if (activeDomainConfig) {
    activeInterceptor = activeDomainConfig.createInterceptor();
    activeInterceptor.onHeadersCaptured = async (headers) => {
      if (activeDomainConfig?.verifyCredentials) {
        const result = await activeDomainConfig.verifyCredentials(headers);
        if (result.valid && activeDomainConfig.onVerified) {
          ws.send(JSON.stringify(activeDomainConfig.onVerified(result)));
        } else if (!result.valid && activeDomainConfig.onVerificationFailed) {
          ws.send(JSON.stringify(activeDomainConfig.onVerificationFailed(result.error || '')));
        }
      }
    };
  }
}
```

### 3. Updated Imports

**Before:**
```typescript
import { RobinhoodInterceptor, RobinhoodSessionManager } from '@interceptor/browser/robinhood';
```

**After:**
```typescript
import { GenericInterceptor, GenericSessionManager } from '@interceptor/browser/shared';
import { RobinhoodInterceptor } from '@interceptor/browser/robinhood';
```

---

## Implementation Tasks

### Task 1: Create Domain Config Registry
- [x] Create `packages/browser/src/registry.ts`
- [x] Define DomainConfig interface
- [x] Populate DOMAIN_CONFIGS with Robinhood
- [ ] Export from browser package

### Task 2: Refactor browser.ts WebSocket Handler
- [ ] Replace `RobinhoodInterceptor` type with `GenericInterceptor`
- [ ] Remove hardcoded `ROBINHOOD_PROFILE` constant
- [ ] Replace hardcoded logic with config-driven dispatch
- [ ] Extract interceptor attachment into function
- [ ] Extract login detection into function
- [ ] Update session manager usage (use per-domain instances)

### Task 3: Update Session Manager Integration
- [ ] Change from `RobinhoodSessionManager.getInstance()` to `GenericSessionManager.getInstance(domainName)`
- [ ] Update session manager calls to be domain-aware

### Task 4: TypeScript & Testing
- [ ] Run pnpm typecheck (expect 0 errors)
- [ ] Manual smoke test with Robinhood profile
- [ ] Verify traffic capture still works
- [ ] Verify headers capture works

### Task 5: Prepare LinkedIn Config (Template)
- [ ] Create LinkedIn domain config in registry
- [ ] Define LinkedIn-specific patterns & headers
- [ ] Add placeholder verification logic
- [ ] Document expected API structure

---

## File Changes Summary

| File | Change | Impact |
|------|--------|--------|
| `packages/browser/src/registry.ts` | **NEW** | Domain config registry (150 LOC) |
| `apps/api/src/browser.ts` | Refactor | Replace hardcoded Robinhood logic (~300 LOC changes) |
| `packages/browser/src/robinhood/index.ts` | Update exports | Re-export generic classes |
| `packages/browser/src/index.ts` | Update exports | Export registry + shared classes |

---

## Success Criteria

✅ TypeScript compilation passes (0 errors)
✅ Robinhood profile still works identically
✅ Traffic capture for Robinhood enabled
✅ Generic traffic capture (?capture=domain) still works
✅ No hardcoded profile names in business logic
✅ Domain config registry extensible for LinkedIn, Twitter, etc.
✅ All WebSocket messages sent via config callbacks
✅ Session manager per-domain (getInstance(domainName))

---

## What Comes After Phase 2

**Phase 3:** Generic API Client Generator
- Use traffic capture + domain configs to auto-generate TypeScript API clients
- Zod schema inference from captured responses
- One-command setup: "Generate LinkedIn API client from captured traffic"

---

## Go/No-Go

**Status:** 🚀 READY TO IMPLEMENT

**Risks:**
- Session manager refactor (per-domain) might affect persistence
- Robinhood verification logic needs careful extraction

**Mitigations:**
- Test Robinhood thoroughly before declaring done
- Session files are per-profile already, just need to use domain-keyed manager instances
