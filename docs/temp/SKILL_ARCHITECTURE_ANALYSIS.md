# Skill Architecture Analysis: Comparing Approaches

## Executive Summary

**vercel/agent-browser** and **our interceptor skills** solve **similar but fundamentally different problems**:

| Aspect | vercel/agent-browser | Our Skills |
|--------|---------------------|-----------|
| **What it is** | Low-level browser control library (Rust CLI) | High-level procedural workflows (Claude guidance) |
| **Organization** | By integration domain (slack/, electron/) | By use case / operational phase |
| **Target user** | Developers building AI agents | Claude Code (the agent itself) |
| **Primary value** | Performance + standardized commands | Context + iteration strategy |
| **Problem solved** | "How do I make the browser do X?" | "How do I build/debug/deploy Z?" |

**The key insight:** They organize by *capabilities* (slack integration, electron skills). We organize by *workflows* (visual-dev loop, systematic testing phases, CI checks). **Both are valid**, and actually **complementary**.

---

## Part 1: vercel/agent-browser Architecture

### What They Do

**vercel/agent-browser** is a **Rust CLI for browser automation**, optimized for:
- **Speed**: Native Rust, no Node.js overhead
- **Standardization**: Unified command interface for all agents
- **Integration**: Pluggable skills for different platforms (Slack, Electron, Vercel sandbox)

### How They Organize Skills

```
skills/
├── agent-browser/              ← Core browser automation
├── slack/                      ← Slack bot integration
├── electron/                   ← Desktop app integration
├── vercel-sandbox/             ← Cloud deployment environment
└── dogfood/                    ← Internal testing
```

**Pattern:** *Skills = Platform/Integration Plugins*

**Benefits:**
✅ Clear separation of concerns (Slack ≠ Electron)
✅ Easy to add new platform integrations
✅ Each skill knows its domain constraints

**Limitations:**
❌ No guidance on *how to use* skills iteratively
❌ No procedural workflow (prerequisites, state enumeration, iteration loops)
❌ No anti-patterns or "gotchas"
❌ Assumes developer knows what they're doing

---

## Part 2: Our Interceptor Skills Architecture

### What We Do

**Our skills** are **high-level procedural guides**, designed to:
- **Coach Claude Code** through complex multi-step workflows
- **Embed domain knowledge** (prerequisites, state machines, iteration strategies)
- **Prevent mistakes** with clear anti-patterns and gotchas
- **Enable leverage** by making skills do their job better

### How We Organize Skills

```
.claude/skills/
├── api-discovery/              ← Reverse-engineer APIs via traffic capture
├── visual-dev/                 ← Iterative screenshot → judge → fix loop
├── systematic-testing/         ← Bottom-up layer-by-layer validation
├── ci-check/                   ← Run + verify GitHub Actions
├── ec2-deploy/                 ← Deploy, rebuild, reseed, manage
└── debug-logs/                 ← Analyze /tmp/ logs with targeted instrumentation
```

**Pattern:** *Skills = Use Case / Operational Phase*

**Benefits:**
✅ Each skill documents prerequisites (discovery phase)
✅ Each skill explains state enumeration (what can go wrong?)
✅ Each skill describes iteration loops (how to get unstuck)
✅ Each skill includes "gotchas" and anti-patterns
✅ Reproducible workflows (same steps, every time)

**Limitations:**
❌ Could be more modular (visual-dev is 600+ lines)
❌ Could benefit from clearer phase breakdown
❌ Some procedural detail could be abstracted into base classes

---

## Part 3: What We Can Learn from vercel/agent-browser

### 1. **Capability-Driven Organization (For Complex Skills)**

**Their approach:** Organize by *platform/integration*, not workflow.

**How we could apply this:**

Currently, `api-discovery` is monolithic (covers both Live Mode and Batch Mode). We could split it:

```
.claude/skills/
├── api-discovery/
│   ├── SKILL.md              ← High-level overview
│   ├── live-mode/            ← For projects with running API server
│   │   └── SKILL.md
│   └── batch-mode/           ← For standalone discovery
│       └── SKILL.md
```

