# Blog Style Guide: Textbook-Narrative

Writing style for technical deep-dives. Inspired by [dmitrysoshnikov.com](https://dmitrysoshnikov.com/).

---

## Core Principle

Teach one concept completely. Build a mental model the reader can carry away — definitions, diagrams, code, and all.

---

## Opening

State the scope and the audience. The reader should know immediately what they'll understand by the end.

Good:
> This article covers how the breadth consensus pipeline transforms 225 raw divergence signals into 6 ETF positions. The intended audience is someone who already understands what options flow data is.

> In this chapter we look at how the Python worker communicates with the Node.js API over IPC. We'll build the bridge from scratch.

The opening is a contract: here's what you'll know when you finish reading.

---

## Titles

Name the mechanism. Formal, specific, unambiguous.

| Instead of | Write |
|------------|-------|
| How We Handle Signals | The Signal Pipeline |
| Our Docker Setup | Container Environments |
| Python and Node Talking | IPC via JSON-RPC |
| Making Things Fast | The Cooldown Cache |
| What We Learned About Testing | Parity Verification |

The title should read like a chapter heading in a technical book.

---

## Numbered Definitions

The signature pattern. Introduce key terms with numbered, bold definitions set apart from the surrounding prose.

> **Def. 1: Breadth Ratio:** The proportion of long signals in the top-50 divergence signals for a given trading day, after cooldown filtering. A ratio above the threshold produces a long position; below produces short.

> **Def. 2: Cooldown:** A stateful filter that suppresses signals from a cluster for N days after a losing trade. Evaluated with one-day delay to avoid look-ahead bias.

Rules:
- One definition per concept. Don't bundle two ideas into one definition.
- The definition must be self-contained — a reader should understand it without reading the surrounding paragraph.
- Place the definition where the concept first matters, not in a glossary at the top.
- Number them sequentially through the entire article.

---

## Note Callouts

Use **Note:** callouts for supplementary information that would break the flow if inline.

> **Note:** The cooldown cache is seeded from batch computation at 2024-12-31. If you regenerate signals with different parameters, the cache must be regenerated too.

> **Note:** This is the same mechanism described in ECMA-262 section 8.1, adapted here for our domain.

Notes are parenthetical — important but skippable. A reader who ignores every Note should still follow the main argument.

---

## Structure

Use explicit section headings. The article is a reference, not a mystery — the reader should be able to navigate by scanning headings alone.

```
1. Introduction (scope + audience)
2. Section per concept
   - Definition
   - Prose explanation
   - Code example
   - Diagram (if applicable)
   - Notes
3. Conclusion (what was covered, where to go next)
```

Each section is self-sufficient. A reader can jump to section 5 and understand it without reading sections 1-4, because all terms are defined where they appear.

---

## Paragraphs

Moderate and even. 3-5 sentences per paragraph. Each paragraph makes one point.

Unlike conversational writing, don't vary paragraph length for rhythm. Consistency signals to the reader that every paragraph carries equal weight. This is a textbook, not a story.

Short paragraphs are for definitions and notes. Everything else has substance.

---

## Tone

An experienced teacher explaining to a motivated student. Precise but not cold.

- Use "we" when walking through a process together. "We first filter the signals, then sort by absolute divergence."
- State facts directly. "The bridge uses JSON-RPC over stdin/stdout." Not "I decided to use" or "You might want to try."
- Technical terms are introduced once with a definition, then used freely.
- No jokes, no asides, no personality flourishes. Clarity is the personality.

The authority comes from completeness — every term defined, every step explained, every edge case noted.

---

## Code

50% prose, 50% code. The code is not illustration — it is the content.

Rules:
- Code blocks are substantial. 10-30 lines. Enough to be a real implementation, not a sketch.
- Every code block is preceded by prose explaining what it does and why.
- Every code block is followed by prose explaining what to notice.
- Comments inside code are pedagogical: they label the parts, not narrate the obvious.
- Progressive complexity: first show the simple case, then add the real-world complication.

```python
# Simple case: breadth ratio from signals
long_count = sum(1 for s in signals if s.direction == 'long')
ratio = long_count / len(signals)
```

The ratio alone tells us the market's directional bias. But raw signals include noise from recently-failed clusters. We need the cooldown filter first.

```python
# With cooldown: filter before counting
filtered = [s for s in signals if not cooldown.is_suppressed(s.cluster_id)]
top_50 = sorted(filtered, key=lambda s: abs(s.divergence), reverse=True)[:50]
long_count = sum(1 for s in top_50 if s.direction == 'long')
ratio = long_count / len(top_50)
```

Notice that cooldown is checked before ranking. A suppressed signal never competes for the top 50, even if its divergence is large.

---

## Diagrams

Use diagrams for anything with flow, hierarchy, or state transitions. Ascii art or images — both work.

```
225 symbols
    │
    ▼
[ Cooldown Filter ] ──── suppressed clusters removed
    │
    ▼
  Top 50 by |divergence|
    │
    ▼
[ Breadth Ratio ] ──── long_count / 50
    │
    ▼
  Position Decision ──── long if ratio > t1, short if ratio < (1 - t1)
    │
    ▼
[ Tier Assignment ] ──── t1 / t2 / t3 → 1x / 2x / 3x leverage
    │
    ▼
  6 ETF Family Trades
```

Place diagrams after the prose that introduces the concept, before the code that implements it. The reader should see the shape of the system before diving into implementation.

---

## Homework and Extensions

End sections or the article with explicit exercises or open questions.

> **Exercise:** Modify the cooldown filter to use a variable decay window based on cluster volatility instead of a fixed N-day suppression.

> **Further reading:** The delayed P&L evaluation pattern used here is described in detail in the v4 research pipeline documentation.

This signals that the article is a starting point, not the final word. It also tells the reader which parts are foundational (the article) and which parts are exploratory (the exercise).

---

## Ending

Summarize what was covered and point forward. The opposite of trailing off.

Good:
> In this article we covered the three stages of the breadth pipeline: cooldown filtering, ratio computation, and tiered position assignment. The complete implementation lives in `services/breadth-consensus/app/`. The next article covers how the Python worker communicates these results to the TypeScript API over IPC.

The reader should close the tab knowing exactly what they learned and where to go next.

---

## What Not To Write

- **Anecdotes.** No "last Tuesday I was debugging..." — state the problem directly.
- **Opinion without definition.** Don't say "this is better" without defining the metric.
- **Code without explanation.** Every block needs a before (what it does) and after (what to notice).
- **Incomplete mental models.** If you introduce a concept, define it. If you reference a system, diagram it.

---

## Checklist Before Publishing

- [ ] Does the opening state the scope and intended audience?
- [ ] Is every technical term introduced with a numbered definition?
- [ ] Does every code block have prose before and after it?
- [ ] Can a reader navigate by section headings alone?
- [ ] Are diagrams included for any flow, hierarchy, or state machine?
- [ ] Does the ending summarize and point forward?
- [ ] Could this article serve as a reference someone bookmarks and returns to?
