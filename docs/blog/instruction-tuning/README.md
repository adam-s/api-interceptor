# Instruction Tuning: Teaching AI Agents Through Failure

A series about what happens when you launch AI agents on real websites and iteratively fix the instructions they read — 46 iterations, 34 instruction changes, and a collection of surprises about how language models interpret rules.

---

1. **[Forty-Six Iterations](01-the-loop.md)** — Why a decision tree fails and a linear pipeline works. The shape of instructions matters more than the content.

2. **[The Word "Should"](02-soft-language.md)** — Eight agents skipped pagination because the rule said "should check." How obligation language controls agent behavior, and why mandatory artifacts beat vague instructions.

3. **[The Model Already Knew](03-preflight.md)** — Agents spent 23 tool calls discovering what was already in the weights. PRE-FLIGHT saved 25 calls per run by letting the model say what it knows before opening the browser.

4. **[One Soft Word](04-consistency.md)** — Fixing one file out of six made things worse. When the same concept lives in multiple files, a single soft mention anywhere undermines a hard gate everywhere else.

5. **[299 Lines to 153](05-shorter-is-louder.md)** — Deleting half the instruction file improved compliance. Less noise, fewer escape hatches, higher signal-to-noise ratio per line.

6. **[Five Commits to Build a Wall](06-worktree-walls.md)** — Four failed approaches to agent isolation before finding one that works. The difference between a wall and a sign.

7. **[The Most Common Pattern](07-anchoring.md)** — Calling a transport "most common" made agents anchor on it. Listing specific endpoints made them stop looking. Helpful framing that narrowed the search space.

8. **[When Do You Stop](08-convergence.md)** — Iteration 43 looked converged. Iteration 44 doubled transport coverage. The scorecard measured compliance, not coverage.
