# Inspection-First Development

## page.evaluate() Rules

**Allowed:** navigation (clicking, typing), page metadata (URL, title), auth token extraction (CSRF from hidden inputs), reading raw HTML source for embedded JSON discovery.

**Forbidden:** extracting rendered text, prices, listings, or any user-visible data without proof from the Transport Classification table that no network request carries it. Also forbidden: `page.evaluate(fetch(...))` — use `browserFetch` instead.

## Implementation Escalation — Lightest First

1. **`rateLimitedFetch`** — direct HTTP. Test with curl first. Most endpoints work without a browser.
2. **`browserFetch`** — browser TLS + cookies. Use only if direct HTTP returns 429/403/WAF.
3. **`page.evaluate` for DOM** — last resort. Requires SSR proof from classification table.

## When Something Goes Wrong

- Unexpected output is information, not failure. Investigate encoding, localization, lazy loading before abandoning an approach.
- Never declare "done" without end-to-end proof (curl output or screenshot showing real data).
