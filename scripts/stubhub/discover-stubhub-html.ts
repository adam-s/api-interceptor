/**
 * StubHub Phase 5: Extract __NEXT_DATA__ from search page via connected browser
 *
 * Approach: Navigate connected browser to search page, use CDP evaluate to get
 * window.__NEXT_DATA__ directly from the browser context
 */

import WebSocket from 'ws';

async function run() {
  console.log('=== StubHub HTML Extraction via Browser CDP ===');

  await fetch('http://localhost:3001/browser/traffic', { method: 'DELETE' });

  // First check what endpoints are available
  console.log('\n=== Available endpoints ===');
  const endpoints = [
    'GET http://localhost:3001/',
    'GET http://localhost:3001/health',
    'GET http://localhost:3001/browser',
    'GET http://localhost:3001/browser/health',
    'GET http://localhost:3001/browser/traffic',
    'GET http://localhost:3001/browser/traffic/summary',
    'GET http://localhost:3001/browser/stream',
    'GET http://localhost:3001/browser/evaluate',
    'POST http://localhost:3001/browser/evaluate',
    'POST http://localhost:3001/browser/script',
    'POST http://localhost:3001/browser/execute',
    'GET http://localhost:3001/browser/cdp',
    'POST http://localhost:3001/browser/cdp',
    'GET http://localhost:3001/browser/routes',
    'GET http://localhost:3001/browser/debug',
    'POST http://localhost:3001/browser/navigate',
    'POST http://localhost:3001/browser/goto',
  ];

  for (const spec of endpoints.slice(6)) {
    const [method, url] = spec.split(' ');
    try {
      const res = await fetch(url, {
        method,
        headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {},
        body: method === 'POST' ? JSON.stringify({ expression: 'document.title' }) : undefined,
      });
      if (res.status !== 404 && res.status !== 405) {
        console.log(`  ${method} ${url}: ${res.status}`);
        const text = await res.text();
        console.log(`    ${text.slice(0, 100)}`);
      }
    } catch {}
  }

  // Connect browser
  const ws = new WebSocket('ws://localhost:3001/browser/stream?profile=stubhub&url=https://www.stubhub.com');
  ws.on('error', (err: Error) => console.error('[WS]', err.message));

  const messages: unknown[] = [];
  ws.on('message', (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());
      messages.push(msg);
      console.log('[WS msg]', JSON.stringify(msg).slice(0, 200));
    } catch {}
  });

  await new Promise(r => setTimeout(r, 5000));

  // Try sending different navigate commands
  console.log('\n=== Trying navigate commands ===');
  const navCommands = [
    { type: 'navigate', url: 'https://www.stubhub.com/secure/Search?q=bad+bunny' },
    { type: 'goto', url: 'https://www.stubhub.com/secure/Search?q=bad+bunny' },
    { action: 'navigate', url: 'https://www.stubhub.com/secure/Search?q=bad+bunny' },
    { cmd: 'navigate', url: 'https://www.stubhub.com/secure/Search?q=bad+bunny' },
    { type: 'evaluate', expression: "window.location.href = 'https://www.stubhub.com/secure/Search?q=bad+bunny'" },
    { type: 'evaluate', code: "window.location.href = 'https://www.stubhub.com/secure/Search?q=bad+bunny'" },
  ];

  for (const cmd of navCommands) {
    ws.send(JSON.stringify(cmd));
    await new Promise(r => setTimeout(r, 1000));
    // Check if we got a navigation-related message
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && typeof lastMsg === 'object') {
      const msg = lastMsg as Record<string, unknown>;
      if (msg.type === 'navigate' || msg.type === 'navigated' || msg.url) {
        console.log(`  ✓ Command worked: ${JSON.stringify(cmd)}`);
        console.log(`  Response: ${JSON.stringify(lastMsg)}`);
        break;
      }
    }
  }

  await new Promise(r => setTimeout(r, 3000));

  // 2. Try evaluating JavaScript via REST API
  console.log('\n=== Trying evaluate via REST ===');
  const evalEndpoints = [
    'http://localhost:3001/browser/evaluate',
    'http://localhost:3001/browser/execute',
    'http://localhost:3001/browser/script',
    'http://localhost:3001/browser/eval',
  ];

  for (const endpoint of evalEndpoints) {
    for (const body of [
      { expression: 'document.title' },
      { code: 'document.title' },
      { script: 'document.title' },
      { js: 'document.title' },
    ]) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.status !== 404 && res.status !== 405) {
          const text = await res.text();
          console.log(`  ✓ ${endpoint} with ${JSON.stringify(body)}: ${res.status}`);
          console.log(`    Response: ${text.slice(0, 200)}`);
        }
      } catch {}
    }
  }

  // 3. Navigate via REST API
  console.log('\n=== Trying navigate via REST ===');
  const navEndpoints = [
    'http://localhost:3001/browser/navigate',
    'http://localhost:3001/browser/goto',
    'http://localhost:3001/browser/visit',
    'http://localhost:3001/browser/open',
  ];

  const searchUrl = 'https://www.stubhub.com/secure/Search?q=bad+bunny';
  for (const endpoint of navEndpoints) {
    for (const body of [
      { url: searchUrl },
      { href: searchUrl },
      { target: searchUrl },
    ]) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.status !== 404 && res.status !== 405) {
          const text = await res.text();
          console.log(`  ✓ ${endpoint} with ${JSON.stringify(body)}: ${res.status}`);
          console.log(`    Response: ${text.slice(0, 200)}`);
        }
      } catch {}
    }
  }

  ws.close();
  console.log('\nDone.');
}

run().catch(console.error);
