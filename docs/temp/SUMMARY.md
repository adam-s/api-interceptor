# Interceptor Generalization Project: Complete Summary

**Date:** 2026-03-15
**Status:** Planning Phase Complete ✅
**Next:** Review + approval → Phase 1 implementation

---

## What We Discovered

### 1. **API Generalization Plan** (API_GENERALIZATION_PLAN.md)

**Problem:** Current system is 100% hardcoded to Robinhood. Can't add LinkedIn, Twitter, Stripe, etc. without copying/modifying 1,000+ lines of code.

**Solution:** Extract generic base classes → domain-specific configs → pluggable system

**Coupling hotspots:**
- `apps/api/src/browser.ts` (profile name, interceptor class, verification logic)
- `robinhood/interceptor.ts` (URL patterns, header names)
- `robinhood/auth.ts` (login URLs, selectors)

**Refactoring plan:** 6 phases over 5 weeks
- Phase 1: Extract generic base classes
- Phase 2: Refactor browser.ts for domain registry
- Phase 3: Generic traffic capture
- Phase 4: ⭐ Schema generation from traffic
- Phase 5: LinkedIn proof-of-concept
- Phase 6: Dashboard + MCP integration

**Outcome:** Adding a new domain = 200 LOC (~30 min), not 1,500 LOC (~8 hours)

---

### 2. **Code Inventory Diagram** (CODE_INVENTORY_DIAGRAM.md)

**Visual maps showing:**
- Current architecture (tight Robinhood coupling)
- Data flow (user action → API client)
- Coupling matrix (which files hardcode what)
- Refactoring before/after
- Dependency graphs

**Key insight:** Only 10% of code is reusable (mcp/server.ts). The other 90% is either:
- Robinhood-specific (types.ts, api-client.ts) ← Keep as-is, auto-generated for other domains
- Tightly coupled to Robinhood (browser.ts, interceptor.ts) ← Must be refactored

**After refactoring with LinkedIn:**
- 60% shared/reusable (session mgr, base interceptor, base auth)
- 40% domain-specific (config + auto-generated types/client)
- Time to add 3rd domain: ~30 min

---

### 3. **Skill Architecture Analysis** (SKILL_ARCHITECTURE_ANALYSIS.md)

**Comparison:** vercel/agent-browser vs. our skills

| Aspect | vercel | ours |
|--------|--------|------|
| **Organized by** | Capability (platform) | Use case (workflow) |
| **Problem solved** | "How do I make browser do X?" | "How do I build/debug Z?" |
| **Strength** | Clear domain variants | Procedural + anti-patterns |
| **Weakness** | No iteration guidance | No hierarchy/variants |

**Hybrid recommendation:** Borrow their hierarchical organization + keep our procedural depth

**Proposed skill structure:**
```
api-client-builder/            ← Parent (overview)
├─ base-workflow.md            ← Generic procedure
├─ capabilities.md             ← Tool reference
├─ robinhood/                  ← Domain variant
├─ linkedin/                   ← Domain variant
└─ generic/                    ← Template for new domains

visual-dev/                    ← Similar reorganization
├─ capabilities.md
├─ workflows.md
└─ SKILL.md (lean)
```

**Phase 1 effort:** ~4 hours (no new logic, just reorganization)
**ROI:** 30% less complexity + clearer hierarchy

---

## Three Levels of Work Ahead

### Level 1: Skill Reorganization (Quickest Win)

**What:** Restructure skills to match vercel's hierarchy + keep our procedural depth
**Effort:** 4 hours
**ROI:** Clearer skill navigation, faster domain variants
**Files affected:**
- `api-discovery/` → split into live-mode, batch-mode, generic
- `visual-dev/` → add capabilities.md, workflows.md
- All skills → add "Getting Unstuck" section

**Status:** Ready to implement immediately

---

### Level 2: Code Generalization (The Main Work)

**What:** Extract generic base classes, make interceptor pluggable, test with LinkedIn
**Effort:** 5 weeks (6 phases)
**ROI:** Go from 0→1 domain (Robinhood only) to support ∞ domains
**Files affected:**
- Create: `shared/` (generic abstractions)
- Refactor: `apps/api/browser.ts` (domain registry)
- Extend: `robinhood/` to use shared classes
- New: `linkedin/`, `generic/`

**Milestones:**
- Week 1: Phase 1–2 (base classes + browser.ts)
- Week 2: Phase 3 (generic traffic capture)
- Week 3–4: Phase 4 (schema generation)
- Week 4: Phase 5 (LinkedIn MVP)
- Week 5: Phase 6 (dashboard integration)

**Status:** Planning complete, ready to kick off

---

### Level 3: Schema Generation (The Magic ✨)

**What:** Analyze captured traffic → infer Zod schemas → generate TypeScript code
**Effort:** Embedded in Phase 4 (2 weeks)
**ROI:** Remove manual API client writing entirely
**Estimated code:**
- `schema-generator.ts` (250 LOC): Detect types, handle arrays, unions, nulls
- `codegen.ts` (150 LOC): Write Zod + TypeScript + client skeleton

