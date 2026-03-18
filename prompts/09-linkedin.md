Use the api-discovery skill (`.claude/skills/api-discovery/SKILL.md`) in **Live Mode** to reverse-engineer LinkedIn's internal API. The API server is running on port 3001 with traffic capture at `/browser/traffic`. Follow the skill's workflow: clear buffer → navigate → wait → read traffic → analyze → schema → repeat.

Build me a full LinkedIn automation platform. Create a `linkedin` domain plugin that captures every API endpoint LinkedIn uses — feed, profiles, messaging, jobs, posting, comments, reactions, search, connections, notifications. This is an API discovery project first, automation platform second.

LinkedIn is auth-gated — cookies are already imported into the `generic` browser profile. Use that profile for all browser sessions. Go SLOW — LinkedIn aggressively rate-limits and flags automation. Add delays between every action (5-15 seconds randomized). Never burst requests.

## Phase 1: API Discovery (capture everything)

Navigate to each LinkedIn section in the browser and capture all XHR/fetch traffic. Map every endpoint, its request format, headers, and response shape. Priority order:

1. **Feed** — `/feed/`, scroll to load more. Capture the feed endpoint, post rendering data, reaction counts, comment previews.
2. **Profile** — Visit your own profile, then 2-3 others. Capture profile data endpoints, skills, experience, education, recommendations.
3. **Search** — Search for people, jobs, posts, companies. Capture search API with all filter parameters.
4. **Messaging** — Open messaging, load conversations, open a thread. Capture message list, thread detail, typing indicators, read receipts.
5. **Jobs** — Browse jobs, view a listing, check saved jobs. Capture job search, job detail, application status endpoints.
6. **Posting** — Don't actually post yet, but inspect the composer. Capture the post creation endpoint structure, media upload flow, audience selection.
7. **Notifications** — Open notifications tab. Capture notification feed, mark-as-read endpoint.
8. **Connections** — View connections, pending invitations. Capture connection list, invite endpoints.
9. **Reactions & Comments** — React to a post, write and delete a test comment. Capture reaction types, comment creation/deletion endpoints.

## Phase 2: Proxy Routes

Build typed proxy routes for every discovered endpoint. Group by feature area:

- `GET /api/linkedin/feed` — paginated feed
- `GET /api/linkedin/profile/:id` — profile data
- `GET /api/linkedin/search` — unified search (people, jobs, posts, companies)
- `GET /api/linkedin/messages` — conversation list
- `GET /api/linkedin/messages/:threadId` — thread detail
- `POST /api/linkedin/messages/:threadId/send` — send message
- `GET /api/linkedin/jobs/search` — job search
- `GET /api/linkedin/jobs/:id` — job detail
- `POST /api/linkedin/posts` — create post
- `POST /api/linkedin/posts/:id/react` — react to post
- `POST /api/linkedin/posts/:id/comment` — comment on post
- `GET /api/linkedin/notifications` — notifications
- `GET /api/linkedin/connections` — connections list
- `POST /api/linkedin/connections/invite` — send invite

## Phase 3: Dashboard

Dashboard at `/linkedin` with tabbed navigation:

- **Feed** — scrollable feed with reactions, comments, reshare. Compose new post.
- **Messages** — conversation list on left, thread on right. Send messages inline.
- **Jobs** — search and browse with filters. Save jobs, track applications.
- **Network** — connections, pending invites, people you may know. Accept/ignore invites.
- **Profile** — view and (eventually) edit your profile.
- **Search** — unified search across people, jobs, posts, companies.

## Hints

- LinkedIn's internal API is at `www.linkedin.com/voyager/api/` — watch for this prefix in captured traffic. Responses are typically LinkedIn's custom REST-li format with `$type` annotations.
- Critical headers: `csrf-token` (from `JSESSIONID` cookie, strip the quotes and `ajax:` prefix), `x-restli-protocol-version: 2.0.0`, `x-li-lang`, `x-li-track`.
- Rate limiting is AGGRESSIVE. Add `{ delayMs: { min: 5000, max: 15000 } }` to route config. Never make parallel requests. Queue everything sequentially.
- The `li_at` cookie is the auth session — if it expires, re-run the cookie import script.
- LinkedIn paginates with `start` and `count` params (not cursor-based). Default `count` is usually 10, max varies by endpoint.
- For posting: LinkedIn uses a multi-step flow — create post draft, optionally upload media, then publish. The media upload endpoint is separate.
- Messaging uses a different sub-API (`/voyager/api/messaging/`). Real-time updates come via a long-poll or SSE connection.
- Profile URNs look like `urn:li:fsd_profile:ACoAAC...` — many endpoints reference these URNs rather than vanity URLs.
- The browser profile is at `data/browser-profiles/generic` — use `profileName: 'generic'` in route config.
