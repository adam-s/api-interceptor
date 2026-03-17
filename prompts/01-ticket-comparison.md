I want to compare ticket prices across StubHub and Ticketmaster. Build domain plugins for both sites — figure out how they serve their search results, event details, and ticket listings.

Build me a dashboard at `/tickets` where I search by artist name and see events from both platforms merged together. Same venue + same date = same event, show both badges. When I click an event, show me a side-by-side comparison of available seats and prices — I want to see which platform is cheaper for each section.

If only one platform has an event, still show it. If a platform's browser isn't connected, show that cleanly without breaking the other one.

## Hints

- StubHub is pure SSR — CDP traffic buffer will be empty. All data is in the DOM via `a[href*="/event/"]` and `[data-listing-id]` elements. Use `innerText` split by `\n` for section/row/quantity parsing.
- Ticketmaster uses a hybrid model: search results may be SSR, but ticket availability comes from an internal API (`services.ticketmaster.com` ISMDS endpoints) that is CORS-blocked — use Type B2 traffic capture.
- Ticketmaster event IDs are alphanumeric hex — use `[A-Z0-9]+` not `\d+` in regex.
- Performer pages on both sites include "Recommended" / "You may also like" sections. Filter extracted URLs to only those containing the performer name slug.
- `data-price` attributes on StubHub may differ from displayed text in non-USD geolocations. Read prices from displayed text.
- TM geolocks to regional domains based on browser IP. Ensure event URLs use the correct domain.
- TM Discovery API (`app.ticketmaster.com/discovery/v2`) is free but requires email-verified registration. Without `TM_API_KEY` env var, fall back to browser SSR extraction. Use the graceful degradation pattern.
