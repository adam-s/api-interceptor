/**
 * StubHub Phase 6: Use browserFetch (cookies included) to get search page + check ?method= search
 *
 * The browser proxy route calls browserFetch inside the Patchright context,
 * which includes WAF cookies. Approach:
 * 1. Let browser load homepage (acquires WAF cookies)
 * 2. Use /browser/proxy to fetch search page with those cookies
 * 3. Extract __NEXT_DATA__ or find search JSON
 * 4. Navigate to event detail page, capture listing API
 */

import WebSocket from 'ws';

async function run() {
  console.log('=== StubHub: browserFetch with WAF cookies ===');

  await fetch('http://localhost:3001/browser/traffic', { method: 'DELETE' });

  // Connect browser — let it load homepage and acquire WAF cookies
  const ws = new WebSocket('ws://localhost:3001/browser/stream?profile=stubhub&url=https://www.stubhub.com');
  ws.on('error', (err: Error) => console.error('[WS]', err.message));
  ws.on('message', (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'url') console.log('[URL]', msg.url);
    } catch {}
  });

  console.log('Waiting for homepage + WAF cookies...');
  await new Promise(r => setTimeout(r, 12000));

  // 1. Try fetching search page via browserFetch (has cookies)
  console.log('\n[1] Fetching search page via browserFetch...');
  const searchRes = await fetch('http://localhost:3001/browser/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://www.stubhub.com/secure/Search?q=bad+bunny',
      method: 'GET',
    }),
  });
  const searchData = await searchRes.json().catch(() => null);
  console.log('Response type:', typeof searchData);
  if (typeof searchData === 'string') {
    console.log('HTML length:', searchData.length);
    console.log('First 200:', searchData.slice(0, 200));

    if (searchData.includes('__NEXT_DATA__')) {
      console.log('\n✓ NEXT.js page detected!');
      const match = searchData.match(/<script id="__NEXT_DATA__"[^>]*>({[\s\S]+?})<\/script>/);
      if (match) {
        try {
          const nextData = JSON.parse(match[1]) as Record<string, unknown>;
          const props = (nextData.props as Record<string, unknown>)?.pageProps as Record<string, unknown> | undefined;
          console.log('pageProps keys:', Object.keys(props ?? {}));
          if (props?.events) {
            const events = props.events as Array<Record<string, unknown>>;
            console.log(`events: ${events.length} items`);
            console.log('events[0]:', JSON.stringify(events[0]).slice(0, 400));
          }
          if (props?.searchResults) {
            console.log('searchResults:', JSON.stringify(props.searchResults).slice(0, 400));
          }
        } catch (e) {
          console.log('JSON parse error:', (e as Error).message);
        }
      }
    } else if (searchData.length < 100) {
      console.log('⚠ Short response — WAF still blocking');
    }
  } else if (searchData && typeof searchData === 'object') {
    const keys = Object.keys(searchData as object);
    console.log('Object keys:', keys);
    console.log('Value:', JSON.stringify(searchData).slice(0, 500));
  } else {
    console.log('Null/empty response');
  }

  // 2. Navigate browser to search and inspect __NEXT_DATA__ via WebSocket navigate
  console.log('\n[2] Navigating browser to search page...');
  await fetch('http://localhost:3001/browser/traffic', { method: 'DELETE' });
  ws.send(JSON.stringify({ type: 'navigate', url: 'https://www.stubhub.com/secure/Search?q=bad+bunny' }));
  await new Promise(r => setTimeout(r, 15000));

  const trafficRes = await fetch('http://localhost:3001/browser/traffic');
  const traffic = await trafficRes.json() as {
    entries: Array<{method: string; url: string; status: number; responseBody?: unknown}>
  };
  console.log(`Traffic entries after navigate: ${traffic.entries.length}`);

  // Find search page entry and inspect responseBody
  const searchEntry = traffic.entries.find(e => e.url.includes('secure/Search'));
  if (searchEntry) {
    const body = searchEntry.responseBody;
    console.log('\nSearch entry responseBody type:', typeof body);
    if (typeof body === 'string') {
      console.log('String length:', body.length);
      console.log('First 300:', body.slice(0, 300));
    } else if (body && typeof body === 'object') {
      const bodyStr = JSON.stringify(body);
      console.log('Serialized length:', bodyStr.length);
      console.log('Serialized (500 chars):', bodyStr.slice(0, 500));
    }
  }

  // Show all ?method= calls during search
  const methodCalls = traffic.entries.filter(e => e.url.includes('?method=') || e.url.includes('&method='));
  console.log(`\n?method= calls during search: ${methodCalls.length}`);
  methodCalls.forEach(e => {
    const url = new URL(e.url);
    const methodName = url.searchParams.get('method');
    console.log(`  ${e.method} ${methodName} — ${e.url.slice(0, 150)}`);
    if (e.responseBody && typeof e.responseBody === 'object') {
      const keys = Object.keys(e.responseBody as object);
      console.log(`    keys: ${keys.join(', ')}`);
      const rb = e.responseBody as Record<string, unknown>;
      if (rb.items) {
        const items = rb.items as unknown[];
        console.log(`    items[0]: ${JSON.stringify(items[0]).slice(0, 200)}`);
      }
      if (rb.events) {
        const evts = rb.events as unknown[];
        console.log(`    events[0]: ${JSON.stringify(evts[0]).slice(0, 200)}`);
      }
    }
  });

  // Show ALL entries for context
  console.log('\n--- All traffic entries ---');
  traffic.entries.forEach(e => {
    const bodySize = e.responseBody ? JSON.stringify(e.responseBody).length : 0;
    console.log(`  ${e.method} ${e.status} ${e.url.slice(0, 100)} [body: ${bodySize}b]`);
  });

  // 3. Use browserFetch to call search page AFTER browser navigated there
  console.log('\n[3] browserFetch to search page after browser navigation...');
  const searchRes2 = await fetch('http://localhost:3001/browser/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://www.stubhub.com/secure/Search?q=bad+bunny',
      method: 'GET',
    }),
  });
  const searchData2 = await searchRes2.json().catch(() => null);
  console.log('Response type:', typeof searchData2);
  if (typeof searchData2 === 'string') {
    console.log('HTML length:', searchData2.length);
    if (searchData2.includes('__NEXT_DATA__')) {
      console.log('✓ Has __NEXT_DATA__');
      const match = searchData2.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]+?)<\/script>/);
      if (match) {
        try {
          const nd = JSON.parse(match[1]) as Record<string, unknown>;
          const pp = (nd.props as Record<string, unknown>)?.pageProps as Record<string, unknown>;
          console.log('pageProps keys:', Object.keys(pp ?? {}));
          // Find events/search data
          for (const [k, v] of Object.entries(pp ?? {})) {
            if (v && typeof v === 'object') {
              const str = JSON.stringify(v);
              if (str.includes('eventId') || str.includes('eventName') || str.includes('event_id')) {
                console.log(`\nKey '${k}' contains event data!`);
                console.log(str.slice(0, 600));
              }
            }
          }
        } catch {}
      }
    } else {
      console.log('No __NEXT_DATA__ — first 500:', searchData2.slice(0, 500));
    }
  } else {
    console.log(JSON.stringify(searchData2).slice(0, 500));
  }

  ws.close();
  console.log('\nDone.');
}

run().catch(console.error);
