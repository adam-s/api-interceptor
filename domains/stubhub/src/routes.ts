import type { DomainRoute } from '@interceptor/browser/handler/domain-loader';

// StubHub API — discovered via user journey simulation
//
// User journey:
//   1. Homepage → search box → /secure/Search?q=... (SSR HTML with performer cards)
//   2. Click performer → /slug-tickets/performer/{id}/ (SSR HTML with event list)
//   3. Click event → /slug-tickets-date/event/{eventId}/ (SPA with [data-listing-id] listing cards)
//
// APIs found:
//   - POST /?method=DontMissEvents — trending events JSON
//   - POST /?method=MostPopularCategories — category/performer browse
//   - POST /performer-page?method=GetCarouselItems — related performers + trending carousels
//   - SSR pages: search, performer, event detail — data in DOM
//   - Ticket listings: [data-listing-id] elements on event page, data-price attribute

export const routes: DomainRoute[] = [
  {
    method: 'GET',
    path: '/search',
    description: 'Search for artists/events by name. Returns performer cards with event count.',
    handler: async (c, browser) => {
      const q = new URL(c.req.url).searchParams.get('q') ?? '';
      if (!q) return c.json({ error: 'q param required' }, 400);

      const page = browser.getPage();
      if (!page) return c.json({ error: 'Browser page not available' }, 503);

      // Navigate the browser to the search URL — SSR page, results embedded in DOM
      await browser.navigate(`https://www.stubhub.com/secure/Search?q=${encodeURIComponent(q)}`);
      await new Promise(r => setTimeout(r, 4000));

      const performers = await page.evaluate((): Array<Record<string, unknown>> => {
        // StubHub search shows performer/team cards as <a> links
        // Each links to /performer-slug-tickets/performer/{performerId}?agqi=...
        const links = Array.from(document.querySelectorAll('a[href*="/performer/"]'));
        return links.map(a => {
          const el = a as HTMLAnchorElement;
          const href = el.href;
          // Extract performerId from URL pattern: /performer/{id}
          const idMatch = href.match(/\/performer\/(\d+)/);
          const performerId = idMatch?.[1] ?? null;
          // innerText respects visible text better than textContent
          const rawText = (el as HTMLElement).innerText ?? el.textContent ?? '';
          // Remove category/type suffixes like "Concert Tickets • 29 events"
          // Use [\s\S]* to match across newlines in innerText
          const name = rawText
            .replace(/\.(cls-\d+|[a-z0-9-]+)\s*\{[^}]*\}/g, '')
            .replace(/\s*(Concert|Hockey|Basketball|Baseball|Football|Theater|Other|Sports)\s+Tickets[\s\S]*/i, '')
            .replace(/\s*•\s*\d+\s+events?[\s\S]*/i, '')
            .replace(/\s+/g, ' ').trim();
          // Get event count from sibling/parent text
          const parentText = el.parentElement?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
          const countMatch = parentText.match(/(\d+)\s+events?/i);
          return {
            name,
            performerId,
            performerUrl: href.split('?')[0], // strip tracking params
            eventCount: countMatch ? parseInt(countMatch[1]) : null,
          };
        }).filter(p => p.performerId && p.name.length > 0);
      });

      // Deduplicate by performerId
      const seen = new Set<string>();
      const deduped = performers.filter(p => {
        const key = p.performerId as string;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      return c.json({ performers: deduped, query: q, total: deduped.length });
    },
  },

  {
    method: 'GET',
    path: '/performer-events',
    description: 'Upcoming events for a performer. Pass performerUrl query param.',
    handler: async (c, browser) => {
      const page = browser.getPage();
      if (!page) return c.json({ error: 'Browser page not available' }, 503);

      const performerUrl = new URL(c.req.url).searchParams.get('url');
      if (!performerUrl) return c.json({ error: 'url param required' }, 400);

      await browser.navigate(performerUrl);
      await new Promise(r => setTimeout(r, 5000));

      const events = await page.evaluate((): Array<Record<string, unknown>> => {
        // Find all /event/ links on the performer page
        const links = Array.from(document.querySelectorAll('a[href*="/event/"]'));
        const seen = new Set<string>();
        const results: Array<Record<string, unknown>> = [];

        for (const a of links) {
          const el = a as HTMLAnchorElement;
          const href = el.href.split('?')[0]; // strip tracking
          if (seen.has(href)) continue;
          seen.add(href);

          // Extract eventId from URL pattern: /event/{eventId}/
          const eventIdMatch = href.match(/\/event\/(\d+)/);
          const eventId = eventIdMatch?.[1] ?? null;
          if (!eventId) continue;

          // Parse text content — StubHub event cards show: date city country venue time
          const rawText = el.textContent?.replace(/\s+/g, ' ').trim() ?? '';
          // Remove CSS fragments
          const text = rawText.replace(/\.cls-\d+\s*\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();

          results.push({
            eventId,
            url: href,
            rawText: text.slice(0, 150),
          });
        }
        return results.slice(0, 50);
      });

      return c.json({ events, performerUrl, total: events.length });
    },
  },

  {
    method: 'GET',
    path: '/listings/:eventId',
    description: 'Ticket listings for an event. Pass eventSlug query param for URL construction.',
    handler: async (c, browser) => {
      const page = browser.getPage();
      if (!page) return c.json({ error: 'Browser page not available' }, 503);

      const params = c.req.param() as Record<string, string>;
      const eventId = params.eventId;
      const urlParams = new URL(c.req.url).searchParams;
      const slug = urlParams.get('slug') ?? 'event-tickets';

      // Construct event URL: /slug/event/eventId/
      const eventUrl = `https://www.stubhub.com/${slug}/event/${eventId}/`;

      await browser.navigate(eventUrl);
      await new Promise(r => setTimeout(r, 6000));

      const listings = await page.evaluate((): Array<Record<string, unknown>> => {
        // StubHub event pages use [data-listing-id] for each listing card
        const listingEls = document.querySelectorAll('[data-listing-id]');
        return Array.from(listingEls).map(el => {
          // Structured data attributes (reliable — no parsing needed)
          const listingId = el.getAttribute('data-listing-id');
          const priceStr = el.getAttribute('data-price') ?? '';
          const isSold = el.getAttribute('data-is-sold') === '1';
          const index = el.getAttribute('data-index');

          // Parse price: "S/.891" → 891, "S/.2,652" → 2652
          const priceNum = parseFloat(priceStr.replace(/[^0-9.,]/g, '').replace(',', ''));

          // Use innerText (line-separated) for reliable section/row parsing
          // innerText splits child elements with newlines, preserving structure
          const text = (el as HTMLElement).innerText ?? el.textContent ?? '';
          const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);

          // Extract section: line containing "Section NNN" or special section names
          let section: string | null = null;
          let row: string | null = null;
          let quantity: number | null = null;

          for (const line of lines) {
            const secMatch = line.match(/^Section\s+(\d+)$/);
            if (secMatch) { section = secMatch[1]; continue; }
            const rowMatch = line.match(/^Row\s+(\d+)$/);
            if (rowMatch) { row = rowMatch[1]; continue; }
            const qtyMatch = line.match(/^(\d+)\s+tickets?(?:\s|$)/i);
            if (qtyMatch) { quantity = parseInt(qtyMatch[1]); continue; }
            // Special sections: Golden Circle, PISTA, PALCO, VIP, Floor, etc.
            if (/^(Golden Circle|General Admission|Floor|Pit|VIP|PISTA|PALCO|Standing)$/i.test(line)) {
              section = line;
            }
          }

          // Quality/rating from text
          const fullText = text.replace(/\n/g, ' ');
          const ratingMatch = fullText.match(/(\d+\.\d+)\s*(Amazing|Great|Good|Fair)/);

          const priceCurrency = priceStr.includes('S/.') ? 'PEN'
            : priceStr.includes('£') ? 'GBP'
            : priceStr.includes('€') ? 'EUR' : 'USD';

          return {
            listingId,
            index: index ? parseInt(index) : null,
            section,
            row,
            quantity,
            priceDisplay: priceStr,
            price: isNaN(priceNum) ? null : priceNum,
            priceCurrency,
            rating: ratingMatch ? parseFloat(ratingMatch[1]) : null,
            quality: ratingMatch?.[2] ?? null,
            isSold,
          };
        });
      });

      // Get event info from page
      const eventInfo = await page.evaluate((): Record<string, unknown> => ({
        title: document.title,
        url: window.location.href,
        listingCount: document.querySelectorAll('[data-listing-id]').length,
      }));

      return c.json({
        eventId,
        eventUrl,
        ...eventInfo,
        listings,
        total: listings.length,
      });
    },
  },

  {
    method: 'GET',
    path: '/trending',
    description: 'Trending events near visitor location. Uses POST ?method=DontMissEvents.',
    handler: async (c, browser) => {
      const maxRows = new URL(c.req.url).searchParams.get('maxRows') ?? '20';
      const result = await browser.browserFetch<Record<string, unknown>>(
        `https://www.stubhub.com/?method=DontMissEvents&categoryId=0&maxRows=${maxRows}&page=0`,
        { method: 'POST' },
      );
      const data = result.data ?? {};
      const items = (data.items as unknown[]) ?? [];
      return c.json({ events: items, total: (data.totalCount as number) ?? items.length });
    },
  },
];
