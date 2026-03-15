# Editing Lessons: What We Changed and Why

Notes from editing "We Chose Bun for Everything. Here's What Happened." These patterns apply to any technical blog post.

---

## Cut the specifics that don't matter

The first draft opened with "I started this project on a Friday in November 2025. Fresh repo, clean slate, a 2,000-line architecture document written before a single line of code."

Friday doesn't matter. November doesn't matter. 2,000 lines doesn't matter. These feel like texture but they're just noise. The reader doesn't care when or how big the planning doc was. They care about the stack and the decision.

Final version: "I started a full-stack monorepo late last year."

**Rule: If removing a detail doesn't change the reader's understanding, remove it.**

---

## Say what happened to you, not what people generally do

First draft: "Most Node developers keep a single `.env` file at the project root."

Is that true? Maybe. But it's an unverifiable generalization that invites argument. Someone will comment "well actually I use per-package env files" and now the thread is about `.env` conventions instead of Bun.

Final version: "My `.env` file lives at the project root."

Nobody can argue with that. And the reader follows the same cause-and-effect chain either way: file is here, Bun looks there, variables vanish.

**Rule: "My setup does X" is stronger than "most people do X." First person experience over third person generalizations.**

---

## Don't stack sentence fragments for drama

First draft: "Then production auth broke. 401 errors on every request. Wrong cookie name. Every authenticated request rejected."

This is an AI pattern. Three short fragments that all say the same thing, piled up for dramatic effect. It reads like a thriller trailer, not a person explaining what happened.

Final version: "Then the production API started rejecting every authenticated request with 401."

One sentence. Says exactly what happened. The drama is in the situation, not the punctuation.

**Rule: If three sentences say the same thing, keep one.**

---

## Explain the mechanism, not just the symptom

First draft said Bun "inlined `process.env.NODE_ENV` at build time" and left it at that. But a reader who hasn't used Bun's bundler doesn't know why inlining is surprising or what it means practically.

Final version walks through the full chain:
1. In Node, `process.env` is a runtime lookup
2. Bun's bundler replaces it with the literal value at build time
3. If the variable isn't set, Bun writes `'development'` as a hardcoded string
4. NextAuth uses `NODE_ENV` to pick cookie prefixes
5. Wrong prefix means cookies don't match
6. Every login fails

And then the kicker: "In Node you'd never think to do this." That tells the reader this wasn't a missed configuration step, it was a design choice that violated a reasonable expectation.

**Rule: Setup, mechanism, consequence. The reader should understand why this surprised you, not just that it did.**

---

## Drop claims you can't defend

The first draft included a Docker healthcheck that became a fork bomb. Good story. But `node -e "require('./run.js')"` would do the same thing. Any runtime executes side effects on import. This was a bad healthcheck, not a Bun bug.

Including it alongside real Bun bugs — workspace resolution, env inlining, frozen lockfile drift — weakens the argument. If a reader catches one invalid example, they question the rest.

Final version: cut entirely from the narrative.

**Rule: Every example in an argument has to survive the strongest counterargument. If you wouldn't defend it in front of the Bun team, don't include it.**

---

## References are load-bearing

If you claim Bun has a bug, link the GitHub issue. If you say the community recommends a workaround, link the discussion. Not as footnotes at the bottom — woven into the prose where the claim is made.

The post links to:
- [Docker workspace discussion #12763](https://github.com/oven-sh/bun/discussions/12763)
- [`.env` resolution #11190](https://github.com/oven-sh/bun/issues/11190)
- [`process.env` inlining #11191](https://github.com/oven-sh/bun/issues/11191)
- [`--hot` reload #26036](https://github.com/oven-sh/bun/issues/26036)
- [Tree-shaking externals #16980](https://github.com/oven-sh/bun/issues/16980)
- [WebSocket CPU #23536](https://github.com/oven-sh/bun/issues/23536)
- [`turbo prune` workaround discussion #7456](https://github.com/vercel/turborepo/discussions/7456)

A reader who doubts any claim can verify it in one click. This is what separates an experience report from a rant.

**Rule: Unlinked claims are opinions. Linked claims are evidence.**

---

## Fairness belongs in one place

The first draft sprinkled "credit where it's due" and "this was eventually fixed" throughout the narrative. The env inlining fix was mentioned three times: once in the story, once in the table, and once in the closing section.

The story section should just tell what happened. The table shows the current status. The closing section acknowledges Bun's trajectory. Three different jobs, three different places.

When you soften a criticism the moment you make it, the reader doesn't trust either the criticism or the softening.

**Rule: Tell the story honestly in Act 2. Be fair in Act 3. Don't mix them.**

---

## The three-act test

Read the piece and ask:

- **Act 1 (the promise):** Does the reader understand why you made the choice?
- **Act 2 (the unraveling):** Does each problem feel heavier than the last? Can a Node/TS developer follow each one without insider context?
- **Act 3 (the reckoning):** Does the conclusion follow from the evidence, or does it come out of nowhere?

If Act 2 reads like a list rather than a story, the transitions are too flat. "Then X broke. Then Y broke. Then Z broke." needs connective tissue that escalates — from annoyance to production outage to daily friction.

---

## Spotting AI patterns

Things that sound written by an LLM:

- **Stacked dramatic fragments.** "X happened. Y happened. Z happened." for effect.
- **"If you've ever..." or "Most developers..."** — generalizations that assume shared experience.
- **Parenthetical fairness.** "(To be fair, this was later fixed.)" inserted right after a criticism.
- **"That's the kind of thing that..."** — editorializing the significance instead of letting the fact speak.
- **Mirrored closing.** Restating the opening image. Real posts end; they don't circle back on cue.
- **Vocabulary tells.** "Leverage," "ecosystem," "it's worth noting," "let's dive in," "in the ever-evolving landscape."

The fix for all of these: say what happened, to you, specifically. The reader will draw their own conclusions.
