/**
 * StubHub Phase 10: Get the actual Bad Bunny event list from performer page
 * - Navigate to performer page
 * - Inspect full body for event links and data
 * - Check getpositionalcontent response
 * - Find the event listing API
 */

import WebSocket from 'ws';

async function run() {
  console.log('=== StubHub Event List Discovery ===');

  // Navigate directly to performer page from the start
  const ws = new WebSocket('ws://localhost:3001/browser/stream?profile=stubhub&url=https://www.stubhub.com/bad-bunny-tickets/performer/1522458');
  ws.on('error', (err: Error) => console.error('[WS]', err.message));
  ws.on('message', (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'url') console.log('[URL]', msg.url);
      if (msg.type === 'ready') console.log('[Ready] profile:', msg.profile);
    } catch {}
  });

  // Wait for page to fully load
  console.log('Loading performer page...');
  await new Promise(r => setTimeout(r, 15000));

  // 1. Capture current traffic
  await fetch('http://localhost:3001/browser/traffic', { method: 'DELETE' });
  ws.send(JSON.stringify({ type: 'navigate', url: 'https://www.stubhub.com/bad-bunny-tickets/performer/1522458' }));
  await new Promise(r => setTimeout(r, 12000));

  const trafficRes = await fetch('http://localhost:3001/browser/traffic');
  const traffic = await trafficRes.json() as {
    entries: Array<{method: string; url: string; status: number; requestBody?: unknown; responseBody?: unknown}>
  };

  // Check getpositionalcontent full response
  const positionalEntry = traffic.entries.find(e => e.url.includes('getpositionalcontent'));
  if (positionalEntry) {
    console.log('\n=== getpositionalcontent ===');
    console.log('URL:', positionalEntry.url);
    const body = positionalEntry.responseBody;
    console.log('Body:', JSON.stringify(body).slice(0, 2000));
  }

  // 2. Use a test route to inspect performer page DOM
  // We need to add a performer route — let's use fetch to the trending endpoint
  // which uses browserFetch and the browser is on the performer page

  // Actually, let's use the DontMissEvents API with the performer's categoryId
  // categoryId=45840 is Bad Bunny's category
  console.log('\n=== Testing DontMissEvents for Bad Bunny category ===');
  const dmeRes = await fetch('http://localhost:3001/api/stubhub/trending?maxRows=20');
  const dme = await dmeRes.json() as Record<string, unknown>;
  console.log('Trending response:', JSON.stringify(dme).slice(0, 300));

  // 3. Try performer-specific API calls from browser context
  // The browser is on the performer page, so these POST calls will have performer cookies
  console.log('\n=== Testing performer methods via direct POST from browser ===');
  // Call /api/stubhub/categories to check if it returns performer events
  const catRes = await fetch('http://localhost:3001/api/stubhub/categories?categoryId=45840');
  const cat = await catRes.json() as Record<string, unknown>;
  console.log('categories (Bad Bunny categoryId=45840):', JSON.stringify(cat).slice(0, 300));

  // 4. Use page.evaluate to inspect performer page body
  // Let me create a temp route by calling the search endpoint with a special query
  // that navigates to a URL first. Actually I can't do that without changing the route.

  // Instead, let me use the GetCarouselItems method on the performer page
  // and also inspect the body HTML for event data directly

  // The performer page HTML is SSR. Let me get a larger slice of it.
  // I'll POST to the performer page with method=GetCarouselItems and look at ALL items
  const carouselEntry = traffic.entries.find(e => e.url.includes('GetCarouselItems'));
  if (carouselEntry) {
    const body = carouselEntry.responseBody as Record<string, unknown>;
    console.log('\n=== GetCarouselItems full response ===');
    Object.entries(body).forEach(([k, v]) => {
      console.log(`\n  ${k}:`);
      if (v && typeof v === 'object') {
        const carousel = v as Record<string, unknown>;
        console.log(`  keys: ${Object.keys(carousel).join(', ')}`);
        if (Array.isArray(carousel.items)) {
          console.log(`  items count: ${carousel.items.length}`);
          carousel.items.slice(0, 2).forEach((item: unknown, i: number) => {
            const ev = item as Record<string, unknown>;
            console.log(`  items[${i}]: eventName=${ev.eventName}, eventId=${ev.eventId}, url=${String(ev.url).slice(0, 80)}`);
          });
        } else {
          console.log(`  value: ${JSON.stringify(carousel).slice(0, 200)}`);
        }
      }
    });
  }

  // 5. Get the performer page HTML and find event list items
  console.log('\n=== Performer page HTML analysis ===');
  // Navigate back to performer page without the search route re-navigating
  // Call categories route (which uses ?method=MostPopularCategories, keeps browser connected)
  const keepAlive = await fetch('http://localhost:3001/api/stubhub/categories?categoryId=45840');
  void keepAlive;

  // Now look at all traffic that mentions events
  const allTraffic = traffic.entries;
  console.log(`Total traffic entries: ${allTraffic.length}`);

  // Check the HTML of the performer page entry
  const htmlEntry = allTraffic.find(e => e.url === 'https://www.stubhub.com/bad-bunny-tickets/performer/1522458');
  if (htmlEntry) {
    const body = htmlEntry.responseBody as Record<string, unknown>;
    console.log('Performer page HTML entry:');
    if (body._truncated) {
      console.log(`  Truncated at 50KB, full size: ${body._size} bytes`);
      console.log(`  Preview (first 500 of body):`);
      const preview = body._preview as string;
      // The preview is a JSON string of the HTML — parse it
      try {
        const htmlStr = JSON.parse(preview) as string;
        // Skip to body
        const bodyStart = htmlStr.indexOf('<body');
        console.log(`  Body starts at: ${bodyStart}`);
        const bodyHtml = htmlStr.slice(bodyStart, bodyStart + 2000);
        console.log(bodyHtml.slice(0, 1000));
      } catch {
        console.log(preview.slice(0, 1000));
      }
    }
  }

  ws.close();
}

run().catch(console.error);
