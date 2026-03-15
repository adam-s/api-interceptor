# Blog Style Guide: Editorial Essay

Writing style for persuasive technical essays. Inspired by [A List Apart](https://alistapart.com/).

---

## Core Principle

Make an argument. Every article has a thesis — a belief about how something should be done — and builds the case through analogy, evidence, and real-world example.

---

## Opening

Open with a frame, not the topic. Ground the reader in something outside the immediate subject — history, philosophy, another discipline — then pivot to why it matters here.

Good:
> The Bauhaus architects believed that constraints produce better work than freedom does. Seventy years later, the same principle explains why our most rigid Docker setup produces the most reliable deploys.

> Television's first broadcasts were radio plays filmed with a stationary camera. We do the same thing when we treat a monorepo like a collection of independent repos that happen to share a folder.

Bad:
> In this article I'll explain our CI/CD pipeline.

> Docker is a containerization tool that...

The opening paragraph establishes an intellectual frame. The second paragraph pivots to the real subject. The third states the thesis.

---

## Titles

A List Apart titles are declarative or provocative. They name a position, not a topic.

| Instead of | Write |
|------------|-------|
| Our Testing Strategy | Three Ports Apart |
| How We Use Docker | Environments Are Not Configuration |
| Monorepo Dependency Management | The Phantom Import |
| CI/CD Pipeline Overview | The Mirror Test |
| Python and Node Integration | The Process Boundary |

Title case. Ampersand instead of "and." No terminal punctuation unless it's a question.

---

## Thesis

Every article argues for something. State it clearly by the third paragraph.

> Design systems aren't component libraries — they're living languages.

> The pre-commit hook isn't quality assurance. It's a contract between your present self and your future self.

> Isolation isn't about preventing interference. It's about making interference visible.

The rest of the article exists to support this claim. If you can't state the thesis in one sentence, the article isn't focused enough.

---

## Structure

Sections with clear headings, organized as an argument:

```
Frame         — analogy, history, or outside discipline
Pivot         — why this matters in our context
Thesis        — the one-sentence claim
Evidence 1    — real example with specifics
Evidence 2    — second example, escalating complexity
Counterpoint  — address the obvious objection
Implication   — what changes if you accept the thesis
Call to close — return to the opening frame
```

Use `h2` for major sections, `h3` for subsections. A reader scanning headings alone should follow the argument's arc.

---

## Paragraphs

Alternate between short and long. Short paragraphs (2-3 sentences) make assertions. Long paragraphs (5-7 sentences) develop evidence. This rhythm creates momentum — claim, then proof, then next claim.

A short paragraph can be a single sentence for emphasis.

But it shouldn't happen often enough to feel like a trick.

---

## Tone

Editorial: authoritative but inviting. You're making a case to peers, not lecturing students and not chatting over coffee.

- **First person is fine** but earned through specificity. "I learned this at Booking.com" carries weight. "I think this is cool" doesn't.
- **Contractions are fine.** The tone is professional, not formal.
- **Admit uncertainty** where it exists. "This worked for us; your constraints may differ" is stronger than false universality.
- **Parenthetical personality** in small doses. "(sorry, Dieter)" or "a feature salad, you might say" — one per section, not one per paragraph.
- **Direct address sparingly.** "You" pulls the reader in but overuse feels like a sales pitch.

---

## Analogies & Metaphors

The signature A List Apart move. A strong analogy does three things:

1. **Frames** the problem in terms the reader already understands
2. **Carries** through the article (not a one-off comparison)
3. **Illuminates** rather than decorates

Good:
> Design systems are living languages. They have grammar (core principles), vocabulary (components), and dialects (contextual adaptations). A rigid system is a dead language — perfectly consistent and completely unusable.

This analogy organizes every section of the article. It's structural, not ornamental.

Bad:
> Our CI pipeline is like a factory assembly line.

One-sentence analogies that don't recur are decoration. Either develop the metaphor across the piece or cut it.

---

## Evidence & Examples

Concrete, named, specific. Not hypothetical.

Good:
> At Shopify, warehouse pickers work in dim aisles wearing thick gloves. The standard 44px touch target became a 90px target. The standard white background became a dark surface to reduce screen glare. Same design system, different dialect.

Bad:
> Imagine a user who needs larger buttons. You might want to adjust the touch targets.

Name the company, the constraint, the number. Specificity is credibility.

---

## Code

Less prominent than in tutorial-style writing. Code supports the argument — it doesn't drive it.

- Code blocks are short (5-15 lines) and appear after the concept is explained in prose
- Code demonstrates the *point*, not the full implementation
- Always introduced with context: what problem this solves, not just what it does
- CSS, HTML, and config examples are more common than application logic

```css
/* The media query doesn't just adapt the layout —
   it changes the relationship between elements */
@media (max-width: 600px) {
  .sidebar { display: none; }
  .content { width: 100%; }
}
```

The query isn't about responsive CSS. It's about the principle that removing an element can be better than shrinking it.

---

## Structural Elements

A List Apart articles use these consistently:

**Section headings** — Sentence case. Guide the argument, not just label the content. "Good Is Not a Design Outcome" rather than "Design Outcomes."

**Blockquotes** — For cited material, epigraphs, or key principles set apart from prose:

> The best of man is like water,
> Which benefits all things, and does not compete with them.

**Bold** — For key terms on first use and for emphasis within arguments. Not for every important word.

**Figures with captions** — Images appear after the concept they illustrate, with functional captions that describe what to notice, not just what's shown.

**Lists** — Sparingly. For frameworks, checklists, or when items are genuinely parallel. Never for prose that should be paragraphs.

---

## References & Attribution

Cite by weaving into prose, not by footnoting.

Good:
> John Allsopp argued in "A Dao of Web Design" that control is a function of the printed page's limitations. Twenty-five years later, we're still learning the lesson.

Bad:
> Control is a limitation of print [1].
> [1] Allsopp, J. "A Dao of Web Design." A List Apart, 2000.

Credibility comes from naming sources naturally. Link the title. No bibliography at the bottom.

---

## Closing

Return to the opening frame. The essay should feel circular — the analogy or outside reference from the introduction reappears, now carrying the weight of everything argued in between.

Good:
> The Bauhaus architects were right: constraints produce better work. Our seven compose files aren't complexity — they're the constraints that make each environment honest about what it needs.

Bad:
> In conclusion, we've discussed our Docker setup and its benefits.

The closing doesn't summarize. It resolves. The reader should feel the argument click shut.

---

## House Style (adapted from A List Apart)

| Rule | Example |
|------|---------|
| Title case for titles | "The Process Boundary" |
| Sentence case for headings | "Separating fidelity from quality" |
| Serial comma | "API, dashboard, and worker" |
| Em dash without spaces | "isolation—not configuration—is the goal" |
| Spell out zero through nine | "three workers" but "12 containers" |
| Chicago Manual for punctuation | Periods inside quotes: "successful." |
| Singular "they" | "When a developer pushes, they trigger..." |
| `<abbr>` for acronyms on first use | CI/CD, IPC, ETF |

---

## What Not To Write

- **Tutorials.** A List Apart publishes arguments, not instructions. "How to set up Docker" is a tutorial. "Why seven compose files is better than one" is an essay.
- **Listicles.** "10 Tips for Better CI" belongs elsewhere. Develop one idea fully.
- **Neutral surveys.** "There are several approaches to testing." Pick one. Defend it.
- **Jargon without framing.** Don't assume the reader shares your vocabulary. Define terms through context, not glossaries.

---

## Checklist Before Publishing

- [ ] Can I state the thesis in one sentence?
- [ ] Does the opening use a frame from outside the immediate topic?
- [ ] Does the closing return to that frame?
- [ ] Is every claim supported by a specific, named example?
- [ ] Does the central analogy carry through more than one section?
- [ ] Would a reader scanning only the headings follow the argument?
- [ ] Is there exactly one idea, fully developed?
- [ ] Would I be comfortable defending this position in a room of peers?
