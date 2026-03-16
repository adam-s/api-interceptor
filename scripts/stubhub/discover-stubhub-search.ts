/**
 * StubHub API Discovery — Phase 4: Find search method + full response
 *
 * Known: POST /?method=DontMissEvents returns events JSON
 * Goal: enumerate all ?method= values, find search method, get full response bodies
 */

import WebSocket from 'ws';

async function run() {
  console.log('=== StubHub Search Method Discovery ===');

  // Clear traffic
  await fetch('http://localhost:3001/browser/traffic', { method: 'DELETE' });

  // Connect browser
  const ws = new WebSocket('ws://localhost:3001/browser/stream?profile=stubhub&url=https://www.stubhub.com');
  ws.on('error', (err: Error) => console.error('[WS]', err.message));
  ws.on('message', (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'navigate') console.log('[WS] Navigate event:', msg.url);
    } catch {}
  });

  // Wait for homepage to load fully
  await new Promise(r => setTimeout(r, 10000));

  // 1. Get ALL ?method= entries from homepage traffic with full bodies
  const trafficRes = await fetch('http://localhost:3001/browser/traffic');
  const traffic = await trafficRes.json() as {
    entries: Array<{method: string; url: string; status: number; requestBody?: unknown; responseBody?: unknown}>
  };

  console.log('\n=== All ?method= calls on homepage ===');
  const methodCalls = traffic.entries.filter(e => e.url.includes('method=') && e.url.includes('stubhub.com'));
  console.log(`Found ${methodCalls.length} ?method= calls`);

  methodCalls.forEach(e => {
    const urlObj = new URL(e.url);
    const methodName = urlObj.searchParams.get('method');
    const params = Object.fromEntries(urlObj.searchParams.entries());
    delete params.method;
    console.log(`\n  Method: ${methodName}`);
    console.log(`  Params: ${JSON.stringify(params)}`);
    const body = e.responseBody as Record<string, unknown> | null;
    if (body && typeof body === 'object') {
      const keys = Object.keys(body);
      console.log(`  Response keys: ${keys.join(', ')}`);
      if (body.items && Array.isArray(body.items) && body.items.length > 0) {
        const item = body.items[0] as Record<string, unknown>;
        console.log(`  Item[0] keys: ${Object.keys(item).join(', ')}`);
      }
    }
  });

  // 2. Now navigate to search page via the browser
  console.log('\n=== Navigating to search via browser ===');
  await fetch('http://localhost:3001/browser/traffic', { method: 'DELETE' });

  // Use the navigate endpoint if available
  try {
    const navRes = await fetch('http://localhost:3001/browser/navigate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.stubhub.com/secure/Search?q=bad+bunny' }),
    });
    console.log('Navigate response:', navRes.status, await navRes.text().catch(() => ''));
  } catch (e) {
    console.log('Navigate endpoint not available:', (e as Error).message);
  }

  await new Promise(r => setTimeout(r, 12000));

  const searchTrafficRes = await fetch('http://localhost:3001/browser/traffic');
  const searchTraffic = await searchTrafficRes.json() as typeof traffic;
  console.log(`\nSearch page traffic: ${searchTraffic.entries.length} entries`);

  // Show all ?method= calls fired during search
  const searchMethodCalls = searchTraffic.entries.filter(e => e.url.includes('method=') && e.url.includes('stubhub.com'));
  console.log(`?method= calls during search navigation: ${searchMethodCalls.length}`);
  searchMethodCalls.forEach(e => {
    const urlObj = new URL(e.url);
    const methodName = urlObj.searchParams.get('method');
    console.log(`  Method: ${methodName} — ${e.url.slice(0, 150)}`);
    const body = e.responseBody as Record<string, unknown> | null;
    if (body && typeof body === 'object') {
      console.log(`  Response keys: ${Object.keys(body).join(', ')}`);
      if (body.events) console.log(`  events count: ${(body.events as unknown[]).length}`);
      if (body.items) console.log(`  items count: ${(body.items as unknown[]).length}`);
    }
  });

  // 3. Try common search method names directly via the proxy
  console.log('\n=== Testing ?method= search variants directly ===');
  const searchMethods = [
    'SearchResults',
    'Search',
    'EventSearch',
    'SearchEvents',
    'GetEvents',
    'PerformerEvents',
    'GetSearchResults',
  ];

  for (const method of searchMethods) {
    const url = `https://www.stubhub.com/?method=${method}&q=bad+bunny&maxRows=3&page=0`;
    try {
      const proxyRes = await fetch('http://localhost:3001/browser/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, method: 'POST' }),
      });
      const data = await proxyRes.json().catch(() => null);
      if (data && typeof data === 'object' && !('error' in data)) {
        const keys = Object.keys(data as object);
        console.log(`  ✓ ${method}: keys=${keys.join(', ')}`);
        if ((data as Record<string, unknown>).items) {
          console.log(`    items[0]: ${JSON.stringify((data as { items: unknown[] }).items[0]).slice(0, 200)}`);
        }
      } else {
        console.log(`  ✗ ${method}: ${JSON.stringify(data).slice(0, 100)}`);
      }
    } catch (e) {
      console.log(`  ✗ ${method}: ${(e as Error).message}`);
    }
  }

  // 4. Get the full search page HTML body to detect SSR pattern
  console.log('\n=== Getting search page HTML via proxy ===');
  try {
    const htmlRes = await fetch('http://localhost:3001/browser/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.stubhub.com/secure/Search?q=bad+bunny', method: 'GET' }),
    });
    const htmlData = await htmlRes.json().catch(() => null);
    if (typeof htmlData === 'string') {
      console.log('HTML length:', htmlData.length);
      console.log('First 500 chars:', htmlData.slice(0, 500));
      // Check for __NEXT_DATA__
      if (htmlData.includes('__NEXT_DATA__')) {
        const match = htmlData.match(/<script id="__NEXT_DATA__"[^>]*>({.+?})<\/script>/s);
        if (match) {
          try {
            const nextData = JSON.parse(match[1]);
            console.log('\n__NEXT_DATA__ props keys:', Object.keys(nextData.props || {}));
            const pageProps = nextData.props?.pageProps || {};
            console.log('pageProps keys:', Object.keys(pageProps));
          } catch {}
        }
      }
    } else {
      console.log('Non-string response:', JSON.stringify(htmlData).slice(0, 200));
    }
  } catch (e) {
    console.log('HTML proxy error:', (e as Error).message);
  }

  ws.close();
}

run().catch(console.error);
