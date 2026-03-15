# Blog Style Guide: Complete Guide

Writing style for comprehensive technical reference guides. Inspired by [CSS-Tricks Guides](https://css-tricks.com/guides/).

---

## Core Principle

Be the page someone bookmarks. A complete guide covers *everything* about one topic — concept, syntax, every option, visuals, edge cases, and real-world use — so the reader never needs to look elsewhere.

---

## Opening

Open with the problem this thing solves, then show a quick working example before explaining anything.

Good:
> Positioning elements in a layout has always required workarounds — floats, clearfixes, absolute positioning hacks. Flexbox was designed to fix this. Here's the simplest possible example:
>
> ```css
> .container {
>   display: flex;
>   justify-content: center;
> }
> ```
>
> That centers every child element. Let's break down how it works and everything else flexbox can do.

Bad:
> Flexbox is a CSS layout module specified in the CSS Flexible Box Layout Module Level 1 specification. It was first introduced in...

Show the payoff first. Explain afterward. The reader should see the thing working within the first 30 seconds of reading.

---

## Titles

"A Complete Guide to [Topic]" or "[Topic] Guide." Literal, searchable, zero cleverness.

| Good | Bad |
|------|-----|
| A Complete Guide to the IPC Bridge | The Process Boundary |
| BullMQ Job Queue Guide | Queues and You |
| Docker Compose Reference | Seven Environments |
| Cooldown Filter Guide | The Signal Suppressor |

The title is a search query. Someone googling "css flexbox guide" should land on your page.

---

## Table of Contents

Every guide starts with a linked table of contents. The reader may want section 7, not section 1. Respect that.

```
## Table of Contents

- [Background](#background)
- [Basics & Terminology](#basics--terminology)
- [Properties for the Container](#container-properties)
  - [display](#display)
  - [flex-direction](#flex-direction)
  - [flex-wrap](#flex-wrap)
- [Properties for the Items](#item-properties)
- [Common Patterns](#common-patterns)
- [Browser Support](#browser-support)
```

The TOC is the guide's skeleton. Write it first — the structure *is* the content design.

---

## Structure

Two formats depending on the topic:

### Format A: Property Reference (for APIs, configs, options)

Group by parent concept, then document each option with a repeating template:

```
Background & Terminology
  ├── Container Properties
  │     ├── property-name
  │     │     ├── One-sentence purpose
  │     │     ├── Visual diagram
  │     │     ├── Code example
  │     │     ├── Values (bulleted, each explained)
  │     │     └── Notes / gotchas
  │     ├── next-property...
  ├── Item Properties
  │     └── ...
  └── Common Patterns / Use Cases
```

### Format B: Concept Guide (for approaches, techniques, workflows)

Build understanding progressively:

```
1. The problem (why this exists)
2. Quick working example
3. Core concept explanation
4. Syntax and options
5. Advanced mechanics
6. Real-world use cases
7. Common pitfalls
8. Browser support / compatibility
```

Most guides are Format A. Use Format B when the topic is a *technique* rather than an *API*.

---

## The Property Template

The signature CSS-Tricks move. Every property/option/config key gets the same treatment:

### 1. Name as heading

### 2. One-sentence purpose
> Defines the direction flex items are placed in the container.

### 3. Visual diagram
A diagram showing the before/after or the options side by side. Not decorative — the diagram *is* the explanation for visual concepts.

### 4. Code example
```css
.container {
  flex-direction: row | row-reverse | column | column-reverse;
}
```

Pipe-separated values in the code block to show all options at a glance. Then a realistic example below if needed.

### 5. Values list
Each value gets a bullet with a plain-language explanation:

- `row` (default): left to right in LTR; right to left in RTL
- `row-reverse`: right to left in LTR; left to right in RTL
- `column`: same as row but top to bottom
- `column-reverse`: same as row-reverse but bottom to top

### 6. Notes
Edge cases, browser quirks, or "this interacts with X" callouts:

> **Note:** `float`, `clear`, and `vertical-align` have no effect on flex items.

---

## Visuals & Diagrams

Diagrams are not optional. They are primary documentation.

Rules:
- **One diagram per concept** — if a property has 4 values, show all 4 visually
- **Label everything** — axes, directions, containers, items
- **Consistent style** — same colors, same container/item shapes throughout the guide
- **Place before the code** — the reader should understand the shape before seeing the syntax

For non-visual topics (job queues, API endpoints), use flow diagrams or architecture diagrams instead:

```
Job submitted
    │
    ▼
┌─────────┐     ┌──────────┐     ┌──────────┐
│  Queue   │────▶│  Worker  │────▶│ Complete  │
└─────────┘     └──────────┘     └──────────┘
    │                                  │
    ▼                                  ▼
  Failed ──▶ Retry (3x) ──▶ Dead Letter
```

---

## Code Examples

Code is the backbone. More code than prose is normal for a reference guide.

Rules:
- **Every concept gets a code block.** No exceptions. If you explain something in prose, also show it in code.
- **Syntax blocks** show all options with pipes: `value1 | value2 | value3`
- **Realistic blocks** show a real use case with practical class names
- **Interactive demos** (CodePen, embedded playground) where the concept is hard to understand from static code alone
- **Before/after** pairs when showing what a property changes
- **Comments in code** label the moving parts, don't narrate the obvious:

```typescript
// Container: manages the job lifecycle
const queue = new Queue('breadth-consensus', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,          // retry on failure
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 100, // keep last 100 for debugging
  },
});
```

---

## Tone

Friendly expert. You're writing documentation that doesn't feel like documentation.

- **"Let's" and "we"** — walk alongside the reader. "Let's look at how this works."
- **Direct and confident** — "This sets the direction" not "This can be used to set the direction."
- **Acknowledge complexity honestly** — "This part is counterintuitive. Here's why."
- **No apologies** — don't say "this is a bit complex" and then explain it poorly. Just explain it well.
- **Humor sparingly** — a parenthetical aside or a well-placed "Pretty bad!" when showing an anti-pattern. Never at the expense of clarity.

---

## Edge Cases & Gotchas

Weave them in where they occur, don't collect them at the bottom.

When documenting `property-x`, mention its gotcha right there:

> **Gotcha:** Setting `overflow: hidden` on the container will clip items that extend beyond the container boundary, even if `flex-wrap` is set.

Format as a bold label + explanation, inline with the property it affects. The reader should encounter the warning exactly when they need it.

---

## Cross-References

Link to related properties/concepts inline, not in a "See Also" section:

> The `align-items` property works on the cross axis. For main-axis alignment, see [`justify-content`](#justify-content).

The reader is already thinking about the related concept at this moment. Link it *now*, not later.

---

## "Common Patterns" Section

After the reference section, include a patterns section showing how properties combine for real tasks:

### Centering an Element
```css
.container {
  display: flex;
  justify-content: center;
  align-items: center;
}
```

### Holy Grail Layout
```css
/* ... */
```

Patterns are the reason people bookmarked the page. They came for the reference, they return for the recipes.

---

## Browser Support / Compatibility

For web content, include a support table or link to caniuse. For infrastructure content, note version requirements:

> **Requires:** Node 22+, Bun 1.3.5+, Redis 7+

For features with partial support, show the progressive enhancement path — what to do when the feature isn't available.

---

## Keeping Guides Updated

A guide is a living document. Include a last-updated date and revision notes:

> **Last updated:** February 2026. Added container query units section.

The guide's value comes from being current. A stale guide is worse than no guide — it teaches the wrong thing confidently.

---

## What Not To Write

- **Opinion pieces.** A guide documents what exists and how it works. Save "why you should use X" for a separate article.
- **Incomplete references.** Don't document 6 of 8 properties. Cover everything or don't call it "complete."
- **Prose without code.** Every explanation needs a corresponding code block.
- **Code without prose.** Every code block needs at least one sentence explaining what to notice.
- **Buried gotchas.** Don't make the reader discover edge cases by shipping broken code. Surface them at point of use.

---

## Checklist Before Publishing

- [ ] Does the title include the topic name plainly? (Searchable, not clever)
- [ ] Is there a linked table of contents?
- [ ] Does the opening show a working example within the first scroll?
- [ ] Does every property/option follow the same template?
- [ ] Is there a visual diagram for every concept that has spatial or relational meaning?
- [ ] Does every code block have prose before or after it?
- [ ] Are edge cases documented inline, not collected at the end?
- [ ] Is there a "Common Patterns" section with copy-paste recipes?
- [ ] Are related concepts cross-linked at point of relevance?
- [ ] Is there a last-updated date?
- [ ] Could someone use this guide as their only reference for this topic?