Or for interceptor generalization:

```
.claude/skills/
├── api-client-builder/       ← Parent skill
│   ├── SKILL.md              ← Unified overview
│   ├── robinhood/            ← Robinhood-specific setup
│   │   └── SKILL.md
│   ├── linkedin/             ← LinkedIn-specific setup
│   │   └── SKILL.md
│   └── generic/              ← Generic domain template
│       └── SKILL.md
```

**Benefit:** Clearer hierarchy. When Claude is building a LinkedIn API client, it loads the LinkedIn-specific skill, not a 600-line generic skill.

---

### 2. **Capability Checklist Pattern**

**Their approach:** List all available commands and what they do.

**Example from browser automation:**
- `navigate(url)` — Go to page
- `click(selector)` — Click element
- `type(text)` — Type into focused field
- etc.

**How we could apply this:**

Instead of embedding all screenshots into visual-dev narrative, create a **capability checklist**:

```markdown
## Visual Development Capabilities

| Phase | Capability | When to use |
|-------|-----------|------------|
| **Phase 1: Understand** | Code reading | Before first screenshot |
| **Phase 2: Enumerate** | State listing | Before taking any screenshots |
| **Phase 3: Build Loop** | Screenshot | Every change |
|  | Judgment (7 criteria) | After every screenshot |
|  | Fix (one thing) | Based on judgment |
| **Phase 4: Interaction** | Click/type/verify | Test interactive flows |
| **Phase 5: Viewport** | Resize + screenshot | Mobile/tablet/desktop |
| **Phase 6: Cleanup** | Delete temp files | After completing |
```

Then the **workflow** references the checklist instead of embedding everything.

---

### 3. **Domain-Specific Variants (Skills as Templates)**

**Their approach:** Create a skill *template* for new integrations.

**How we could apply this:**

Instead of one monolithic `api-discovery` skill, create:

1. **api-discovery/base.md** — Generic principles
2. **api-discovery/robinhood.md** — Robinhood-specific setup (headers to look for, auth flow)
3. **api-discovery/linkedin.md** — LinkedIn-specific setup (login, messaging endpoints)
4. **api-discovery/generic.md** — Template for new domains

**Benefits:**
✅ Claude loads the right skill for the right domain
✅ Domain-specific context embedded where it matters
✅ New domains don't require updating the main skill

---

## Part 4: What vercel/agent-browser Can Learn From Us

### 1. **Procedural Workflows (Not Just Commands)**

**We do:** Comprehensive multi-step workflows with phases.

**Example:** visual-dev doesn't just say "screenshot the page". It says:
- Phase 1: Read code to understand it
- Phase 2: Enumerate all states
- Phase 3: Screenshot → judge (7 criteria) → fix (one thing)
- Repeat until no problems

**Their gap:** agent-browser lists commands but doesn't explain *how* to use them together.

**How they could apply this:**

Add a `WORKFLOW.md` for each skill:

```
skills/agent-browser/
├── CAPABILITIES.md           ← List of commands (their current approach)
└── WORKFLOWS.md              ← How to use them together
    ├── screenshot-loop
    ├── interaction-testing
    └── state-verification
```

---

### 2. **Anti-Patterns & Gotchas**

**We do:** Document what NOT to do and why.

**Examples from our skills:**
- `visual-dev`: "Don't use `networkidle` — SSE/WebSockets prevent it from resolving"
- `api-discovery`: "Don't pre-cache all prices — future data in memory leaks 100% of the time"
- `ci-check`: "Never skip hooks — diagnose the root cause first"

**Their gap:** agent-browser doesn't mention gotchas.

**How they could apply this:**

Add a "Getting Unstuck" section to each skill:

```markdown
## Getting Unstuck

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Timeout on click | Selector stale after page update | Re-query selector in flow |
| Screenshot blank | Page not hydrated | Add waitForTimeout(2000) |
| RLS rate limit | Too many requests, same IP | Wait 10+ min, add delays |
```

