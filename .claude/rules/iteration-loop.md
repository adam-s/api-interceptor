---
description: Autonomous iteration mode — the build loop, verification gates, server startup, and branch management
paths:
  - "domains/**"
  - "prompts/**"
  - "apps/web/src/app/(dashboard)/**"
---

# Autonomous Iteration Mode

The user has granted full autonomous operation. You may:

- Commit on `base` without asking (run `./scripts/ci-local.sh` first — must pass)
- Create and switch between test branches without asking
- Make architectural and implementation decisions without asking
- Keep iterating until the prompt is fully solved (all phases verified)
- **Skip `EnterPlanMode`** — don't wait for human approval to start coding. This does NOT mean skip self-verification gates in the skills. Those gates are mandatory checkpoints you enforce on yourself.
- **Skipping plan mode does NOT mean skipping the Prompt Compliance Matrix.** The matrix in Step 5 is a self-verification gate, not a human review gate. You produce it for yourself as proof that you checked every requirement. Autonomous mode means you don't wait for human approval — it does NOT mean you skip proving to yourself that the prompt is fully solved.
- **Skipping plan mode does NOT mean skipping observation.** The api-discovery skill's Phase 1 (Observe) is a MANDATORY gate — connect a browser via WebSocket, capture traffic, see what the site sends. Guessing DOM structure without observation is the #1 failure mode. If extracted data doesn't match the rendered DOM (wrong names, category labels instead of real names, prices off by 100x), see "Decoding Encoded API Responses" in api-discovery/SKILL.md.

**You MUST update the "Current Iteration State" block below before every `git checkout`.** This is how you preserve state across context resets and branch switches. When you resume a session, read this block first.

## The Iteration Loop

```text
FOR each prompt:
  0. READ THE PROMPT + OBSERVE
     a. Read the prompt file. Extract every requirement into a numbered list:
        features, views, interactions, data sources, layout specs, behaviors.
        Paste this list into the conversation as "REQUIREMENTS EXTRACTED FROM PROMPT".
        This list is your contract. You are done when every item has evidence, not before.
     b. Connect browser via WebSocket
        (ws://localhost:PORT/browser/stream?profile=<domain>&url=<target>).
        Capture traffic. Screenshot the page with visual-dev skill to see ground truth.
        ⚠️  The auto-start browser has NO CDP traffic capture. Only WS-connected browsers
        capture traffic. If you skip this step, /browser/traffic returns empty and you are guessing.
  1. Build API routes → curl each route → paste response proving real data → ONLY THEN proceed to UI
     ⚠️  Classification is per-ENDPOINT, not per-site. Even a SINGLE PAGE can be hybrid:
     the shell and metadata load via SSR while the primary data (prices, inventory,
     listings) loads via XHR after the initial HTML. A page showing "Loading..." for its
     main content is NOT SSR for that content. Verify EACH data type independently
     before writing extraction code. See api-discovery SKILL.md Phase 2 gate.
     CHECKPOINT: re-read the requirements list from Step 0a. Does every data requirement
     have a working route? If not, build the missing routes before touching UI.
  2. Build UI component → screenshot it → describe what you see → fix if wrong → re-screenshot → repeat until correct
     CHECKPOINT: re-read the requirements list from Step 0a. Does every view and layout
     requirement appear in the UI? If not, build missing views before wiring interactions.
  3. Wire interactions → click each button with Patchright → verify the response → fix if broken
  4. Full QA pass → screenshot every state (empty, loading, populated, error, detail, mobile 375px)
     → walk every user journey end-to-end → fix everything → re-screenshot → zero issues = done
  5. PROMPT COMPLIANCE MATRIX — produce the matrix (see prompt-compliance rule)
     in the conversation. One row per requirement from Step 0a. Fill in Status and Evidence.
     ANY FAIL row = go back to the step that would fix it. Re-do the matrix after fixing.
     Loop until all rows are PASS with specific evidence.
  6. Commit only after Step 5 matrix shows ALL PASS with zero FAIL rows.
     If no matrix exists in the conversation above, STOP — you skipped Step 5.
```

**The prompt is fully solved when:** (1) every feature mentioned in the prompt is implemented, (2) every verification gate passes, and (3) the Definition of Done checklist passes.

## The Rule That Makes This Work

**Verification output is required input for the next step. You cannot skip it because the next step needs it.**

- You cannot build UI until you have curl output proving the API returns real data
- You cannot add the next component until you have a screenshot proving the current component renders correctly
- You cannot commit until you have screenshots of every state showing zero visual/functional issues
- You cannot call a button "done" until you have Patchright output showing you clicked it and it responded correctly

**If something is wrong — use debug-logs skill immediately.** Don't guess, observe. The runtime tells you exactly what's wrong.

**If something looks wrong — use visual-dev skill immediately.** Screenshot it, read it, describe the problem, fix it, re-screenshot. Repeat until zero issues.

## Server Startup

```bash
# Kill any existing servers first
lsof -ti:3001 | xargs kill -9 2>/dev/null; lsof -ti:3000 | xargs kill -9 2>/dev/null
# Start API (port 3001)
pnpm --filter api dev > /tmp/api-server.log 2>&1 &
# Start web (port 3000)
pnpm --filter web dev > /tmp/web-server.log 2>&1 &
# Wait and verify
sleep 6 && curl -s http://localhost:3001/health && curl -s http://localhost:3000 | head -5
```

Tail logs: `tail -f /tmp/api-server.log` or `tail -f /tmp/web-server.log`

## Returning to Base After a Test Iteration

1. On test branch: commit domain work, append all discoveries to `memory/base-fixes-needed.md`
2. `git checkout base` -- strip domain artifacts (`rm -rf domains/<name>/`, revert `register-domains.ts`, `nav-main.tsx`, `pnpm-lock.yaml`, browser profiles, screenshots)
3. Apply `memory/base-fixes-needed.md` to: skills, CLAUDE.md, ROADMAP.md, DEVELOPER_PROMPTS.md
4. Clear the file, run `./scripts/ci-local.sh`, commit
5. `git branch -D test/<id>-v<n>` -- delete the old test branch (it has no lasting value)
6. `git checkout -b test/<id>-v<n+1>` -- inherits all learnings

## Current Iteration State

Iteration state lives **outside git** in the project memory system so it never pollutes `base`:

```
~/.claude/projects/-Users-adamsohn-Projects-api-interceptor/memory/iteration_state.md
```

**Rules:**
- **Before every `git checkout`:** update `iteration_state.md` with branch, phase, and notes.
- **When resuming a session:** read `iteration_state.md` first — it is the source of truth.
- **Before starting a new iteration from `base`:** check if `iteration_state.md` exists. If it contains stale state from a finished iteration, delete it. A clean start means no leftover state.
- **After returning to `base` and committing fixes:** delete `iteration_state.md`. By this point all generalized learnings have already flowed through `base-fixes-needed.md` into committed skill files. The iteration state is purely navigational ("where am I, what phase") and has no value after the iteration ends.
- **Never write iteration-specific content into CLAUDE.md.** CLAUDE.md is permanent on `base`; iteration state is ephemeral in memory.
