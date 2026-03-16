/**
 * StubHub Phase 8: Deep performer page API inspection
 * Check GetCarouselItems trendingEventsCarousel + try performer event methods
 */

import WebSocket from 'ws';

async function run() {
  console.log('=== StubHub Performer API Deep Dive ===');

  const ws = new WebSocket('ws://localhost:3001/browser/stream?profile=stubhub&url=https://www.stubhub.com');
  ws.on('error', (err: Error) => console.error('[WS]', err.message));

  await new Promise(r => setTimeout(r, 8000));

  // Navigate to performer page, capture traffic
  await fetch('http://localhost:3001/browser/traffic', { method: 'DELETE' });
  ws.send(JSON.stringify({ type: 'navigate', url: 'https://www.stubhub.com/bad-bunny-tickets/performer/1522458' }));
  await new Promise(r => setTimeout(r, 12000));

  const trafficRes = await fetch('http://localhost:3001/browser/traffic');
  const traffic = await trafficRes.json() as {
    entries: Array<{method: string; url: string; status: number; requestBody?: unknown; responseBody?: unknown}>
  };

  // 1. Inspect GetCarouselItems full response
  const carouselEntry = traffic.entries.find(e => e.url.includes('method=GetCarouselItems'));
  if (carouselEntry) {
    const body = carouselEntry.responseBody as Record<string, unknown>;
    console.log('\n=== GetCarouselItems response ===');
    console.log('Keys:', Object.keys(body).join(', '));

    if (body.trendingEventsCarousel) {
      const carousel = body.trendingEventsCarousel as Record<string, unknown>;
      console.log('\ntrendingEventsCarousel keys:', Object.keys(carousel).join(', '));
      if (carousel.items) {
        const items = carousel.items as Array<Record<string, unknown>>;
        console.log(`items count: ${items.length}`);
        if (items[0]) {
          console.log('items[0] keys:', Object.keys(items[0]).join(', '));
          console.log('items[0]:', JSON.stringify(items[0]).slice(0, 400));
        }
      } else {
        console.log('trendingEventsCarousel:', JSON.stringify(carousel).slice(0, 500));
      }
    }
  }

  // 2. Inspect getpositionalcontent response
  const positionalEntry = traffic.entries.find(e => e.url.includes('getpositionalcontent'));
  if (positionalEntry) {
    console.log('\n=== getpositionalcontent response ===');
    const body = positionalEntry.responseBody as Record<string, unknown>;
    if (body && typeof body === 'object') {
      console.log('Keys:', Object.keys(body).join(', '));
      console.log('Full (500):', JSON.stringify(body).slice(0, 500));
    }
  }

  // 3. Try performer-specific ?method= calls directly via browserFetch (same-origin)
  console.log('\n=== Testing performer page ?method= variants ===');
  const basePerformerUrl = 'https://www.stubhub.com/bad-bunny-tickets/performer/1522458';
  const performerMethods = [
    'PerformerEvents',
    'GetEvents',
    'EventList',
    'GetPerformerEvents',
    'PerformerPageEvents',
    'GetSchedule',
    'GetUpcomingEvents',
  ];

  for (const method of performerMethods) {
    try {
      const result = await fetch(`http://localhost:3001/api/stubhub/trending`); // Just to keep browser alive
      // Actually test via browserFetch by calling the search route
      // We need a custom way to call browserFetch — let's use the route mechanism
      // For now, check the root URL method API
      const url = `${basePerformerUrl}?method=${method}&categoryId=45840&maxRows=10&page=0`;
      const res = await fetch('http://localhost:3001/api/stubhub/search?q=__method_test__');
      void res; // just keep connection alive
      console.log(`  Trying ${method}...`);
    } catch {}
  }

  // 4. Try root URL ?method= with performerId
  console.log('\n=== Testing root URL ?method= with performerId ===');
  // These need to run through the browser context — let's navigate back to homepage first
  ws.send(JSON.stringify({ type: 'navigate', url: 'https://www.stubhub.com' }));
  await new Promise(r => setTimeout(r, 5000));
  await fetch('http://localhost:3001/browser/traffic', { method: 'DELETE' });

  // Navigate to performer page then check what fires
  ws.send(JSON.stringify({ type: 'navigate', url: basePerformerUrl }));
  await new Promise(r => setTimeout(r, 8000));

  // Use page evaluate to try root API methods directly
  const testRes = await fetch('http://localhost:3001/api/stubhub/search?q=bad+bunny');
  const testData = await testRes.json() as Record<string, unknown>;
  console.log('\nPage URL:', testData.url);
  console.log('Performer links found:', (testData.performerLinks as unknown[])?.length ?? 0);

  // 5. Inspect DOM of performer page
  console.log('\n=== Performer page DOM inspection ===');
  const trafficRes2 = await fetch('http://localhost:3001/browser/traffic');
  const traffic2 = await trafficRes2.json() as typeof traffic;
  console.log(`Traffic entries: ${traffic2.entries.length}`);
  traffic2.entries.forEach(e => {
    const bodyLen = JSON.stringify(e.responseBody ?? '').length;
    console.log(`  ${e.method} ${e.status} ${e.url.slice(0, 130)} [${bodyLen}b]`);
  });

  ws.close();
}

run().catch(console.error);
