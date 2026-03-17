Build me a Reddit client that feels like a native mobile app. Create a `reddit` domain plugin — Reddit has a `.json` suffix API (append `.json` to any URL for structured data). Discover if there's a richer internal API too.

Dashboard at `/reddit` — mobile-first design, dark mode by default using Reddit's color palette. Feed view with posts (subreddit, title, thumbnail, score, comments, time ago), sort by Hot/New/Top. Click a post to see the full content with nested comment threads that I can collapse and expand. Search, and bottom navigation bar like the Reddit app.

Voting, saving, and subscribing should use optimistic UI — update immediately, sync in background. The whole thing should feel fast and native on a phone while still working well on desktop.

## Hints

- Reddit exposes a `.json` suffix on any URL (e.g., `reddit.com/r/programming/hot.json`) for read-only JSON. No API key needed. ~60 req/min rate limit. Pagination via `after` cursor token.
- The internal Reddit API uses GraphQL at `gql.reddit.com` and OAuth endpoints at `oauth.reddit.com`. Look for `Authorization: Bearer ...` and `x-reddit-*` headers in CDP traffic.
- The `.json` suffix pattern is simpler and sufficient for most read operations. The internal GraphQL API provides richer data for write operations and authenticated features.
