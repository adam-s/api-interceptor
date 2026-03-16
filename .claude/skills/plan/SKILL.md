---
name: plan
description: Use at the start of ANY coding task before writing code. Guides you through explore → design → plan file → user approval. ALWAYS invoke before implementing. Use when the user gives you a task that involves creating files, modifying code, or running commands.
---

# Planning Phase

Run this before any implementation. Do not write code until `ExitPlanMode` is approved.

## Phase 1: Explore (parallel agents)

Launch 1–3 Explore agents to understand the codebase. Focus on:

- Files directly related to the request
- Existing patterns and utilities that can be reused
- What already exists vs what needs to be created

Use the minimum number of agents needed. For a narrow task (one known file), 1 agent is enough.

## Phase 2: Design

Launch 1 Plan agent with the exploration results as context. Ask it to:

- Identify the simplest approach
- List every file that will change
- Note existing functions/utilities to reuse (with file paths)
- Describe how to verify the result works

## Phase 3: Write the plan file

Write to the plan file path given in the plan mode system message. The plan must include:

- **Context** — why this change is needed, what problem it solves
- **Approach** — the implementation strategy (one recommended approach, not alternatives)
- **Files to change** — table of file paths and what changes in each
- **Reuse** — existing utilities/functions to call instead of reimplementing
- **Verification** — exact commands or steps to confirm it works end-to-end

Keep the plan concise enough to scan in 30 seconds but detailed enough to execute without questions.

## Phase 4: Exit

Call `ExitPlanMode`. Do not summarize the plan in text — the user will read the plan file.

---

## What makes a good plan

- Concrete file paths, not vague descriptions
- Specific function names to reuse, not general patterns
- A verification step that produces observable output (a curl response, a screenshot, a passing test)
- No over-engineering: the minimum change that solves the problem

## What makes a bad plan

- "We will add error handling" without saying where
- No verification step
- Proposes new abstractions when existing ones could be used
- Domain-specific knowledge hardcoded into generic utilities
