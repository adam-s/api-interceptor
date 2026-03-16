/**
 * StubHub Phase 12: Event page deep investigation
 * - Wait longer for JS to load listings
 * - Try ?method= on the event URL
 * - Read DOM for ticket/listing data
 */

import WebSocket from 'ws';

async function run() {
  console.log('=== StubHub Event Page Deep Investigation ===');

  const ws = new WebSocket('ws://localhost:3001/browser/stream?profile=stubhub&url=https://www.stubhub.com');
  ws.on('error', (err: Error) => console.error('[WS]', err.message));
  ws.on('message', (d: Buffer) => {
    try { const m = JSON.parse(d.toString()); if (m.type === 'url') console.log('[URL]', m.url); } catch {}
  });

  await new Promise(r => setTimeout(r, 8000));

  // Navigate to event page and wait longer + scroll
  await fetch('http://localhost:3001/browser/traffic', { method: 'DELETE' });
  const eventUrl = 'https://www.stubhub.com/bad-bunny-barcelona-tickets-5-22-2026/event/158171526/';
  ws.send(JSON.stringify({ type: 'navigate', url: eventUrl }));
  console.log('Navigating to event page...');

  // Wait longer for dynamic content
  await new Promise(r => setTimeout(r, 8000));
  // Scroll to trigger lazy loading
  ws.send(JSON.stringify({ type: 'scroll', x: 600, y: 400, deltaY: 500 }));
  await new Promise(r => setTimeout(r, 3000));
  ws.send(JSON.stringify({ type: 'scroll', x: 600, y: 600, deltaY: 500 }));
  await new Promise(r => setTimeout(r, 5000));

  const trafficRes = await fetch('http://localhost:3001/browser/traffic');
  const traffic = await trafficRes.json() as {
    entries: Array<{method: string; url: string; status: number; requestBody?: unknown; responseBody?: unknown}>
  };

  console.log(`Traffic entries after wait+scroll: ${traffic.entries.length}`);
  traffic.entries.forEach(e => {
    const bodyLen = JSON.stringify(e.responseBody ?? '').length;
    const isStubHub = e.url.includes('stubhub') || e.url.includes('viagogo');
    if (isStubHub || !e.url.includes('.js') && !e.url.includes('.css') && !e.url.includes('.jpg')) {
      console.log(`  ${e.method} ${e.status} ${e.url.slice(0, 140)} [${bodyLen}b]`);
    }
  });

  // 1. Inspect event page DOM
  console.log('\n=== Event page DOM ===');
  const domResult = await new Promise<Record<string, unknown>>(resolve => {
    const evalPage = async () => {
      // Use the performer-events route logic via inline call
      const res = await fetch('http://localhost:3001/api/stubhub/performer-events?url=https://www.stubhub.com/bad-bunny-barcelona-tickets-5-22-2026/event/158171526/');
      const data = await res.json();
      resolve(data as Record<string, unknown>);
    };
    evalPage().catch(e => resolve({ error: String(e) }));
  });
  console.log('DOM type:', domResult.type);
  if (domResult.type === 'fallback') {
    console.log('Title:', domResult.title);
    console.log('bodyText (2000):', (domResult.bodyText as string).slice(0, 2000));
  } else {
    console.log('Result:', JSON.stringify(domResult).slice(0, 1000));
  }

  // 2. Try ?method= on event URL
  console.log('\n=== Testing event page ?method= ===');
  // Navigate back to event page then try methods
  ws.send(JSON.stringify({ type: 'navigate', url: eventUrl }));
  await new Promise(r => setTimeout(r, 5000));

  await fetch('http://localhost:3001/browser/traffic', { method: 'DELETE' });

  const eventMethods = [
    'GetListings',
    'GetTickets',
    'EventListings',
    'GetEventListings',
    'Listings',
    'GetEventDetails',
    'EventDetails',
    'EventInfo',
    'GetMapData',
    'MapListings',
  ];

  for (const method of eventMethods) {
    const url = `${eventUrl}?method=${method}&page=0&maxRows=10`;
    ws.send(JSON.stringify({ type: 'navigate', url }));
    await new Promise(r => setTimeout(r, 1500));
  }

  await new Promise(r => setTimeout(r, 2000));
  const methodTrafficRes = await fetch('http://localhost:3001/browser/traffic');
  const methodTraffic = await methodTrafficRes.json() as typeof traffic;

  const methodCalls = methodTraffic.entries.filter(e => e.url.includes('?method='));
  console.log(`?method= calls fired: ${methodCalls.length}`);
  methodCalls.forEach(e => {
    const url = new URL(e.url);
    const methodName = url.searchParams.get('method');
    const body = e.responseBody as Record<string, unknown>;
    const keys = body && typeof body === 'object' ? Object.keys(body) : [];
    if (keys.length > 0 && keys[0] !== '_truncated') {
      console.log(`  ✓ ${methodName}: keys=${keys.join(', ')}`);
      const bodyStr = JSON.stringify(body).slice(0, 500);
      if (bodyStr.includes('price') || bodyStr.includes('listing') || bodyStr.includes('ticket') || bodyStr.includes('section')) {
        console.log(`    *** LISTINGS DATA FOUND: ${bodyStr.slice(0, 400)}`);
      }
    } else {
      console.log(`  ✗ ${methodName}: empty/error`);
    }
  });

  ws.close();
}

run().catch(console.error);
