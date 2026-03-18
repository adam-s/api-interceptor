# Phase 4: Verify — REQUIRED before proceeding

**Each route must produce curl output showing real data. This output is what you use to build the UI. No output = no UI.**

For EACH route you wrote:

```bash
curl -s http://localhost:3001/api/<domain>/<path> | jq '.'
```

Read the response. Does it contain real data (titles, prices, names, dates)? If yes — this route is done, move to the next one.

If the response is empty, wrong, or an error:
1. Add `DEBUG()` inside the route handler: `DEBUG('route-name', () => ({ rawResponse, itemCount, firstItem }))`
2. Re-curl the route
3. Read the log: `tail -20 /tmp/interceptor-debug/debug-$(date +%Y-%m-%d).log`
4. The log tells you exactly what happened — fix it
5. Remove the DEBUG() calls, re-curl, confirm real data

**Do NOT proceed to the dashboard-builder skill until EVERY route returns real data from curl.** The dashboard displays whatever the API returns. If the API returns garbage, the dashboard displays garbage, and you'll waste time debugging the UI when the bug is in the API.

## Prompt Compliance Check (between Phase 4 and Phase 5)

Re-read the original prompt AND the requirements list you extracted at the start. For each data requirement, verify you have a route that returns real data from curl. Mark each as PASS (with curl evidence) or FAIL (missing route or empty response). Any FAIL = go back to the appropriate Phase. Do NOT proceed to Phase 5 until every data requirement has a working, verified route.

## Trigger: Extracted Data Doesn't Match Rendered DOM

If `curl` returns data but values don't match what the browser renders (wrong names, prices off by 100x, cryptic IDs) — this triggers the **Decoding Encoded API Responses** technique (see [decoding.md](decoding.md)). Do NOT hack around the mismatch. Trace the real data source through the site's JavaScript.
