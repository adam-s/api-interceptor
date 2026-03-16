# Interceptor Generalization: Planning Documents

Complete analysis and roadmap for transforming the Robinhood-specific Interceptor framework into a generic system supporting arbitrary websites (LinkedIn, Twitter, Slack, etc.).

---

## 📚 Documents (Read in This Order)

### 1. **SUMMARY.md** ⭐ START HERE
**Length:** 2 min read
**Purpose:** Executive summary + next steps

**Contains:**
- What we discovered (3-sentence summary per doc)
- Three levels of work ahead
- Decision points for you
- Next steps timeline

👉 **Start here to understand the overall plan**

---

### 2. **API_GENERALIZATION_PLAN.md**
**Length:** 15 min read
**Purpose:** Detailed generalization architecture

**Contains:**
- Code inventory (how data flows from CLI to API client)
- Current architecture (browser control → capture → auth → types)
- Coupling analysis (10 hardcoded constants identified)
- New architecture with generic base classes
- 6-phase implementation roadmap
- LinkedIn example walkthrough
- FAQ + benefits analysis

**Key insight:** Only 10% of code reusable today. After refactoring with LinkedIn: 60% reusable.

👉 **Read this to understand what needs to change and how**

---

### 3. **CODE_INVENTORY_DIAGRAM.md**
**Length:** 10 min read (visual)
**Purpose:** Visual architecture reference

**Contains:**
- ASCII architecture diagram (current state)
- Data flow walkthrough
- Coupling matrix (color-coded: 🔴🟡🟢)
- Coupling scorecard (refactor effort per file)
- Before/after refactoring structure
- Dependency graphs (current vs. proposed)
- Code statistics (LOC counts, reusability %)

**Key insight:** Visualizes the coupling you'll be breaking apart.

👉 **Read this to see what the architecture looks like**

---

### 4. **SKILL_ARCHITECTURE_ANALYSIS.md**
**Length:** 10 min read
**Purpose:** Learn from vercel/agent-browser, improve our skills

**Contains:**
- What vercel/agent-browser does (Rust CLI, pluggable integrations)
- What we do (procedural workflows, iteration guidance)
- What we can learn from them (hierarchical organization, capability lists)
- What they can learn from us (state machines, anti-patterns)
- Hybrid approach proposal
- Specific skill reorganization recommendations
- Phase 1 changes (4 hours work, immediate ROI)

**Key insight:** Their strength (domain hierarchy) + our strength (procedural depth) = powerful combo.

👉 **Read this to understand how to reorganize our skills alongside code changes**

---

## 🎯 Key Findings Summary

| Topic | Finding |
|-------|---------|
| **Coupling level** | 🔴 HIGH (Robinhood hardcoded in 6 files) |
| **Refactor effort** | 5 weeks, 6 phases |
| **Time to add new domain** | 8 hours (before) → 30 min (after) |
| **Code reuse improvement** | 10% → 60% (with LinkedIn) |
| **Skill reorganization** | Can start immediately (4 hours) |
| **Breaking change risk** | Low (refactoring keeps same API) |

---

## 🏗️ Three Levels of Work

### Level 1: Skill Reorganization (Quickest Win)
- **Effort:** 4 hours
- **When:** This week (independent of code changes)
- **ROI:** Clearer skill navigation + domain variant support
- **Files:** api-discovery/, visual-dev/ + all skills
- **Status:** ✅ Ready to start immediately

### Level 2: Code Generalization (Main Work)
- **Effort:** 5 weeks (6 phases)
- **When:** Weeks 1–5 (after skills done)
- **ROI:** Support any domain (Robinhood, LinkedIn, etc.)
- **Files:** shared/ (new), apps/api/browser.ts (refactored), robinhood/ (extended)
- **Status:** ✅ Design complete, ready to implement

### Level 3: Schema Generation (The Magic ✨)
- **Effort:** ~400 LOC in Phase 4
- **When:** Week 3–4
- **ROI:** Auto-generate types from traffic (no manual writing)
- **Files:** schema-generator.ts (new), codegen.ts (new)
- **Status:** ✅ Design ready, implementation in Phase 4

---

## 📊 What Gets Built

### Before (Current State)
```
Robinhood-only
├─ types.ts (791 L) — hardcoded Robinhood schemas
├─ api-client.ts (860 L) — hardcoded Robinhood endpoints
├─ interceptor.ts (328 L) — hardcoded robinhood.com patterns
├─ auth.ts (337 L) — hardcoded Robinhood URLs
├─ session-manager.ts (505 L) — Robinhood token logic
└─ browser.ts (728 L) — monolithic, no domains support

TOTAL: 3,850 LOC, 90% coupling to Robinhood
```

