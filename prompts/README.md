# Prompts

Each file is a self-contained prompt you can paste into Claude Code after cloning this repo. The hints section at the bottom of each prompt contains knowledge from previous iterations that saves discovery time.

## Usage

1. `pnpm install && pnpm run dev`
2. Open Claude Code
3. Paste the contents of any prompt file
4. Claude Code uses the skills in `.claude/skills/` to build it end-to-end

**Validate first:** Before targeting a real site, run your discovery process against the test server (`pnpm --filter @interceptor/test-server start` on port 4444). The "Validate with" column tells you which test server site matches the prompt's transport patterns.

## Prompts

| # | File | App | Key challenge | Validate with |
|---|------|-----|---------------|---------------|
| 1 | `01-ticket-comparison.md` | `/tickets` | Browser interception, embedded JSON, multi-source merging | `boardshop` (embedded JSON + POST pagination + CSRF) |
| 2 | `02-market-intelligence.md` | `/market` | Background polling, WebSocket push, sentiment analysis | `liveboard` (WebSocket + protobuf + crumb token) |
| 3 | `03-vacation-rentals.md` | `/rentals` | Bot detection, cross-listing by coordinates, Python scoring | `boardshop` + `databoard` (embedded JSON + encoded responses) |
| 4 | `04-job-search.md` | `/jobs` | Entity dedup, CRUD state, salary normalization | `streamshop` (GraphQL + batched operations) |
| 5 | `05-academic-research.md` | `/research` | Public REST APIs, XML parsing, DOI dedup | `databoard` (REST API + Bearer auth) |
| 6 | `06-government-records.md` | `/records` | Government APIs, timeline visualization | `databoard` (REST API + Bearer auth) |
| 7 | `07-reddit-client.md` | `/reddit` | .json suffix API, mobile-first dark UI, nested comments | `boardshop` (JSON API + pagination) |
| 8 | `08-youtube.md` | `/youtube` | yt-dlp Python bridge, background downloads, video player | `streamshop` (HLS chain + media delivery) |
| 9 | `09-professional-network.md` | `/network` | Auth-gated API discovery, rate limiting, full platform automation | `streamshop` (GraphQL + WebSocket chat) |