---

### 3. **State Machines & Iteration Loops**

**We do:** Teach Claude to think in terms of states and transitions.

**Example from systematic-testing:**

```
State Machine:
pending → running → complete (success or error)
         ↓
      error → investigate → fix → rerun
```

**Our pattern:**
1. Enumerate states before proceeding
2. Test each state independently
3. Verify state transitions work
4. Check edge cases (concurrent updates, network failures)

**Their gap:** agent-browser focuses on single commands, not state machines.

**How they could apply this:**

Document state machines for common patterns:

```
Skill: interaction-testing

State Machine for Form Submission:
   form-empty
       ↓ (user fills fields)
   form-filled
       ↓ (user clicks submit)
   form-submitting (show spinner)
       ↓ (API responds)
   form-success or form-error
       ↓ (user can dismiss/retry)

Test each transition with:
- Preconditions (what state must we be in?)
- Action (what do we do?)
- Postconditions (what state are we in now?)
- Side effects (errors, redirects, etc.)
```

---

## Part 5: Hybrid Approach (Best of Both)

### Proposed Structure for Interceptor Skills

Combine **capability organization** (vercel) + **workflow guidance** (ours):

```
.claude/skills/
├── api-client-builder/                    ← Parent: High-level overview
│   ├── SKILL.md                           ← "Use this to build API clients"
│   ├── capabilities.md                    ← ⭐ NEW: What you can do
│   ├── workflows.md                       ← ⭐ NEW: How to use together
│   ├── base-workflow.md                   ← ⭐ NEW: Generic domain template
│   │
│   ├── robinhood/                         ← Domain-specific variant
│   │   ├── SKILL.md                       ← Domain-specific overrides
│   │   ├── headers.md                     ← Expected headers for Robinhood
│   │   ├── auth-flow.md                   ← Robinhood login specifics
│   │   └── endpoints.md                   ← Robinhood endpoints to test
│   │
│   ├── linkedin/                          ← Domain-specific variant
│   │   ├── SKILL.md
│   │   ├── headers.md
│   │   ├── auth-flow.md
│   │   └── endpoints.md
│   │
│   └── generic/                           ← Template for new domains
│       ├── SKILL.md
│       ├── headers.md                     ← "Discover these yourself"
│       ├── auth-flow.md                   ← "Try common patterns"
│       └── endpoints.md                   ← "Enumerate from traffic"
│
├── api-discovery/                         ← Complementary skill
│   ├── SKILL.md                           ← Same as today
│   ├── live-mode.md                       ← Variant: running API server
│   └── batch-mode.md                      ← Variant: standalone script
│
└── visual-dev/                            ← Same as today
    ├── SKILL.md
    ├── capabilities.md                    ← ⭐ NEW: Available tools
    └── workflows.md                       ← ⭐ NEW: Common screenshot loops
        ├── debug-loop.md
        ├── layout-verification.md
        └── dark-mode-testing.md
```

---

## Part 6: Specific Recommendations

### Recommendation 1: Split api-discovery into Variants

**Current:** One 600+ line skill covering both Live Mode and Batch Mode.

**Proposed:**

```
api-discovery/SKILL.md (50 lines)
├── When to use: "Reverse-engineer APIs by capturing traffic"
├── Two modes:
│   ├── Live Mode (for running API servers)
│   │   └─ loads live-mode.md (detailed, 300+ lines)
│   └── Batch Mode (for standalone scripts)
│       └─ loads batch-mode.md (detailed, 300+ lines)
└─ Common patterns:
    └─ loads common-patterns.md (100 lines)
```

**Benefit:** Claude loads the right skill variant for the situation. Less cognitive load.

---

### Recommendation 2: Create api-client-builder as Parent Skill

**Current:** api-discovery is the main skill. No clear hierarchy for domain variants.

**Proposed:**

```
api-client-builder/SKILL.md (high-level)
│
├─ robinhood/ (inherit + override specific parts)
├─ linkedin/ (inherit + override specific parts)
└─ generic/ (template for new domains)
```

