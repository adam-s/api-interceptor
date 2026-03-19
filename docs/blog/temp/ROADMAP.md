# Framework Roadmap

## The Goal

A developer clones this repo, pastes a prompt, and Claude Code uses the skills to discover APIs, create domain plugins, and build a working dashboard — without manual intervention beyond the initial prompt. The skills are the product. The test prompts are the proof.

---

## Checkpoint Branches

Every prompt has natural phases — API discovery before UI, UI before polish. Save verified phases as checkpoint branches so solved work is never re-done.

```text
base
  └─ test/ticket-l1-v1  (API discovery — fails)
     fix skill on base, retry
  └─ test/ticket-l1-v2  (API discovery — verified with curl ✓)
     └─ promote → checkpoint/ticket-l1-apis   ← frozen

checkpoint/ticket-l1-apis
  └─ test/ticket-l2-v1  (dashboard UI — fails)
     fix skill on base, retry from checkpoint
  └─ test/ticket-l2-v2  (dashboard — screenshot confirmed ✓)
```

**Rules:**
- Only promote when phase is fully verified (curl returns real data, screenshot shows real content)
- Checkpoints are frozen starting points — never commit to them directly
- Skills are always fixed on `base` — checkpoints hold verified domain state

---

## Lessons Learned (from 8 prompts × 3 passes)

These are the non-obvious discoveries that shaped the skills. Each one was a real bug that cost time.

### Discovery phase
- **Never guess URLs.** Navigate from the homepage using the site's own search. The resulting URL is the one to proxy.
- **CDP catches everything; page.route() misses things.** Use CDP `Network.enable` for discovery, narrow to `page.route()` for proxy interception once you know the endpoints.
- **Check for public APIs first.** Many academic and government sites have public APIs. Browser interception was unnecessary for 4 of 8 prompts.
- **Some sites expose `.json` suffix APIs.** Appending `.json` to a URL returns structured data with no auth required.
- **CLI tools beat browser automation for hostile sites.** Some media sites block browsers aggressively. CLI tools (yt-dlp, gallery-dl, spotdl) via Python bridge are battle-tested alternatives.

### Browser interception
- **`browserFetch()` navigates to the target origin by default.** For CORS subdomains, use `navigateTo` to stay on the main site. For SPA-internal endpoints, don't navigate at all — the endpoint depends on the SPA's page context.
- **`textContent` concatenates; `innerText` separates.** Always use `innerText` for SSR extraction — it respects CSS layout and adds `\n` between block elements.
- **Session profiles get poisoned.** Heavy testing triggers rate limits tied to cookies. Symptom: all endpoints 429, but incognito returns 200. Fix: wipe `data/browser-profiles/<domain>`.
- **TLS fingerprinting blocks Node.js `fetch()`.** Some sites detect Node.js by its TLS fingerprint (JA3/JA4). Use `browserFetch()` inside the route handler instead of direct `fetch()`.

### Dashboard building
- **An untested button is a broken button.** The agent built download buttons that didn't work because it never walked the full user journey to reach them.
- **`setState(x)` then `setTimeout(() => handler(), 0)` reads stale state.** Pass the value directly: `handler(x)` not `setQuery(x); handleSearch()`.
- **The first visit with zero setup IS the product.** Pages that show "Browser not connected" on first load are not done.
- **Silent `catch {}` blocks = infinite loading.** Every catch must surface something to the user.
- **Mobile is a different product.** Overlapping text at 375px, invisible hover-only affordance, tiny touch targets — test at mobile viewport every time.

### Bot detection
- **Cloudflare Turnstile "Press & Hold"** requires real mousedown held ~1-2 seconds, then mouseup. The browser page now supports `mouseDown()`/`mouseUp()` separately.
- **No SMS bridge.** Some sites require phone verification. Disposable email passes email verification but blocks at phone step. This is an unsolved gap.
- **CAPTCHA gate protocol.** Routes return structured 403 `{ blocked, captchaRequired, browserUrl }` so the dashboard can prompt the user to authenticate manually via `/browser`.

---

## Status

All 8 developer prompts solved. Skills converged — Pass 2 produced zero new base fixes across all 8 prompts. Skills converged for the 8 tested prompts. New prompt archetypes or edge cases may surface gaps. Always log potential improvements to `base-fixes-needed.md`. The framework supports four data access paradigms:

1. **Browser interception** — CDP traffic capture + `browserFetch()` proxy
2. **Public REST APIs** — direct `fetch()` with `browserRequired: false`
3. **URL suffix APIs** — append `.json` to HTML URLs for structured data
4. **CLI tool bridge** — Python worker orchestrating battle-tested CLI tools