**Challenge:** 85% accuracy is realistic (handles most cases). Edge cases (summer time zones, feature flags, sparse fields) need review.

**Status:** Design ready, implementation in Phase 4

---

## Decision Points for You

### Decision 1: Skill Reorganization Timing

**Option A (Recommended):** Do Level 1 immediately (4 hrs)
- Clearer navigation while working on Level 2
- No interference with code refactoring
- Users see improvement in 1 day

**Option B:** Combine with Level 2
- One big refactor (harder to review)
- Takes longer to see results

**Recommendation:** **Option A** — get the easy win first

---

### Decision 2: LinkedIn as Proof-of-Concept

**Option A (Recommended):** Yes, use LinkedIn
- Real-world use case (AI responding to messages)
- Different auth pattern (OAuth-like vs. token capture)
- Different traffic pattern (GraphQL for some, REST for others)
- Validates architecture handles complexity

**Option B:** Use simpler domain (GitHub API, Twitter API)
- Faster proof-of-concept
- Less "unknown unknowns"

**Recommendation:** **Option A** — LinkedIn is more challenging, better stress test

---

### Decision 3: Dashboard Integration Timing

**Option A (Recommended):** After Phase 5 (LinkedIn working)
- Dashboard changes can wait until architecture is proven
- Reduces risk

**Option B:** Start dashboard changes in Phase 2
- UI better mirrors internal changes
- More work in parallel

**Recommendation:** **Option A** — dashboard is Phase 6, not critical path

---

## Next Steps

### If You Approve the Plan

1. **This week:**
   - [ ] Review 3 documents (took me ~2 hrs to write, should take you ~1 hr to read)
   - [ ] Approve Level 1 (skill reorganization) + Level 2 (code generalization)
   - [ ] Schedule kickoff for Phase 1

2. **Week 1:**
   - [ ] Execute Level 1 (skill reorganization, 4 hrs)
   - [ ] Start Phase 1 (extract generic base classes)
   - [ ] Commit reorganized skills + refactored robinhood module

3. **Week 2–5:**
   - [ ] Phase 2–5 (as per roadmap)
   - [ ] Weekly milestone reviews
   - [ ] GitHub Actions passing throughout

4. **Week 5+:**
   - [ ] Phase 6 (dashboard integration)
   - [ ] Documentation: "Build LinkedIn API in 30 Min"
   - [ ] Production deployment

---

### If You Want Modifications

- **Too ambitious?** We can reduce scope (skip LinkedIn, do only schema generation in Phase 4)
- **Want earlier LinkedIn?** We can front-load Phase 5
- **Want different domain?** We can substitute (Twitter, Slack, etc.)
- **Unclear on something?** Let me expand those sections

---

## Key Files

All 3 documents are in `/Users/adamsohn/Projects/api-interceptor/docs/temp/`:

1. **API_GENERALIZATION_PLAN.md** (599 lines)
   - What to change, why, how
   - 6-phase roadmap with effort estimates
   - FAQ and benefits analysis

2. **CODE_INVENTORY_DIAGRAM.md** (400 lines)
   - Visual architecture diagrams
   - Coupling matrix (color-coded)
   - Before/after code statistics

3. **SKILL_ARCHITECTURE_ANALYSIS.md** (450 lines)
   - Comparison with vercel/agent-browser
   - What to learn from them
   - Hybrid skill structure proposal

---

## The Big Picture

### What We're Solving

**Current state:** Interceptor is Robinhood-only. To add another domain (LinkedIn), we need to:
1. Copy `/packages/browser/src/robinhood/` → `/packages/browser/src/linkedin/`
2. Modify 1,500+ lines of code
3. Change hardcoded patterns, headers, URLs, selectors
4. Write 200+ lines of LinkedIn-specific types and API methods
5. Hope nothing breaks

**Target state:** Interceptor is generic. To add another domain (LinkedIn), we need to:
1. Create 6 files (~200 LOC total)
2. Copy `linkedin/config.ts` template (30 lines)
3. Run schema generator on captured traffic
4. Review + commit generated types/client
5. Done in 30 minutes

### The Business Impact

**Before:**
- 1 domain supported (Robinhood)
- 1 month of work to add a 2nd domain
- Technical debt accumulates (duplication, coupling)

**After:**
- ∞ domains supported (generic architecture)
- 30 minutes to add a new domain
- Technical debt decreases (shared abstractions, clear patterns)

**Business value:**
- Enable developers to build API clients for ANY website
- "Build LinkedIn API client in 30 minutes with Claude Code" marketing story
- Reusable for other use cases (web scraping, browser automation, etc.)

---

## Questions?

If anything in these documents is unclear, I can:
- Expand specific sections
- Provide concrete code examples
- Adjust the roadmap
- Answer technical questions

Just let me know what you'd like to dive deeper on.

---

**Status:** 📋 Planning documents complete, awaiting your approval to proceed with Phase 1.
