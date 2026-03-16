/**
 * StubHub API Discovery — Phase 3: Test ?method= API directly
 *
 * Homepage revealed: POST /?method=DontMissEvents returns {items: [...events]}
 * Goal: find a search method, capture full event data shape, find listings endpoint
 */

import WebSocket from 'ws';

async function browserFetch(url: string, options: { method?: string; body?: unknown } = {}) {
  const res = await fetch(`http://localhost:3001/browser/proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, ...options }),
  });
  return res.json();
}

async function run() {
  console.log('=== StubHub ?method= API Investigation ===');

  await fetch('http://localhost:3001/browser/traffic', { method: 'DELETE' });

  // Keep browser connected
  const ws = new WebSocket('ws://localhost:3001/browser/stream?profile=stubhub&url=https://www.stubhub.com');
  ws.on('error', (err: Error) => console.error('[WS]', err.message));
  await new Promise(r => setTimeout(r, 8000));

  // Test the root ?method= API endpoint directly via proxy
  // These use POST to the root URL with method as query param
  const baseUrl = 'https://www.stubhub.com/';

  // 1. Test DontMissEvents (known to work from homepage traffic)
  console.log('\n[Test 1] DontMissEvents...');
  const dontMissRes = await fetch(`http://localhost:3001/api/stubhub/proxy-test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetUrl: `${baseUrl}?method=DontMissEvents&categoryId=0&maxRows=5&page=0`, method: 'POST' }),
  }).catch(() => null);
  // Actually let's use the traffic buffer approach and call via the browser WebSocket
  // The browser is connected, so we can capture what it fires naturally

  // 2. Check full DontMissEvents response shape from traffic
  const trafficRes = await fetch('http://localhost:3001/browser/traffic');
  const traffic = await trafficRes.json() as {
    entries: Array<{method: string; url: string; status: number; requestBody?: unknown; responseBody?: unknown}>
  };

  const dontMissEntry = traffic.entries.find(e => e.url.includes('method=DontMissEvents'));
  if (dontMissEntry) {
    const body = dontMissEntry.responseBody as { items?: Array<{eventId?: number; eventName?: string; url?: string}> };
    console.log('\n=== DontMissEvents Response Shape ===');
    console.log('Keys:', Object.keys(body).join(', '));
    if (body.items?.[0]) {
      console.log('Item keys:', Object.keys(body.items[0]).join(', '));
      console.log('Item[0]:', JSON.stringify(body.items[0]).slice(0, 300));
    }
  }

  // 3. Now navigate the browser directly to the search page via WebSocket
  // Check if there's a better way to navigate
  console.log('\n=== Checking browser health ===');
  const healthRes = await fetch('http://localhost:3001/browser/health');
  const health = await healthRes.json();
  console.log('Health:', JSON.stringify(health));

  // 4. Try the traffic summary to find all unique endpoints
  console.log('\n=== Traffic Summary ===');
  const summaryRes = await fetch('http://localhost:3001/browser/traffic/summary');
  const summary = await summaryRes.json();
  console.log(JSON.stringify(summary, null, 2).slice(0, 1000));

  // 5. Try calling stubhub search-specific methods via direct proxy
  // Known from web research: StubHub search uses /secure/Search which returns SSR HTML
  // But the ?method= pattern might have a search equivalent
  // Let's check what happens when we call /secure/Search via the browser
  await fetch('http://localhost:3001/browser/traffic', { method: 'DELETE' });
  console.log('\n=== Fetching search page via proxy traffic watch ===');
  // Send navigate message
  ws.send(JSON.stringify({ type: 'navigate', url: 'https://www.stubhub.com/secure/Search?q=bad+bunny&trackingLocation=Header' }));
  await new Promise(r => setTimeout(r, 12000));

  const searchRes = await fetch('http://localhost:3001/browser/traffic');
  const searchTraffic = await searchRes.json() as typeof traffic;
  console.log(`Search page traffic: ${searchTraffic.entries.length} entries`);
  searchTraffic.entries.forEach(e => {
    console.log(`  ${e.method} ${e.status} ${e.url.slice(0, 120)}`);
  });

  // Check if any entry looks like search results
  const searchResultsEntry = searchTraffic.entries.find(e =>
    e.url.includes('method=Search') || e.url.includes('/search') ||
    (String(e.responseBody).includes('eventId') && e.url.includes('stubhub'))
  );
  if (searchResultsEntry) {
    console.log('\n=== FOUND SEARCH RESULTS ENDPOINT ===');
    console.log('URL:', searchResultsEntry.url);
    console.log('Request body:', JSON.stringify(searchResultsEntry.requestBody).slice(0, 300));
    console.log('Response:', JSON.stringify(searchResultsEntry.responseBody).slice(0, 500));
  } else {
    console.log('\nNo search results endpoint found in traffic');
    // Check which entry has the longest response (likely the HTML)
    const longestEntry = searchTraffic.entries.reduce((max, e) => {
      const len = String(e.responseBody ?? '').length;
      return len > String(max.responseBody ?? '').length ? e : max;
    }, searchTraffic.entries[0]);
    if (longestEntry) {
      console.log('Longest response entry:');
      console.log('  URL:', longestEntry.url);
      console.log('  Length:', String(longestEntry.responseBody ?? '').length);
      console.log('  Content (300 chars):', String(longestEntry.responseBody ?? '').slice(0, 300));
    }
  }

  ws.close();
}

run().catch(console.error);
