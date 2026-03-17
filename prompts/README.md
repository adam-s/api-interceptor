# Prompts

Each file is a self-contained prompt you can paste into Claude Code after cloning this repo. The hints section at the bottom of each prompt contains knowledge from previous iterations that saves discovery time.

## Usage

1. `pnpm install && pnpm run dev`
2. Open Claude Code
3. Paste the contents of any prompt file
4. Claude Code uses the skills in `.claude/skills/` to build it end-to-end

## Prompts

| # | File | App | Key challenge |
|---|------|-----|---------------|
| 1 | `01-ticket-comparison.md` | `/tickets` | Browser interception, SSR extraction, multi-source merging |
| 2 | `02-market-intelligence.md` | `/market` | Background polling, WebSocket push, sentiment analysis |
| 3 | `03-vacation-rentals.md` | `/rentals` | Bot detection, cross-listing by coordinates, Python scoring |
| 4 | `04-job-search.md` | `/jobs` | Entity dedup, CRUD state, salary normalization |
| 5 | `05-academic-research.md` | `/research` | Public REST APIs, XML parsing, DOI dedup |
| 6 | `06-government-records.md` | `/records` | Government APIs, timeline visualization |
| 7 | `07-reddit-client.md` | `/reddit` | .json suffix API, mobile-first dark UI, nested comments |
| 8 | `08-youtube.md` | `/youtube` | yt-dlp Python bridge, background downloads, video player |
