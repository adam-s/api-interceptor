I want to compare ticket prices across two major ticket marketplace sites. Build domain plugins for both using browser interception — discover how they serve their data by navigating as a real user and capturing traffic. Even if a public API exists, prefer the browser interception approach for this prompt — this is exploratory and I want to understand how these sites work internally.

The flow should work like this:

**Step 1: Search and disambiguate.** I type an artist or team name and get a list of matching performers from both platforms. Let me pick the one I want from each side — don't auto-select.

**Step 2: Event matching.** After I pick performers, fetch events from both platforms and match them behind the scenes before showing anything. Match by normalized date + venue — same venue and date = same event, regardless of how each platform names it. Cache all matched events so clicking into one doesn't re-fetch. Show me an event calendar where matched events (both platforms) are visually distinct from single-platform events. I should see at a glance which events I can compare.

**Step 3: Compare tickets.** On matched events, let me click to compare. Both platforms' tickets should already be fetched (or fetch in parallel on click). Match tickets by normalized section name. Show a comparison table: sections as rows, platforms as columns, price range and quantity per cell, cheaper option highlighted. Handle pagination — get all available tickets, not just page 1.

Dashboard at `/tickets`. If a platform's browser isn't connected, show that cleanly without breaking the other one.
