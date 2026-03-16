import WebSocket from 'ws';

async function run() {
  const ws = new WebSocket('ws://localhost:3001/browser/stream?profile=stubhub&url=https://www.stubhub.com');
  ws.on('error', (err: Error) => console.error('[WS]', err.message));
  ws.on('message', (d: Buffer) => {
    try { const m = JSON.parse(d.toString()); if (m.type === 'ready') console.log('[Ready]'); } catch {}
  });

  await new Promise(r => setTimeout(r, 10000));

  console.log('\nTesting /api/stubhub/listings/158171526 (Bad Bunny Barcelona)');
  const res = await fetch('http://localhost:3001/api/stubhub/listings/158171526?slug=bad-bunny-barcelona-tickets-5-22-2026');
  const data = await res.json() as Record<string, unknown>;

  console.log('type:', data.type);
  console.log('URL:', data.eventUrl);

  if (data.type === 'css-selector') {
    const items = data.items as Array<{text: string; attrs: Record<string, string>}>;
    console.log(`✓ Found ${data.count} listings via ${data.selector}`);
    items.slice(0, 5).forEach((item, i) => {
      console.log(`\n  [${i}] ${item.text.slice(0, 150)}`);
      const relevantAttrs = Object.entries(item.attrs)
        .filter(([k]) => k.startsWith('data-') || k === 'class');
      if (relevantAttrs.length > 0) {
        console.log(`  attrs: ${JSON.stringify(Object.fromEntries(relevantAttrs))}`);
      }
    });
  } else if (data.type === 'dom-analysis') {
    console.log('title:', data.title);
    console.log('listing classes:', data.listingClasses);
    console.log('price nodes:', data.priceNodes);
    console.log('total elements:', data.totalElements);
  } else if (data.type === 'next') {
    console.log('✓ Found __NEXT_DATA__!');
    const nd = data.data as Record<string, unknown>;
    const props = nd.props as Record<string, unknown> | undefined;
    const pp = props?.pageProps as Record<string, unknown> | undefined;
    console.log('pageProps keys:', Object.keys(pp ?? {}));
    if (pp?.listings) console.log('listings:', JSON.stringify(pp.listings).slice(0, 500));
  } else {
    console.log(JSON.stringify(data).slice(0, 1000));
  }

  ws.close();
}

run().catch(console.error);
