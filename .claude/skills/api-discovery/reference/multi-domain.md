# Multi-Domain Browser Usage

When a single prompt requires data from multiple websites (e.g., comparing prices across two platforms), use multiple pages within the same browser context rather than navigating a single page back and forth.

## Creating Additional Pages

```typescript
// In a route handler:
handler: async (c, browser) => {
  const page = browser.getPage();
  if (!page) return c.json({ error: 'No browser' }, 503);

  // Create a second page in the same browser context
  const context = page.context();
  const secondPage = await context.newPage();

  // Pages share cookies within the same context
  await secondPage.goto('https://www.other-domain.com/search?q=...');
  // ... extract data from secondPage ...

  // Clean up when done
  await secondPage.close();
}
```

## Key Rules

1. **Pages share cookies** in the same browser context. No need to re-authenticate.
2. **Don't navigate one page back and forth** between domains. Each navigation destroys page state, loses scroll position, triggers fresh bot detection challenges, and is slower than opening a new tab.
3. **Close pages when done** to avoid accumulating background tabs that consume memory.
4. **The singleton browser has one "active" page** for frame streaming. Additional pages created via `context.newPage()` work for data extraction but their frames are not streamed to the WebSocket client. This is fine for API routes.
5. **Sequential, not parallel.** Even with multiple pages, avoid `Promise.all()` across browser operations. The browser is a singleton and concurrent operations can race.
