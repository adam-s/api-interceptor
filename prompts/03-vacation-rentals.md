Build me a vacation rental comparison tool. Create domain plugins for Airbnb, VRBO, and Zillow. Figure out how each site serves its search results and listing details — discover the APIs first, then build the routes.

I want to search for a location and dates and see listings from all three platforms side by side. Use the Python bridge to score each listing by value (rating per dollar) and detect cross-listings — same property on multiple platforms matched by coordinates. Show me which platform is cheaper when a property is cross-listed.

Dashboard at `/rentals` — search bar with location, dates, and guests. Card grid sorted by value score with source badges. Cross-listed properties should call out the savings. Sidebar with Zillow long-term rental comps for the same area so I can compare short-term vs long-term economics.

## Hints

- Airbnb search is pure SSR — the `StaysSearch` GraphQL call only fires on client-side filter changes, not initial page load. DOM extraction via `a[href*="/rooms/"]` is the only reliable approach for search results.
- Airbnb has a stable public API key (look for `X-Airbnb-API-Key` header in CDP traffic on listing detail page loads). Use it in `browserFetch` headers for GraphQL persisted queries.
- VRBO uses obfuscated HMAC-signed URL paths. No usable public JSON API. DOM extraction is the only option.
- Zillow exposes a JSON API: `PUT https://www.zillow.com/async-create-search-page-state`. Call via `browserFetch(..., { navigateTo: 'https://www.zillow.com' })` so cookies are present.
- Both Airbnb and VRBO are Next.js apps — check `window.__NEXT_DATA__` on detail pages for structured listing data.
