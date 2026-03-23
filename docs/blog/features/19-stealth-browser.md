# Fifteen Signals Make You Human

A method actor doesn't just memorize lines. They change how they hold a coffee cup, how they sit in a chair, how long they take before answering a question. The costume helps, sure. But the director who hired a dialect coach, a movement instructor, and a behavioral psychologist knows something the costume-only actor doesn't: any single wrong detail breaks the illusion. The audience doesn't think "the accent slipped." They think "that person is acting."

Bot detection works the same way. Websites don't check one thing about your browser. They check fifteen, and they cross-reference the answers. Get fourteen right and miss one—your WebGL renderer says "Apple M1" but your `navigator.platform` says "Linux aarch64"—and the whole fingerprint collapses. The detection system doesn't flag a single anomaly. It flags *incoherence*.

The thesis I came to after five rounds of getting caught and fixing it: **stealth tools hide the automation, but they don't fabricate a person.** You have to do that yourself, and it means lying about fifteen things consistently.

## The tool that solves 80% of the problem

[Patchright](https://github.com/nicedayfor/patchright) is a patched build of Chromium that removes many of the signals headless browsers leak by default. It's a drop-in replacement for Playwright—same API, same test runner, same `page.goto()`. The patch disables the `navigator.webdriver` flag that Playwright sets, modifies the CDP (Chrome DevTools Protocol) fingerprint, and fixes several `HeadlessChrome` tells.

Switching from Playwright with the `playwright-extra` stealth plugin to Patchright was a one-line import change:

```typescript
// Before: three packages working together
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
chromium.use(StealthPlugin());

// After: one package, stealth built in
import { chromium } from 'patchright';
```

Patchright handles the basics: hiding `webdriver`, suppressing automation-related Chrome flags, cleaning up the CDP fingerprint. For most websites—news sites, public APIs, search engines—this is enough. You launch, you navigate, you scrape, nobody complains.

Robinhood is not most websites.

## Getting caught, round one

The first sign was Robinhood's login page redirecting to a challenge after five seconds. No CAPTCHA, no error message. Just a blank page and a redirect to a URL containing `challenge`.

I had no visibility into *why* it was flagging me. That's the fundamental problem with bot detection debugging: the defender tells you nothing. You're investigating a classifier with a single bit of output—blocked or not blocked.

The fix was to add fingerprint logging. On every browser launch, I captured the same signals that bot detectors check and wrote them to a file:

```typescript
const fingerprint = await page.evaluate(() => ({
  userAgent: navigator.userAgent,
  platform: navigator.platform,
  vendor: navigator.vendor,
  webdriver: navigator.webdriver,
  hardwareConcurrency: navigator.hardwareConcurrency,
  deviceMemory: navigator.deviceMemory,
  maxTouchPoints: navigator.maxTouchPoints,
  languages: navigator.languages,
  // WebGL — the fingerprint that matters most
  webglVendor: getWebGLParam(37445),   // UNMASKED_VENDOR_WEBGL
  webglRenderer: getWebGLParam(37446), // UNMASKED_RENDERER_WEBGL
}));
```

The log revealed the problem immediately. I was running on an ARM64 EC2 instance (t4g.medium), and the User-Agent said `Linux aarch64`. Robinhood had never seen a Linux ARM user make an API call from a browser. That alone was enough to trigger the challenge.

## Getting caught, round two

I hardcoded a Mac User-Agent and overrode `navigator.platform` to `MacIntel`. The challenge page went away. Normal pages loaded. I could navigate to the portfolio page.

Then the session died after thirty seconds. No error. The page just stopped responding to clicks, and any API call returned a 403. Something was checking me after the initial page load.

The culprit was in the network tab: `fp.robinhood.com` was loading a FingerprintJS script. FingerprintJS doesn't check one signal—it assembles a device fingerprint from canvas rendering, AudioContext output, installed fonts, WebGL behavior, and more. Patchright hides the automation, but FingerprintJS was looking deeper.

The fix was to block these scripts before they execute. Not with Ghostery (which blocks ads), but with explicit route-level interception:

```typescript
const BLOCKED_TRACKING_URLS = [
  '**/fingerprintjs.com/**',
  '**/fpjs.io/**',
  '**/cdn.fingerprint.com/**',
  '**/arkoselabs.com/**',      // CAPTCHA provider
  '**/funcaptcha.com/**',
  '**/segment.io/**',          // analytics
  '**/segment.com/**',
];

for (const pattern of BLOCKED_TRACKING_URLS) {
  await context.route(pattern, (route) => route.abort());
}
```

Route-level blocking is nuclear: the script never downloads, never parses, never executes. The detection service gets no signal at all, which from its perspective looks like a browser with an aggressive ad blocker. Millions of real users run ad blockers. That's the blend-in.

## Getting caught, round three

Sessions now lasted minutes instead of seconds. But fresh browser profiles—the kind you get when you launch a new Chromium instance with a temp directory—kept getting challenged on the third or fourth page load.

The pattern suggested behavioral fingerprinting. A brand new browser profile has no history, no cookies from previous sessions, no cached favicons. Real users have browsed popular sites, checked the weather, read Wikipedia. An empty profile is a strong signal on its own.

I added a warmup function that visits common sites before touching anything sensitive:

```typescript
const WARMUP_SITES = [
  'https://www.wikipedia.org',
  'https://www.weather.com',
  'https://www.npmjs.com',
  'https://www.bbc.com',
];

for (const site of sites) {
  await page.goto(site, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.evaluate(() => window.scrollBy(0, Math.random() * 300 + 100));
  await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
}
```

Warmup builds a browsing history in the profile: cached DNS, cookie jars, localStorage entries from visited sites, scroll position data. The profile now looks inhabited.

## The fifteen signals

Warmup fixed fresh profiles but didn't fix the underlying fragility. Any detection service sophisticated enough to check browsing history is also checking navigator properties, WebGL output, audio fingerprints, screen dimensions, plugin lists, and battery status.

The complete anti-detection script I ended up with overrides fifteen distinct signals to maintain a coherent Mac Chrome fingerprint:

1. `navigator.platform` → `MacIntel`
2. `navigator.vendor` → `Google Inc.`
3. `navigator.webdriver` → `undefined`
4. `navigator.languages` → `['en-US', 'en']`
5. `navigator.language` → `en-US`
6. `navigator.hardwareConcurrency` → `8`
7. `navigator.deviceMemory` → `8`
8. `navigator.maxTouchPoints` → `0`
9. `navigator.plugins` → five PDF-related plugins (Chrome on macOS standard)
10. WebGL `UNMASKED_VENDOR_WEBGL` → `Apple Inc.`
11. WebGL `UNMASKED_RENDERER_WEBGL` → `Apple M1`
12. `screen.colorDepth` → `24`
13. AudioContext `sampleRate` → `44100`
14. `navigator.getBattery` → `undefined` (macOS Chrome doesn't expose this)
15. `navigator.connection.effectiveType` → `4g`

Each override uses `Object.defineProperty` or Proxy wrapping to intercept the getter before any page JavaScript runs. The script is injected via `context.addInitScript()` so it executes before the page's own scripts.

The important thing isn't the individual signals—it's that they all tell the same story. Platform is Mac, WebGL says Apple M1, there are Mac-standard plugins, the screen color depth matches macOS, the audio sample rate is the macOS default. Every answer is consistent with one identity.

## Why Patchright isn't enough

Patchright handles the first layer: it removes the `webdriver` flag, patches the CDP fingerprint, and makes the browser look like a normal Chrome instance. This defeats basic automation detection—the kind that checks `navigator.webdriver` and calls it a day.

But modern detection services run their own JavaScript on the page. FingerprintJS builds a canvas fingerprint by drawing hidden elements and comparing the pixel output. Arkose Labs serves invisible CAPTCHAs. Segment correlates mouse movement patterns with known human distributions. These scripts don't check whether you're automated; they check whether you're *this specific device* across sessions.

Patchright can't help with this because these are page-level scripts, not browser-level properties. You need three layers:

1. **Patchright** — removes browser-level automation tells
2. **Route blocking** — prevents fingerprinting scripts from executing
3. **Navigator overrides** — fabricates a coherent device identity for any scripts that do run

Miss any layer and the detection catches you at the next one. It's defense in depth, except you're the attacker.

## The uncomfortable part

None of this works if the fifteen signals contradict each other. I spent an afternoon debugging a session that failed despite all overrides being in place. The problem: my WebGL override was claiming `Apple M1`, but the `navigator.platform` override had been accidentally removed during a refactor. The platform was reporting `Linux aarch64` while the GPU was supposedly Apple silicon. That combination exists on exactly zero real devices.

Cross-referencing is what makes modern bot detection hard. It's not fifteen independent checks—it's fifteen answers to a quiz where the grader knows which answers should agree. Get the WebGL renderer right but the platform wrong, and you've told them more about yourself than silence would have.

The method actor metaphor holds. The costume (Patchright) gets you in the door. The accent (User-Agent) gets you past the first question. But the interrogation has fifteen questions, and they're checking your answers against each other. You either prepare all fifteen or you don't walk out.
