Build me a market dashboard using Yahoo Finance. I want three things:

**News with sentiment** — poll Yahoo Finance RSS feeds for a watchlist (AAPL, TSLA, NVDA, MSFT, SPY, BTC-USD) every 60 seconds. Run each headline through the Python bridge for sentiment analysis (bull/flat/bear). Push updates to connected dashboard clients over WebSocket so it's live.

**Quote + chart data** — discover Yahoo Finance's internal API endpoints by navigating the site and watching CDP traffic. I want current price, change %, volume, market cap, and intraday chart data for any symbol.

**Dashboard at `/market`** — watchlist sidebar on the left, click a symbol to see its quote card with a sparkline chart and its news feed with sentiment badges. Bottom panel shows all news across all symbols chronologically. Should feel live — updates appear without refreshing.

If Yahoo rate-limits something, show the cached value with a "stale" indicator rather than an error.

## Hints

- Yahoo Finance's frontend is SvelteKit — initial data is SSR-embedded in `<script type="application/json" data-sveltekit-fetched>` tags. Client-side interactions trigger XHR to `query2.finance.yahoo.com`.
- Use `query2.finance.yahoo.com` for chart/quote data. Both `query1` and `query2` subdomains work; `query2` is more reliable.
- Yahoo Finance uses CORS from the main site. Use `browserFetch(url, { navigateTo: 'https://finance.yahoo.com' })` to stay on the main site and let CORS carry cookies.
- Chart endpoints use unix timestamps in seconds for `period1`/`period2` parameters.
- The `crumb` session token is embedded in page state. For most endpoints, the crumb is optional if the session cookie is valid. Cache it in a module-level variable.
- Heavy testing poisons the browser profile session. If all quote endpoints return 429 but CDN-cached endpoints return 200, wipe the browser profile directory and reconnect.
- Node.js `fetch()` gets 429 due to TLS fingerprinting (JA3/JA4). Use `browserFetch()` instead of direct `fetch()` for Yahoo Finance data endpoints.
- RSS feeds at `https://feeds.finance.yahoo.com/rss/2.0/headline?s={TICKER}` are `browserRequired: false` — plain HTTP, no auth needed.
