Build me a due diligence tool. Create domain plugins for SEC EDGAR and the federal court system. I want to search by company name and see all their filings, registrations, and court cases in one place.

Dashboard at `/records` — chronological timeline of all activity across sources, color-coded by source type. I want to be able to quickly scan a company's legal and regulatory history.

## Hints

- SEC EDGAR has public APIs at `efts.sec.gov` and `data.sec.gov` — `browserRequired: false`. SEC requires a descriptive User-Agent with contact info: `'api-interceptor/1.0 (research tool; admin@example.com)'`. Requests without it get 403.
- PACER (federal court dockets) requires paid auth and CAPTCHA. Use CourtListener (`courtlistener.com/api/rest/v4`) as a free open-source mirror instead.
- State business registries are typically pure SSR (Type B) — no client-side APIs, need DOM extraction.
