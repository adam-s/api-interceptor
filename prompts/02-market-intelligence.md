Build me a market dashboard using a major financial data site. I want three things:

**News with sentiment** — poll RSS feeds for a watchlist of major symbols every 60 seconds. Run each headline through the Python bridge for sentiment analysis (bull/flat/bear). Push updates to connected dashboard clients over WebSocket so it's live.

**Quote + chart data** — discover the site's internal API endpoints by navigating and watching CDP traffic. I want current price, change %, volume, market cap, and intraday chart data for any symbol.

**Dashboard at `/market`** — watchlist sidebar on the left, click a symbol to see its quote card with a sparkline chart and its news feed with sentiment badges. Bottom panel shows all news across all symbols chronologically. Should feel live — updates appear without refreshing.

If the site rate-limits something, show the cached value with a "stale" indicator rather than an error.
