# Developer Test Prompts

These are example prompts that a developer should be able to give to Claude Code after cloning this repository. The skills (api-discovery, dashboard-builder, visual-dev, etc.) should guide Claude Code through building each application end-to-end.

Each prompt tests different capabilities of the framework. Use these to validate that the skills are comprehensive enough.

---

## Prompt 1: Event Ticket Price Comparison

> Create domains that capture event ticket prices across StubHub, Ticketmaster, SeatGeek, and TicketNetwork.
>
> First, discover the search API for each site so I can search by artist name. Then discover the event detail and ticket listing APIs so I can get available tickets with sections and prices.
>
> Build a polished dashboard page at /tickets where I type "Bad Bunny" into a search box. It should:
> 1. Search all four sites in parallel and show a list of matching events with dates and venues
> 2. When I click an event, show all available tickets across all four marketplaces
> 3. Match tickets by section (e.g., "Section 101" on StubHub = "Sec 101" on Ticketmaster) and show a comparison grid with prices side by side
> 4. Highlight the cheapest option for each section
> 5. Handle errors gracefully — if a site's browser isn't connected, show that clearly without breaking the other sites
>
> Use the visual-dev skill to iterate on the UI until it looks professional — no visual bugs, clean layout, readable at a glance.

**What this tests:**
- Creating 4 domain plugins from scratch
- Multi-step API discovery (search → event detail → ticket listings)
- Dashboard UI with search → event list → ticket comparison drill-down
- Cross-domain data normalization (matching section names across sites)
- Error resilience (sites failing independently)
- Visual polish via iterative screenshot loop

---

## Prompt 2: Short-Term Rental Management

> Create domains for Airbnb, VRBO, and Zillow. Log into my host accounts and detect when my apartment gets booked on Airbnb so I can automatically delist it from the other platforms. Also track prices of similar nearby apartments — if competitors lower prices, alert me so I can adjust mine to stay competitive.

**What this tests:**
- Authenticated sessions (login required)
- Write operations (delist/update listings via API)
- Price monitoring over time
- Geolocation-based queries (nearby apartments)
- Automated actions triggered by events (booking → delist)
- Multi-account management

---

## Prompt 3: Job Search Aggregator

> Create domains for LinkedIn, Indeed, Glassdoor, and Dice. Search for "senior React developer in Austin", get job postings with salary, company, and requirements from each site. Build a dashboard that deduplicates the same job posted on multiple sites and compares salary ranges. Let me save favorites and track application status.

**What this tests:**
- Search with location + keyword parameters
- Entity deduplication across sources (same job, different sites)
- Salary range parsing and normalization
- Persistent user state (favorites, application tracking)
- CRUD operations (save, update status)

---

## Prompt 4: Social Media Cross-Poster & Analytics

> Create domains for Twitter/X, LinkedIn, Bluesky, and Mastodon. Log into my accounts on each platform. Build a dashboard where I write a post once and publish it to all four platforms simultaneously. Then aggregate engagement metrics — likes, reposts, impressions — into a single view so I can see which platform performs best for each post.

**What this tests:**
- POST operations through the API proxy (publishing content)
- Authenticated write access to multiple platforms
- Polling for metrics updates over time
- Data aggregation and comparison charts
- Rich text / media handling across different API formats

---

## Prompt 5: Academic Research Aggregator

> Create domains for PubMed, Semantic Scholar, and ArXiv. Some of these may have public REST APIs — prefer using those directly over browser interception when available. Search for a research topic, collect papers with citations, abstracts, and authors. Deduplicate papers that appear in multiple databases. Build a literature review dashboard that shows citation networks and identifies the most influential papers in a field.

**What this tests:**
- Hybrid approach: direct API calls (ArXiv, Semantic Scholar have public APIs) vs browser interception (PubMed may need it)
- Domain plugins that use direct fetch instead of browserFetch when possible
- Citation graph traversal (follow references)
- Entity resolution (same paper across databases)
- Data visualization (citation network graph)

---

## Prompt 6: Government & Public Records Monitor

> Create domains for SEC EDGAR, my state's business registry, county property records, and the federal court docket system (PACER). Search by company name, aggregate all filings, registrations, and court cases. Build a due diligence dashboard that shows a timeline of all activity and alerts me when new filings appear.

**What this tests:**
- Server-side rendered sites with no client-side API (worst case for interception)
- Session-based auth with CAPTCHAs (PACER)
- Scheduled monitoring (check for new filings periodically)
- Timeline/chronological data visualization
- PDF document handling (SEC filings, court documents)
- The compelling "why browser interception matters" story — these sites resist automation

---

## How to Use These Prompts

1. Clone the repository
2. Run `pnpm install && pnpm run dev`
3. Open Claude Code (CLI or VS Code extension)
4. Paste one of the prompts above
5. Claude Code should use the skills to:
   - Check for existing domain plugins
   - Create new ones by capturing browser traffic
   - Generate proxy routes
   - Build the dashboard UI
   - Wire everything together

## Success Criteria

A prompt is "solved" when:
- [ ] All domain plugins are created and registered
- [ ] API routes are discovered and proxied through the browser
- [ ] Dashboard UI is functional (search, display, interact)
- [ ] Data from multiple sources is composed into a unified view
- [ ] The app works end-to-end without manual intervention after the initial prompt