**When Claude is building a LinkedIn API client:**
```
User: "Build a LinkedIn messaging API client"
Claude: "I'll use the api-client-builder skill with the linkedin variant"
```

---

### Recommendation 3: Separate Capabilities from Procedures

**Current:** visual-dev mixes "here's what Patchright can do" with "here's how to use it".

**Proposed:**

```
visual-dev/SKILL.md (high-level overview)
├─ capabilities.md (what tools are available)
│  ├─ screenshot (with options: quality, fullPage)
│  ├─ click (x, y, button)
│  ├─ type (text)
│  ├─ evaluate (javascript code)
│  └─ etc.
│
└─ workflows.md (how to use them)
   ├─ screenshot-loop.md (the core pattern)
   ├─ interaction-testing.md (testing user actions)
   ├─ state-verification.md (checking page state)
   └─ viewport-testing.md (mobile/tablet/desktop)
```

**Benefit:**
✅ "I need to click an element" → read capabilities.md for syntax
✅ "I need to verify my UI is correct" → read workflows.md for strategy

---

### Recommendation 4: Add Getting Unstuck Sections

**Current:** Some skills have "Getting Unstuck", most don't.

**Proposed:** Every skill includes:

```markdown
## Getting Unstuck

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| ... | ... | ... |
```

---

## Part 7: Specific Changes to Interceptor Skills

### For api-discovery

```diff
- # API Discovery via Traffic Capture
+ # API Discovery Skill

- Reverse-engineer undocumented web APIs...
+ ## When to use
+ Use this skill when building typed API clients for sites without public docs.

+ ## Two Variants
+ | Mode | When | How |
+ |------|------|-----|
+ | Live | Running API server with /browser | REST polling loop |
+ | Batch | Standalone | Write script, run, dump, analyze |

- ## Two Modes
- [600 lines of detailed procedures]
+ ## Quick Start
+ [50 lines: minimum steps to get started]

+ ## Variants
+ - [live-mode.md] — Detailed Live Mode (300+ lines)
+ - [batch-mode.md] — Detailed Batch Mode (300+ lines)
+ - [common-patterns.md] — Shared techniques (100 lines)

+ ## For Specific Domains
+ - [robinhood-variant.md] — Header names, auth flow, endpoints
+ - [linkedin-variant.md] — Header names, auth flow, endpoints
+ - [generic-template.md] — How to build new domain variants
```

### For visual-dev

```diff
- # Visual Development Loop
+ # Visual Development Skill

- Use Patchright... iterative screenshot loop...
+ ## When to use
+ Use this skill when building, fixing, or reviewing UI.

+ ## Quick Start
+ [50 lines: minimum to get first screenshot]

+ ## Capabilities
+ - screenshot(options)
+ - click(x, y, button)
+ - type(text)
+ - evaluate(script)
+ - navigate(url)
+ - [etc.]

+ ## Workflows
+ Each workflow is a state machine + iteration loop:
+ - [screenshot-loop.md] — Judge + fix cycle (the core)
+ - [interaction-testing.md] — Test user actions
+ - [state-verification.md] — Test all page states
+ - [viewport-testing.md] — Mobile/tablet/desktop

  ## Phase 1–6
- [600 lines of detailed procedures]
+ [Consolidated reference, with workflows.md for details]
```

---

## Part 8: Comparison Matrix

