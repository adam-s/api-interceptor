# Blog Style Guide

Writing style for Volatio technical blog posts. Inspired by [overreacted.io](https://overreacted.io/).

---

## Core Principle

Every post is a small story that reveals a bigger principle. Not documentation — narrative.

---

## Opening

Drop the reader into a moment. Never open with "In this post I will explain..."

Good:
> I used to think one docker-compose.yml was enough.

> Last Tuesday the E2E tests passed locally and failed in CI. Same code, same database version, different result.

> Our Python service isn't in the pnpm workspace. This confused me for weeks.

Bad:
> In this article, we'll explore our Docker setup and discuss the tradeoffs of multiple compose files.

The first sentence should be personal experience or a surprising observation. The reader should feel like they walked into the middle of something.

---

## Titles

Name the insight, not the topic.

| Instead of | Write |
|------------|-------|
| Our Docker Configuration | Seven Compose Files |
| Python in a Node Monorepo | The Process Boundary |
| How We Set Up CI | The Mirror Script |
| Testing Strategy Overview | Three Ports Apart |
| Monorepo Dependency Management | The Phantom Import |

A good title makes someone curious without telling them what they'll learn.

---

## Structure

No outline. A journey.

```
Concrete situation
  → "But wait, something is off"
    → Dig deeper
      → The surprising insight
        → What this changes about how you think
```

Use horizontal rules (`---`) sparingly to mark major shifts. Avoid `## Section Headers` breaking up the flow — the post should read linearly, each paragraph depending on the one before it.

If someone can skip to a section and understand it in isolation, the post isn't narrative enough.

---

## Paragraphs

Vary the length constantly.

A long paragraph develops a concept over three or four sentences, building the reasoning step by step, layering one observation on top of another until a conclusion lands naturally at the end.

Then a one-liner for impact.

Then back to medium length for the next thought. Maybe two sentences. Enough to pivot.

This rhythm is the voice. It reads like thinking out loud — not like documentation.

---

## Tone

Someone smart talking to someone equally smart over coffee.

- Direct statements, not hedging. "This breaks" not "I think this might potentially cause issues."
- Personality in the margins. "Ah well!" or "That's the whole trick" or "This part hurt."
- Admit when something confused you. Admit when you got it wrong first.
- Never lecture. Never "As we all know..." or "It goes without saying..."

Authority comes from specificity and honesty, not from formality.

---

## Code

90% prose, 10% code.

When code appears:

- **Short.** 5-10 lines per block. If it's longer, trim to the interesting part.
- **Progressive.** Each snippet builds on the last. Don't show the final solution first.
- **Surrounded.** Never two code blocks back-to-back. Always prose between them explaining what changed and why.

Code illustrates the idea. The idea is never "here's the code."

Inline code (backticks) for names and values within sentences. Block code only when the structure matters.

---

## Ending

No summary. No "In conclusion, we learned..."

Good endings:
- A candid admission. ("I still don't love this part.")
- An invitation. ("If this got you curious, try breaking the ports yourself.")
- A quiet observation that reframes the whole post.
- Trailing off naturally, like a conversation ending.

The reader should close the tab thinking about the idea, not about the post.

---

## What Not To Write

- **Config dumps.** Don't paste a full `docker-compose.yml`. Excerpt the 5 interesting lines.
- **Installation guides.** The reader already has pnpm installed.
- **Comprehensive overviews.** One idea per post. If you have three ideas, write three posts.
- **Changelog-style updates.** "We added X, Y, and Z" is a release note, not a blog post.

---

## Checklist Before Publishing

- [ ] Could I explain the core idea in one sentence to a friend?
- [ ] Does the opening drop you into a specific moment?
- [ ] Does the title name the insight, not the topic?
- [ ] Is paragraph length varied throughout?
- [ ] Is every code block under 10 lines?
- [ ] Does the ending avoid summarizing?
- [ ] Would I want to read this if someone else wrote it?
