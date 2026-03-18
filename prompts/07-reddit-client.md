Build me a Reddit client that feels like a native mobile app. Create a `reddit` domain plugin — Reddit has a `.json` suffix API (append `.json` to any URL for structured data). Discover if there's a richer internal API too.

Dashboard at `/reddit` — mobile-first design, dark mode by default using Reddit's color palette. Feed view with posts (subreddit, title, thumbnail, score, comments, time ago), sort by Hot/New/Top. Click a post to see the full content with nested comment threads that I can collapse and expand. Search, and bottom navigation bar like the Reddit app.

Voting, saving, and subscribing should use optimistic UI — update immediately, sync in background. The whole thing should feel fast and native on a phone while still working well on desktop.
