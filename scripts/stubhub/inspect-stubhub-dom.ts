/**
 * Inspect StubHub search page DOM to find the right CSS selectors and data structure
 */

import WebSocket from 'ws';

async function run() {
  console.log('=== StubHub DOM Inspection ===');

  const ws = new WebSocket('ws://localhost:3001/browser/stream?profile=stubhub&url=https://www.stubhub.com');
  ws.on('error', (err: Error) => console.error('[WS]', err.message));
  ws.on('message', (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'url') console.log('[URL]', msg.url);
    } catch {}
  });

  // Connect and navigate to search
  await new Promise(r => setTimeout(r, 10000));
  ws.send(JSON.stringify({ type: 'navigate', url: 'https://www.stubhub.com/secure/Search?q=bad+bunny' }));
  await new Promise(r => setTimeout(r, 8000));

  // Make a direct curl call to the search route to get the current DOM state
  const res = await fetch('http://localhost:3001/api/stubhub/search?q=bad+bunny');
  const data = await res.json() as Record<string, unknown>;
  console.log('Search response type:', data.type);
  console.log('URL from page:', data.url);
  console.log('\nbodyText (first 2000):', ((data.bodyText as string) ?? '').slice(0, 2000));

  // Now do a deep DOM inspection via a custom evaluate
  // We need to call a fresh route that does deeper inspection
  // Let's use the raw navigate + inspect approach

  // Check what the page actually looks like
  console.log('\n=== Deep DOM Inspection ===');

  // Connect to the server and run an inspection
  const inspectRes = await fetch('http://localhost:3001/api/stubhub/search?q=bad+bunny', {
    headers: { 'X-Inspect': 'true' }
  });
  // ... same route for now

  // Let's check the href patterns on the page by looking at anchor links
  // We can do this by checking the route's "fallback" response which includes body text
  // The key insight: body shows "Bad Bunny Concert Tickets • 29 events"
  // Let's look for anchor tags with StubHub search URLs

  ws.close();
}

run().catch(console.error);
