/**
 * StubHub route testing — connect browser then call routes
 */

import WebSocket from 'ws';

async function run() {
  console.log('=== Testing StubHub Routes ===');

  // Connect browser to StubHub (acquires WAF cookies)
  const ws = new WebSocket('ws://localhost:3001/browser/stream?profile=stubhub&url=https://www.stubhub.com');
  ws.on('error', (err: Error) => console.error('[WS]', err.message));

  let ready = false;
  ws.on('message', (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'ready') {
        ready = true;
        console.log('[Browser] Ready, reused:', msg.reused);
      }
    } catch {}
  });

  // Wait for browser ready + WAF cookies
  console.log('Connecting browser...');
  await new Promise(r => setTimeout(r, 10000));

  if (!ready) {
    console.log('⚠ Browser not ready yet, continuing anyway...');
  }

  // 1. Test trending
  console.log('\n[1] GET /api/stubhub/trending');
  const trendingRes = await fetch('http://localhost:3001/api/stubhub/trending');
  const trending = await trendingRes.json() as Record<string, unknown>;
  console.log('Status:', trendingRes.status);
  if (trending.events && Array.isArray(trending.events)) {
    console.log(`✓ Got ${trending.events.length} events`);
    const ev = trending.events[0] as Record<string, unknown>;
    console.log('Event[0] keys:', Object.keys(ev).join(', '));
    console.log('Event[0]:', JSON.stringify(ev).slice(0, 300));
  } else {
    console.log('Response:', JSON.stringify(trending).slice(0, 500));
  }

  // 2. Test search
  console.log('\n[2] GET /api/stubhub/search?q=bad+bunny');
  const searchRes = await fetch('http://localhost:3001/api/stubhub/search?q=bad+bunny');
  const search = await searchRes.json() as Record<string, unknown>;
  console.log('Status:', searchRes.status);
  console.log('_source:', search._source);

  if (search.events && Array.isArray(search.events)) {
    console.log(`✓ Got ${search.events.length} events from ${search._source}`);
    const ev0 = search.events[0] as Record<string, unknown>;
    console.log('Event[0] keys:', Object.keys(ev0).join(', '));
    console.log('Event[0]:', JSON.stringify(ev0).slice(0, 400));
  } else if (search._propKeys) {
    console.log('pageProps keys from SSR:', search._propKeys);
    // Show the full pageProps for inspection
    const pp = search.pageProps as Record<string, unknown>;
    if (pp) {
      for (const [k, v] of Object.entries(pp)) {
        const vStr = JSON.stringify(v);
        console.log(`  ${k}: ${vStr.slice(0, 150)}`);
      }
    }
  } else if (search._preview) {
    console.log('HTML preview (first 1000 chars):');
    console.log((search._preview as string).slice(0, 1000));
  } else {
    console.log('Full response:', JSON.stringify(search).slice(0, 1000));
  }

  ws.close();
  console.log('\nDone.');
}

run().catch(console.error);
