/**
 * StubHub Phase 11: Discover ticket listings API on event detail page
 * Navigate to a Bad Bunny event, capture all API calls that fire
 */

import WebSocket from 'ws';

async function run() {
  console.log('=== StubHub Ticket Listings Discovery ===');

  // Connect to homepage first
  const ws = new WebSocket('ws://localhost:3001/browser/stream?profile=stubhub&url=https://www.stubhub.com');
  ws.on('error', (err: Error) => console.error('[WS]', err.message));
  ws.on('message', (d: Buffer) => {
    try { const m = JSON.parse(d.toString()); if (m.type === 'url') console.log('[URL]', m.url); } catch {}
  });

  await new Promise(r => setTimeout(r, 8000));

  // Navigate to Bad Bunny Barcelona event
  const eventUrl = 'https://www.stubhub.com/bad-bunny-barcelona-tickets-5-22-2026/event/158171526/';
  await fetch('http://localhost:3001/browser/traffic', { method: 'DELETE' });
  ws.send(JSON.stringify({ type: 'navigate', url: eventUrl }));
  console.log(`\nNavigating to event: ${eventUrl}`);
  await new Promise(r => setTimeout(r, 15000));

  const trafficRes = await fetch('http://localhost:3001/browser/traffic');
  const traffic = await trafficRes.json() as {
    entries: Array<{method: string; url: string; status: number; requestBody?: unknown; responseBody?: unknown}>
  };

  console.log(`\nTraffic entries: ${traffic.entries.length}`);
  traffic.entries.forEach(e => {
    const bodyLen = JSON.stringify(e.responseBody ?? '').length;
    console.log(`  ${e.method} ${e.status} ${e.url.slice(0, 140)} [${bodyLen}b]`);
  });

  // Show ?method= calls in detail
  const methodCalls = traffic.entries.filter(e => e.url.includes('?method=') && e.url.includes('stubhub'));
  console.log(`\n?method= calls: ${methodCalls.length}`);
  methodCalls.forEach(e => {
    const url = new URL(e.url);
    const methodName = url.searchParams.get('method');
    const body = e.responseBody as Record<string, unknown>;
    console.log(`\n  Method: ${methodName}`);
    console.log(`  URL: ${e.url.slice(0, 200)}`);
    if (body && typeof body === 'object') {
      const keys = Object.keys(body);
      console.log(`  Keys: ${keys.join(', ')}`);
      if (body.listings || body.items || body.tickets) {
        const arr = (body.listings ?? body.items ?? body.tickets) as unknown[];
        console.log(`  Count: ${arr.length}`);
        if (arr[0]) {
          const item = arr[0] as Record<string, unknown>;
          console.log(`  [0] keys: ${Object.keys(item).join(', ')}`);
          console.log(`  [0]: ${JSON.stringify(item).slice(0, 400)}`);
        }
      } else {
        console.log(`  Data: ${JSON.stringify(body).slice(0, 300)}`);
      }
    }
  });

  // Show non-method API calls
  const apiCalls = traffic.entries.filter(e =>
    !e.url.includes('?method=') &&
    !e.url.includes('jsa/v1') &&
    !e.url.includes('.net/iae') &&
    !e.url.includes('secure/rv') &&
    !e.url.includes('.jpg') && !e.url.includes('.png') && !e.url.includes('.css') && !e.url.includes('.js') &&
    !e.url.includes('spotify') &&
    (e.url.includes('stubhub') || e.url.includes('viagogo'))
  );

  if (apiCalls.length > 0) {
    console.log('\nOther API calls:');
    apiCalls.forEach(e => {
      const bodyLen = JSON.stringify(e.responseBody ?? '').length;
      console.log(`  ${e.method} ${e.status} ${e.url.slice(0, 150)} [${bodyLen}b]`);
      const body = e.responseBody;
      if (body && typeof body === 'object' && !('_truncated' in (body as object))) {
        const keys = Object.keys(body as object);
        if (keys.length < 20) console.log(`    keys: ${keys.join(', ')}`);
        // Check for listing-like data
        const bodyStr = JSON.stringify(body);
        if (bodyStr.includes('price') || bodyStr.includes('listingId') || bodyStr.includes('section')) {
          console.log(`    ✓ Contains price/listing data!`);
          console.log(`    Preview: ${bodyStr.slice(0, 500)}`);
        }
      }
    });
  }

  ws.close();
}

run().catch(console.error);
