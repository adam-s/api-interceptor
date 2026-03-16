/**
 * StubHub Phase 13: Extract structured listing data from event page DOM
 */

import WebSocket from 'ws';

async function run() {
  console.log('=== StubHub Listings DOM Extraction ===');

  const ws = new WebSocket('ws://localhost:3001/browser/stream?profile=stubhub&url=https://www.stubhub.com/bad-bunny-barcelona-tickets-5-22-2026/event/158171526/');
  ws.on('error', (err: Error) => console.error('[WS]', err.message));
  ws.on('message', (d: Buffer) => {
    try { const m = JSON.parse(d.toString()); if (m.type === 'ready') console.log('[Ready]'); } catch {}
  });

  console.log('Loading event page...');
  await new Promise(r => setTimeout(r, 12000));

  // Call the performer-events route (it will navigate to event URL and evaluate DOM)
  // We need a specialized route for listings
  // For now, let's call performer-events which evaluates the current page
  // (the browser IS already on the event page!)
  // Wait - performer-events calls browser.navigate() first, overriding the loaded page
  // Let me use the search route instead which evaluates whatever page is loaded
  const res = await fetch('http://localhost:3001/api/stubhub/search?q=bad+bunny');
  const data = await res.json() as Record<string, unknown>;
  // This will re-navigate to the search page... not what we want

  // Instead, let me check window globals + listing CSS selectors
  // The right approach: add a /listings/:eventId route

  // For now, let me just call the trending route to keep browser alive
  // and do raw DOM inspection via a dedicated test

  const trendRes = await fetch('http://localhost:3001/api/stubhub/trending');
  console.log('Browser connected:', trendRes.status);

  // Navigate directly to event page via WebSocket
  const eventUrl = 'https://www.stubhub.com/bad-bunny-barcelona-tickets-5-22-2026/event/158171526/';
  ws.send(JSON.stringify({ type: 'navigate', url: eventUrl }));
  await new Promise(r => setTimeout(r, 10000));

  // Use performer-events route but with the event URL to evaluate its DOM
  // This navigates TO the event URL and evaluates it
  const eventDomRes = await fetch(
    `http://localhost:3001/api/stubhub/performer-events?url=${encodeURIComponent(eventUrl)}`
  );
  const eventDom = await eventDomRes.json() as Record<string, unknown>;

  console.log('\n=== Event page DOM inspection ===');
  console.log('type:', eventDom.type);
  console.log('URL:', eventDom.url);
  console.log('title:', eventDom.title);

  if (eventDom.type === 'fallback') {
    const bodyText = eventDom.bodyText as string;
    console.log('\nbodyText length:', bodyText.length);

    // Parse listings from body text using regex
    // Pattern: "Section XXX Row N ...S/.NNN N.N Amazing/Great/Good"
    const listingMatches = bodyText.matchAll(/(?:Preview|S\/\.)?(Section\s+\d+)\s+Row\s+(\d+)[^S]*S\/\.([\d,]+)/g);
    const parsed = Array.from(listingMatches).map(m => ({
      section: m[1],
      row: m[2],
      pricePEN: m[3],
    }));
    console.log(`\nParsed listings: ${parsed.length}`);
    parsed.slice(0, 10).forEach(l => console.log(`  ${l.section} Row ${l.row}: S/.${l.pricePEN}`));

    // Also find the "Golden Circle" and other named sections
    const gcMatch = bodyText.match(/Golden Circle[^S]*S\/(\.[\d,]+)/);
    if (gcMatch) console.log(`  Golden Circle: ${gcMatch[1]}`);

    // Check for any JSON-like patterns in the text
    const jsonPattern = bodyText.match(/"listings"\s*:\s*\[/);
    if (jsonPattern) console.log('Found "listings" JSON in body text!');

    // Count listings
    const previewCount = (bodyText.match(/Preview/g) ?? []).length;
    console.log(`\n"Preview" occurrences: ${previewCount}`);
    console.log('(Each listing card has a "Preview" button, so ~= number of listings)');
  }

  // Now let me add a proper /listings route — let's update routes.ts
  // First, check what the raw DOM looks like with CSS selectors
  // We need to examine the actual HTML to find the right selectors
  // Let me get the HTML of the event page via a custom evaluate

  // Add a route that uses page.evaluate with listing-specific selectors
  console.log('\n=== Direct DOM evaluation via /api/stubhub/performer-events ===');
  // The performer-events route navigates then evaluates
  // It currently looks for /event/ links — on the event page, those links ARE present (other events)
  const res2 = await fetch(
    `http://localhost:3001/api/stubhub/performer-events?url=${encodeURIComponent(eventUrl)}`
  );
  const data2 = await res2.json() as Record<string, unknown>;
  if (data2.type === 'event-links') {
    const links = data2.events as Array<{href: string; text: string}>;
    console.log('Event links on event page:', links.length);
    links.slice(0, 5).forEach(l => console.log(`  ${l.href.slice(0, 80)} | ${l.text?.slice(0, 50)}`));
  }

  ws.close();
}

run().catch(console.error);
