/**
 * StubHub Phase 9: Read performer page DOM for event links + try method=PerformerEvents
 */

import WebSocket from 'ws';

async function run() {
  console.log('=== StubHub Performer DOM + Method Tests ===');

  const ws = new WebSocket('ws://localhost:3001/browser/stream?profile=stubhub&url=https://www.stubhub.com/bad-bunny-tickets/performer/1522458');
  ws.on('error', (err: Error) => console.error('[WS]', err.message));

  await new Promise(r => setTimeout(r, 12000));

  // 1. Read DOM for event links on the performer page
  const searchRes = await fetch('http://localhost:3001/api/stubhub/search?q=bad+bunny');
  const searchData = await searchRes.json() as Record<string, unknown>;
  console.log('Current URL:', searchData.url);

  // Performer page was loaded — let's get event links by reading DOM directly
  // Use the trending route as a proxy to check browser is connected
  const trendRes = await fetch('http://localhost:3001/api/stubhub/trending');
  console.log('Browser connected:', trendRes.status);

  // 2. Try performer page-specific methods
  // POST to the performer page URL with different method names
  console.log('\n=== Testing performer page method= variants ===');
  const performerUrl = 'https://www.stubhub.com/bad-bunny-tickets/performer/1522458';
  const performerMethods = [
    { method: 'PerformerEvents', params: '&page=0&maxRows=10' },
    { method: 'GetEvents', params: '&page=0&maxRows=10' },
    { method: 'PerformerUpcomingEvents', params: '&page=0&maxRows=10' },
    { method: 'GetPerformerEvents', params: '&performerId=1522458&page=0&maxRows=10' },
    { method: 'GetEventList', params: '&page=0&maxRows=10' },
    { method: 'GetCarouselItems', params: '&categoryId=45840&performerCarousel=true&page=0&maxRows=10' },
  ];

  for (const { method, params } of performerMethods) {
    const url = `${performerUrl}?method=${method}${params}`;
    try {
      // We need to call via browserFetch — use the trending handler as a proxy approach
      // Actually let's just check via the traffic what fires after we simulate a POST
      // We can't directly call these without a browser context route
      // Let's navigate + inspect
      ws.send(JSON.stringify({ type: 'navigate', url }));
      await new Promise(r => setTimeout(r, 2000));
      const trafficRes = await fetch('http://localhost:3001/browser/traffic');
      const traffic = await trafficRes.json() as { entries: Array<{url: string; status: number}> };
      const lastEntry = traffic.entries[traffic.entries.length - 1];
      if (lastEntry) {
        console.log(`  ${method}: navigated, last traffic: ${lastEntry.status} ${lastEntry.url.slice(0, 100)}`);
      }
    } catch (e) {
      console.log(`  ${method}: error: ${(e as Error).message}`);
    }
  }

  // 3. Try the root URL methods with performerId
  console.log('\n=== Testing root URL methods with performerId=1522458 ===');
  ws.send(JSON.stringify({ type: 'navigate', url: 'https://www.stubhub.com' }));
  await new Promise(r => setTimeout(r, 4000));

  await fetch('http://localhost:3001/browser/traffic', { method: 'DELETE' });
  // Navigate back to performer page
  ws.send(JSON.stringify({ type: 'navigate', url: performerUrl }));
  await new Promise(r => setTimeout(r, 8000));

  // Try POST to root with performerId
  // We have the browser on performer page — use browserFetch via trending route's mechanism
  // Actually let me check the performer page DOM more carefully
  const trafficRes = await fetch('http://localhost:3001/browser/traffic');
  const traffic = await trafficRes.json() as {
    entries: Array<{method: string; url: string; status: number; responseBody?: unknown}>
  };

  // Show ALL ?method= calls with full details
  const allMethodCalls = traffic.entries.filter(e => e.url.includes('?method=') || e.url.includes('&method='));
  console.log(`\n?method= calls on performer page: ${allMethodCalls.length}`);
  allMethodCalls.forEach(e => {
    const url = new URL(e.url);
    const methodName = url.searchParams.get('method');
    const body = e.responseBody as Record<string, unknown>;
    console.log(`\n  ${e.method} ${methodName}`);
    console.log(`  URL: ${e.url.slice(0, 200)}`);
    if (body && typeof body === 'object') {
      const keys = Object.keys(body);
      console.log(`  keys: ${keys.join(', ')}`);
      // Inspect each key for event data
      for (const [k, v] of Object.entries(body)) {
        if (v && typeof v === 'object') {
          const vObj = v as Record<string, unknown>;
          if (vObj.items && Array.isArray(vObj.items) && vObj.items.length > 0) {
            const items = vObj.items as Array<Record<string, unknown>>;
            console.log(`  ${k}.items[0]: ${JSON.stringify(items[0]).slice(0, 200)}`);
          }
        }
      }
    }
  });

  // 4. Check performer page DOM for event links
  console.log('\n=== Performer page DOM event links ===');
  // Use search route (it evaluates the current page)
  const domRes = await fetch('http://localhost:3001/api/stubhub/search?q=bad+bunny');
  const domData = await domRes.json() as Record<string, unknown>;
  const performerLinks = domData.performerLinks as Array<{href: string; text: string}>;
  if (performerLinks) {
    // Find event detail links
    const eventLinks = performerLinks.filter(l => l.href?.includes('/event/'));
    console.log(`Event links found: ${eventLinks.length}`);
    eventLinks.slice(0, 10).forEach(l => {
      console.log(`  ${l.href.slice(0, 100)} | ${l.text?.slice(0, 60)}`);
    });

    // Check for performer page links
    const allLinks = performerLinks;
    console.log(`\nAll StubHub links (${allLinks.length}):`);
    allLinks.slice(0, 15).forEach(l => {
      console.log(`  ${l.href.slice(0, 120)} | ${l.text?.slice(0, 50)}`);
    });
  }

  ws.close();
}

run().catch(console.error);
