/**
 * StubHub Phase 7: Performer page discovery
 * Navigate to Bad Bunny performer page, capture API calls, find event listing API
 */

import WebSocket from 'ws';

async function run() {
  console.log('=== StubHub Performer Page Discovery ===');

  const ws = new WebSocket('ws://localhost:3001/browser/stream?profile=stubhub&url=https://www.stubhub.com');
  ws.on('error', (err: Error) => console.error('[WS]', err.message));
  ws.on('message', (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'url') console.log('[URL]', msg.url);
    } catch {}
  });

  await new Promise(r => setTimeout(r, 8000));

  // Navigate to Bad Bunny performer page
  await fetch('http://localhost:3001/browser/traffic', { method: 'DELETE' });
  const performerUrl = 'https://www.stubhub.com/bad-bunny-tickets/performer/1522458';
  ws.send(JSON.stringify({ type: 'navigate', url: performerUrl }));
  console.log(`\nNavigating to: ${performerUrl}`);
  await new Promise(r => setTimeout(r, 12000));

  const trafficRes = await fetch('http://localhost:3001/browser/traffic');
  const traffic = await trafficRes.json() as {
    entries: Array<{method: string; url: string; status: number; requestBody?: unknown; responseBody?: unknown}>
  };

  console.log(`\nTraffic entries: ${traffic.entries.length}`);
  traffic.entries.forEach(e => {
    const bodyLen = JSON.stringify(e.responseBody ?? '').length;
    console.log(`  ${e.method} ${e.status} ${e.url.slice(0, 130)} [${bodyLen}b]`);
  });

  // Look for ?method= calls
  const methodCalls = traffic.entries.filter(e => e.url.includes('?method=') && e.url.includes('stubhub'));
  console.log(`\n?method= calls on performer page: ${methodCalls.length}`);
  methodCalls.forEach(e => {
    const url = new URL(e.url);
    const methodName = url.searchParams.get('method');
    console.log(`\n  Method: ${methodName}`);
    console.log(`  URL: ${e.url.slice(0, 200)}`);
    const body = e.responseBody as Record<string, unknown>;
    if (body && typeof body === 'object') {
      const keys = Object.keys(body);
      console.log(`  Response keys: ${keys.join(', ')}`);
      if (body.items) {
        const items = body.items as unknown[];
        console.log(`  items count: ${items.length}`);
        console.log(`  items[0]: ${JSON.stringify(items[0]).slice(0, 400)}`);
      }
    }
  });

  // Look for any API/JSON calls (not just ?method=)
  const jsonCalls = traffic.entries.filter(e =>
    !e.url.includes('?method=') &&
    !e.url.includes('jsa/v1') &&
    !e.url.includes('.net/iae') &&
    !e.url.includes('secure/rv') &&
    !e.url.includes('.jpg') &&
    !e.url.includes('.png') &&
    !e.url.includes('.css') &&
    !e.url.includes('.js') &&
    e.url.includes('stubhub')
  );

  if (jsonCalls.length > 0) {
    console.log('\nOther stubhub API calls:');
    jsonCalls.forEach(e => {
      const bodyLen = JSON.stringify(e.responseBody ?? '').length;
      console.log(`  ${e.method} ${e.status} ${e.url.slice(0, 150)} [${bodyLen}b]`);
      if (e.responseBody && typeof e.responseBody === 'object') {
        const keys = Object.keys(e.responseBody as object);
        if (keys.length < 20) console.log(`    keys: ${keys.join(', ')}`);
      }
    });
  }

  ws.close();
}

run().catch(console.error);