### After (Target State)
```
Generic + Domain Plugins

shared/ (REUSABLE, 1,110 LOC)
├─ interceptor.ts (300 L) — abstract base class
├─ auth.ts (200 L) — abstract base class
├─ session-manager.ts (450 L) — concrete, works for all domains
└─ config.ts, types.ts

robinhood/ (REFACTORED, 1,785 LOC)
├─ types.ts (791 L) — kept as-is
├─ api-client.ts (860 L) — kept as-is
├─ config.ts (50 L) — new: Robinhood-specific config
└─ interceptor.ts, auth.ts (30 L each) — thin wrappers

linkedin/ (NEW, 1,034+ LOC)
├─ types.ts (400+ L) — auto-generated from traffic
├─ api-client.ts (500+ L) — auto-generated from traffic
├─ config.ts (50 L) — LinkedIn-specific config
└─ interceptor.ts, auth.ts (30 L each) — thin wrappers

TOTAL: ~3,929 LOC, 60% reusable
When adding Twitter/Slack/etc: 90% reusable (just config + generate schemas)
```

---

## 🚀 Timeline

| Phase | Duration | Deliverable | Status |
|-------|----------|-------------|--------|
| **Skills reorganization** | This week (4 hrs) | Hierarchical skill structure | ✅ Ready |
| **Phase 1** | Week 1 | Generic base classes | 📋 Planned |
| **Phase 2** | Week 1–2 | Domain-aware browser.ts | 📋 Planned |
| **Phase 3** | Week 2 | Generic traffic capture | 📋 Planned |
| **Phase 4** | Week 3–4 | ⭐ Schema generation | 📋 Planned |
| **Phase 5** | Week 4 | LinkedIn proof-of-concept | 📋 Planned |
| **Phase 6** | Week 5 | Dashboard + MCP integration | 📋 Planned |

---

## 💡 Key Decisions You Need to Make

1. **Approve skill reorganization?** (4 hours, low risk, high visibility)
   - [ ] Yes, do immediately
   - [ ] No, skip for now
   - [ ] Wait for code changes first

2. **LinkedIn as proof-of-concept?**
   - [ ] Yes (realistic domain, good stress test)
   - [ ] Use simpler domain instead (GitHub, Twitter)
   - [ ] Decide later in Phase 5

3. **Timeline**
   - [ ] 5-week sprint (Phases 1–6 concurrently)
   - [ ] Phased approach (slower, but lower risk)
   - [ ] Adjust based on other priorities

---

## 🔗 How These Documents Relate

```
SUMMARY.md (start here, 2 min)
    ↓
    ├─ Code Inventory (visual, understand coupling)
    │   └─ API Generalization Plan (detailed, understand solutions)
    │
    └─ Skill Architecture Analysis (learn + improve)
        └─ API Generalization Plan (see it applied to skills)
```

**Progressive depth:**
- **SUMMARY:** High-level overview
- **CODE_INVENTORY_DIAGRAM:** Visualize the problem
- **API_GENERALIZATION_PLAN:** Understand the solution
- **SKILL_ARCHITECTURE_ANALYSIS:** See how to apply lessons learned

---

## ✅ What's Ready to Start

### Immediately (No approval needed)
- ✅ Skill reorganization (4 hours)
- ✅ Code review + refactoring plan

### Pending Approval
- ⏳ Phase 1 (extract generic base classes)
- ⏳ Phase 2–6 (code implementation)

### Decision Required
- ❓ Timeline (5-week sprint or phased?)
- ❓ LinkedIn as domain or different?
- ❓ Skill reorganization timing?

---

## 📝 How to Use These Documents

**For quick understanding:**
1. Read SUMMARY.md (2 min)
2. Skim CODE_INVENTORY_DIAGRAM.md visuals (5 min)
3. Decide on questions above

**For implementation:**
1. Reference API_GENERALIZATION_PLAN.md for each phase
2. Cross-check CODE_INVENTORY_DIAGRAM.md for current state
3. Use SKILL_ARCHITECTURE_ANALYSIS.md for skill changes

**For stakeholder communication:**
1. Share SUMMARY.md with team
2. Show CODE_INVENTORY_DIAGRAM.md visuals
3. Highlight business impact ("LinkedIn API in 30 min")

---

## 🎓 What You'll Learn

After reading these documents, you'll understand:

✅ Why Robinhood coupling is a problem
✅ How to decouple it (base classes, configs, plugins)
✅ Why generalization is hard (interdependencies)
✅ How to verify it works (LinkedIn proof-of-concept)
✅ How to build it incrementally (6 phases)
✅ How to improve our skills alongside code changes
✅ How long it will take (5 weeks) and what each phase delivers

---

## 🤝 Next Steps

1. **Today:** Read SUMMARY.md (2 min)
2. **This week:** Read all 3 detail docs (~30 min)
3. **Decision:** Approve plan + choose options
4. **Execution:** Kick off Phase 1 (or skill reorganization first)

---

**Created:** 2026-03-15
**Status:** Planning complete, awaiting approval
**Questions?** Ask and I'll expand any section

---

## Appendix: Document Sizes

| Doc | Lines | Read Time | Purpose |
|-----|-------|-----------|---------|
| SUMMARY.md | 350 | 2 min | Overview + next steps |
| API_GENERALIZATION_PLAN.md | 599 | 15 min | Detailed plan |
| CODE_INVENTORY_DIAGRAM.md | 400 | 10 min | Visual reference |
| SKILL_ARCHITECTURE_ANALYSIS.md | 450 | 10 min | Skill reorganization |
| **TOTAL** | **1,799** | **37 min** | Complete analysis |

**Investment:** ~1 hour to read everything
**ROI:** Clarity on 5-week refactoring project + skill improvements
