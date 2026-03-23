# Iteration Log

Changes made by the orchestrator during overnight runs.
User reviews this in the morning and promotes good changes to .claude/.

## Format

```
### Iter N — [timestamp]
**File:** docs/temp/[file].md
**Change:** [what was changed]
**Reason:** [what agent failure prompted this]
**Evidence:** [screenshot path or agent output]
```

---

### Iter 1 — 2026-03-23 00:20
**Result:** 67 calls, 20 screenshots, all views working
**Gap:** Agent didn't verify download completed. Downloads page showed error (yt-dlp not installed).
**Fix:** docs/temp/dashboard-agent.md — added "Verify async actions to END state"
**Code fix:** Installed yt-dlp

### Iter 3 — 2026-03-23 01:30
**Result:** 88 calls, 11 screenshots, 7 component files from monolith
**Gap 1:** Iter1 produced 1073-line monolith. Explicit split mandate in prompt → 7 clean files.
**Gap 2:** `@interceptor/shared` DEBUG import breaks in browser (Node.js deps).
**Fix:** docs/temp/dashboard-agent.md — added Component Architecture + Browser-Safe Imports sections
**Code fix needed:** Browser-safe DEBUG export

### Iter 4 — 2026-03-23 02:00
**Result:** 68 calls, 9 screenshots, 18 edits. Design review + polish only.
**Process:** Compared each view to template site screenshots, identified layout/typography/spacing differences, fixed top 3 per view.
**Finding:** Design review works well as a separate iteration from build. Builder builds, reviewer polishes. Separation of concerns.
**Instruction gap:** docs/temp/ doesn't specify the design review process clearly enough — agent needed it in the prompt, not just in the skill file.

### Iter 5 — 2026-03-23 forum dashboard
**Result:** 178+ calls, 9 component files, 1537 total lines
**Gap 1:** Thread component is 344 lines — violates <200 mandate. Recursive comment tree naturally grows big. Instruction doesn't cover splitting recursive components into separate files.
**Gap 2:** Agent spent 70+ turns on biome lint fixes (manually adding biome-ignore comments one at a time). Should run `pnpm biome check --write --unsafe` first, then only manually fix what auto-fix can't.
**Fix applied:** docs/temp/dashboard-builder.md — added "recursive components: extract the recursive item as a separate component file" and "run biome auto-fix before manual lint cleanup"

### Pending promotion to .claude/
1. Component split mandate (<200 lines per view)
2. Browser-safe imports warning
3. Branch safety check
4. Async END state verification
5. Browser-safe DEBUG function (code fix)
6. Design review as separate iteration from build
7. Recursive component extraction rule (from iter5)
8. Biome auto-fix before manual lint cleanup (from iter5)
