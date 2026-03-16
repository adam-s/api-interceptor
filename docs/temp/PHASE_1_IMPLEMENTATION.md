# Phase 1: Extract Generic Base Classes

**Objective:** Create reusable abstractions that work for any domain (Robinhood, LinkedIn, etc.)

**Timeline:** 1 week (5 days)
**Effort:** ~40 hours
**Deliverables:** Shared base classes + refactored Robinhood module (still fully functional)

---

## Tasks Breakdown

### Day 1: Setup + Interfaces

**1.1 Create `/packages/browser/src/shared/` directory structure**
```
shared/
├─ config.ts              ← InterceptorConfig interface
├─ types.ts               ← Common types (InterceptedRequest, InterceptedResponse, etc.)
├─ interceptor.ts         ← GenericInterceptor abstract base class
├─ auth.ts                ← GenericAuthService abstract base class
├─ session-manager.ts     ← GenericSessionManager concrete class
└─ __tests__/
   ├─ interceptor.test.ts
   ├─ auth.test.ts
   └─ session-manager.test.ts
```

**1.2 Define InterceptorConfig interface** (shared/config.ts)
- Domain name
- URL patterns to intercept
- Required header names
- Header validation schema
- Login/account URLs
- Custom verification function (optional)

**1.3 Extract common types** (shared/types.ts)
- InterceptedRequest
- InterceptedResponse
- InterceptionCallback
- InterceptorConfig
- SessionStatus

### Day 2: Base Classes (Part 1)

**2.1 Extract GenericInterceptor** (shared/interceptor.ts)
- Abstract base class
- Constructor takes InterceptorConfig
- Core methods:
  - `attach(page)` — attach to page, set up routes
  - `handleRoute(route)` — intercept, capture, validate
  - `getHeaders()` — retrieve + validate headers
  - `hasAllHeaders()` — check if required headers present
  - `waitForHeaders(timeout)` — promise-based capture
  - `onIntercept(callback)` — register callback
  - `clearHeaders()` — clear captured headers

**2.2 Extract common logic from RobinhoodInterceptor**
- Route interception pattern matching
- Header extraction and validation
- Callback pattern
- Promise-based waiting

### Day 3: Base Classes (Part 2)

**3.1 Extract GenericAuthService** (shared/auth.ts)
- Abstract base class
- Constructor takes auth config
- Core methods:
  - `startSession()` — launch persistent context
  - `navigate(url)` — navigate to page
  - `disconnect()` — clean up
  - `clearSession()` — logout
  - `getPage()` — return page for embedding

**3.2 Extract common logic from RobinhoodAuthService**
- Persistent profile management
- Page creation logic
- Ad blocker integration
- Session lifecycle

### Day 4: Concrete Reusable Class

**4.1 Move GenericSessionManager** (shared/session-manager.ts)
- Already profile-aware ✅
- Just needs minor extraction from robinhood/
- No changes needed (it's already generic!)

**4.2 Update types to use profile-agnostic naming**
- `RobinhoodSession` → `GenericSession`
- `RobinhoodSessionManager` → `GenericSessionManager`
- All session file naming parameterized

### Day 5: Refactor Robinhood + Tests

**5.1 Refactor RobinhoodInterceptor**
- `extends GenericInterceptor`
- Constructor: `super(RobinhoodConfig)`
- Override only if needed (probably won't need to)
- Tests still pass ✅

**5.2 Refactor RobinhoodAuthService**
- `extends GenericAuthService`
- Constructor: `super(RobinhoodAuthConfig)`
- Robinhood-specific URLs + selectors in config
- Tests still pass ✅

**5.3 Create RobinhoodConfig**
- URL patterns
- Header names
- Login/account URLs
- Account selector
- Verification function

**5.4 Create unit tests**
- `__tests__/shared/interceptor.test.ts`
- `__tests__/shared/auth.test.ts`
- `__tests__/shared/session-manager.test.ts`
- Verify existing robinhood tests still pass

**5.5 TypeScript compilation check**
- `pnpm typecheck`
- Fix any type issues

**5.6 Commit**
- Clean commit with clear message
- Ready for Phase 2

---

## Success Criteria

✅ All new code in `shared/` compiles without errors
✅ All existing tests still pass
✅ RobinhoodInterceptor extends GenericInterceptor
✅ RobinhoodAuthService extends GenericAuthService
✅ No breaking changes to public API
✅ New unit tests for shared classes
✅ TypeScript strict mode passes
✅ Code review ready

---

## Files to Create

| File | Lines | Purpose |
|------|-------|---------|
| shared/config.ts | 50 | InterceptorConfig interface |
| shared/types.ts | 100 | Common types |
| shared/interceptor.ts | 250 | GenericInterceptor base class |
| shared/auth.ts | 200 | GenericAuthService base class |
| shared/session-manager.ts | 450 | GenericSessionManager (moved) |
| shared/__tests__/interceptor.test.ts | 100 | Unit tests |
| shared/__tests__/auth.test.ts | 100 | Unit tests |
| shared/__tests__/session-manager.test.ts | 100 | Unit tests |
| robinhood/config.ts | 50 | Robinhood-specific config |
| **TOTAL** | **1,350** | Generic + Robinhood |

## Files to Modify

| File | Change | Impact |
|------|--------|--------|
| robinhood/interceptor.ts | Extend GenericInterceptor | -200 LOC (removed duplication) |
| robinhood/auth.ts | Extend GenericAuthService | -150 LOC (removed duplication) |
| robinhood/session-manager.ts | Move to shared/ | New import location |
| robinhood/index.ts | Update imports | Minimal change |
| robinhood/types.ts | Keep as-is | No change |
| robinhood/api-client.ts | Keep as-is | No change |
| apps/api/src/browser.ts | Keep as-is (for now) | No change (Phase 2) |

---

## Testing Strategy

### Unit Tests (New)
- Test GenericInterceptor with mock config
- Test GenericAuthService with mock config
- Test GenericSessionManager profile management

### Integration Tests (Existing)
- Verify RobinhoodInterceptor still works (extends GenericInterceptor)
- Verify RobinhoodAuthService still works (extends GenericAuthService)
- Verify existing e2e tests pass

### TypeScript Checks
- `pnpm typecheck` — ensure all types align
- `pnpm lint` — ESLint passes
- No type-errors warnings

---

## Rollback Plan

If anything breaks:
1. Keep robinhood/ as fallback (git stash the refactoring)
2. Revert to commit before shared/ creation
3. Investigate why extraction didn't work
4. Re-attempt with fixes

**Risk level:** LOW (we're extracting, not changing behavior)

---

## What Comes After Phase 1

Phase 2 will update `apps/api/src/browser.ts` to:
- Remove hardcoded `'robinhood-trading'` profile
- Create DOMAIN_CONFIGS registry
- Support multiple domains via config
- Add generic verification interface

But that's **after** Phase 1 is solid.

Phase 1 focus: Extract + test. Nothing breaks. All tests green. ✅

---

**Status:** Ready to start
**Start Date:** Today
**End Date:** +5 days
**Go/No-Go:** 🚀 GO
