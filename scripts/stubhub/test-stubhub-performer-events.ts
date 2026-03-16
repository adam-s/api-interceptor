/**
 * Test the performer-events route
 */

import WebSocket from 'ws';

async function run() {
  const ws = new WebSocket('ws://localhost:3001/browser/stream?profile=stubhub&url=https://www.stubhub.com');
  ws.on('error', (err: Error) => console.error('[WS]', err.message));
  ws.on('message', (d: Buffer) => {
    try { const m = JSON.parse(d.toString()); if (m.type === 'ready') console.log('[Ready]'); } catch {}
  });

  console.log('Connecting...');
  await new Promise(r => setTimeout(r, 10000));

  // Test performer-events route with Bad Bunny
  console.log('\n[Test] /api/stubhub/performer-events?url=...');
  const res = await fetch('http://localhost:3001/api/stubhub/performer-events?url=https://www.stubhub.com/bad-bunny-tickets/performer/1522458');
  const data = await res.json() as Record<string, unknown>;

  console.log('Status:', res.status);
  console.log('Type:', data.type);
  console.log('URL:', data.url ?? data.performerUrl);

  if (data.type === 'event-links') {
    const events = data.events as Array<{href: string; text: string}>;
    console.log(`✓ Found ${events.length} event links!`);
    events.slice(0, 10).forEach(e => {
      // Extract eventId from URL
      const match = e.href.match(/\/event\/(\d+)/);
      console.log(`  eventId=${match?.[1]} | ${e.text?.slice(0, 60)} | ${e.href.slice(0, 80)}`);
    });
  } else if (data.type === 'fallback') {
    console.log('title:', data.title);
    console.log('totalLinks:', data.totalLinks);
    console.log('bodyText (1000):', (data.bodyText as string).slice(0, 1000));
  } else {
    console.log('Response:', JSON.stringify(data).slice(0, 1000));
  }

  ws.close();
}

run().catch(console.error);
