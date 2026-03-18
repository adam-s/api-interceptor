Build me a market dashboard using Yahoo Finance. I want three things:

**News with sentiment** — poll Yahoo Finance RSS feeds for a watchlist (AAPL, TSLA, NVDA, MSFT, SPY, BTC-USD) every 60 seconds. Run each headline through the Python bridge for sentiment analysis (bull/flat/bear). Push updates to connected dashboard clients over WebSocket so it's live.

**Quote + chart data** — discover Yahoo Finance's internal API endpoints by navigating the site and watching CDP traffic. I want current price, change %, volume, market cap, and intraday chart data for any symbol.

**Dashboard at `/market`** — watchlist sidebar on the left, click a symbol to see its quote card with a sparkline chart and its news feed with sentiment badges. Bottom panel shows all news across all symbols chronologically. Should feel live — updates appear without refreshing.

If Yahoo rate-limits something, show the cached value with a "stale" indicator rather than an error.