```
┌─────────────────────────────────────────┬─────────────────┬─────────────┐
│ Aspect                                  │ vercel/agent    │ Our Skills  │
├─────────────────────────────────────────┼─────────────────┼─────────────┤
│ Organization                            │ By capability   │ By use case │
│                                         │ (platform)      │ (workflow)  │
├─────────────────────────────────────────┼─────────────────┼─────────────┤
│ Procedure documentation                 │ ❌ Weak         │ ✅ Strong   │
├─────────────────────────────────────────┼─────────────────┼─────────────┤
│ Anti-patterns & gotchas                 │ ❌ None         │ ✅ Yes      │
├─────────────────────────────────────────┼─────────────────┼─────────────┤
│ State machine thinking                  │ ❌ Implicit     │ ✅ Explicit │
├─────────────────────────────────────────┼─────────────────┼─────────────┤
│ Iteration loop guidance                 │ ❌ None         │ ✅ Yes      │
├─────────────────────────────────────────┼─────────────────┼─────────────┤
│ Domain variants                         │ ✅ Clear        │ ⚠️ Ad-hoc   │
├─────────────────────────────────────────┼─────────────────┼─────────────┤
│ Hierarchical organization               │ ✅ Clear        │ ⚠️ Flat     │
├─────────────────────────────────────────┼─────────────────┼─────────────┤
│ Prerequisite checklists                 │ ❌ None         │ ✅ Yes      │
├─────────────────────────────────────────┼─────────────────┼─────────────┤
│ Performance focus                       │ ✅ Native Rust  │ ⚠️ Not core │
├─────────────────────────────────────────┼─────────────────┼─────────────┤
│ Designed for code synthesis             │ ❌ No           │ ✅ Yes      │
└─────────────────────────────────────────┴─────────────────┴─────────────┘
```

---

## Part 9: Recommended Action Plan

### Phase 1: Reorganize Existing Skills (Low effort, high clarity)

1. **api-discovery**: Split into variants
   - `api-discovery/SKILL.md` (50 lines: overview)
   - `api-discovery/live-mode.md` (detailed, inherit from SKILL)
   - `api-discovery/batch-mode.md` (detailed, inherit from SKILL)

2. **visual-dev**: Add capability list
   - `visual-dev/capabilities.md` (new: tool reference)
   - `visual-dev/workflows.md` (new: use cases)
   - `visual-dev/SKILL.md` (refactored: leaner overview)

3. **All skills**: Add "Getting Unstuck" section
   - Common errors + fixes table

---

### Phase 2: Implement Domain Variants (Medium effort, enables generalization)

Create a parent skill for domain-specific workflows:

1. **api-client-builder/** (parent)
   - `SKILL.md` (overview: how to build API clients)
   - `capabilities.md` (tools: what Patchright can do)
   - `base-workflow.md` (generic: how to build any API client)

2. **api-client-builder/robinhood/** (domain variant)
   - Inherits base-workflow
   - Adds: header names, auth flow, endpoints to test

3. **api-client-builder/linkedin/** (domain variant)
   - Inherits base-workflow
   - Adds: header names, auth flow, endpoints to test

4. **api-client-builder/generic/** (template)
   - How to create variants for new domains

---

### Phase 3: Consolidate & Clean Up (Low effort, high maintainability)

- Remove duplication across skills
- Cross-link related skills
- Add glossary for common terms (state machine, interceptor, etc.)

---

## Conclusion

**vercel/agent-browser's strength**: Clear domain organization, pluggable capabilities.
**Our strength**: Procedural workflows, iteration strategies, gotchas.

**The hybrid approach**: Steal their organizational pattern + keep our procedural depth.

**Key change**: From flat skill list → hierarchical skill structure:

```
api-client-builder/            ← Parent (overview)
├─ capabilities.md             ← What tools exist
├─ base-workflow.md            ← Generic procedure
├─ robinhood/                  ← Variant: Robinhood-specific
├─ linkedin/                   ← Variant: LinkedIn-specific
└─ generic/                    ← Template: New domains
```

This way:
✅ New domains add ~10% new code (config + generated types)
✅ Claude loads the right skill variant automatically
✅ Procedural knowledge stays centralized (base-workflow.md)
✅ Domain knowledge is isolated (robinhood/, linkedin/)
✅ Patterns are reusable (getting-unstuck, capabilities, etc.)

---

**Status:** Ready to implement in Phase 1 (reorganization)
**Effort:** ~4 hours for existing skills
**ROI:** 30% reduction in skill complexity + 80% faster domain additions
