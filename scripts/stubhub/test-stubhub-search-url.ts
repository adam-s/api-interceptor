/**
 * Diagnose: what URL does browser land on after navigating to /secure/Search?
 */

import WebSocket from 'ws';

async function run() {
  console.log('=== StubHub Search URL Diagnosis ===');

  const ws = new WebSocket('ws://localhost:3001/browser/stream?profile=stubhub&url=https://www.stubhub.com');
  ws.on('error', (err: Error) => console.error('[WS]', err.message));

  const urlChanges: string[] = [];
  ws.on('message', (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'url') {
        urlChanges.push(msg.url as string);
        console.log('[URL changed]', msg.url);
      }
    } catch {}
  });

  // Wait for initial load
  await new Promise(r => setTimeout(r, 8000));

  console.log('\n=== Navigating to search URL ===');
  await fetch('http://localhost:3001/browser/traffic', { method: 'DELETE' });

  // Navigate via WebSocket (same as browser.navigate())
  ws.send(JSON.stringify({ type: 'navigate', url: 'https://www.stubhub.com/secure/Search?q=bad+bunny' }));

  // Wait longer for navigation
  await new Promise(r => setTimeout(r, 10000));

  // Check traffic
  const trafficRes = await fetch('http://localhost:3001/browser/traffic');
  const traffic = await trafficRes.json() as {
    entries: Array<{method: string; url: string; status: number; requestHeaders?: Record<string, string>; responseBody?: unknown}>
  };

  console.log('\nTraffic entries:', traffic.entries.length);
  traffic.entries.forEach(e => {
    const bodyLen = JSON.stringify(e.responseBody ?? '').length;
    console.log(`  ${e.method} ${e.status} ${e.url.slice(0, 120)} [${bodyLen}b]`);
  });

  // URL changes from WebSocket
  console.log('\nURL changes:', urlChanges);

  // Check search entry response body (raw)
  const searchEntry = traffic.entries.find(e => e.url.includes('Search') || e.url.includes('search'));
  if (searchEntry) {
    console.log('\nSearch entry URL:', searchEntry.url);
    console.log('Search entry status:', searchEntry.status);
    const body = searchEntry.responseBody;
    if (body && typeof body === 'object') {
      const str = JSON.stringify(body);
      console.log('Body (serialized, first 500):', str.slice(0, 500));
    }
  }

  // Also check the ?method= calls during search navigation
  const methodCalls = traffic.entries.filter(e => e.url.includes('?method='));
  if (methodCalls.length > 0) {
    console.log('\n?method= calls:');
    methodCalls.forEach(e => {
      const url = new URL(e.url);
      console.log(`  ${url.searchParams.get('method')}`);
    });
  }

  ws.close();
}

run().catch(console.error);
