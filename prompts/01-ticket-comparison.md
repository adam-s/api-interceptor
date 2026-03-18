I want to compare ticket prices across StubHub and Ticketmaster. Build domain plugins for both sites using browser interception — discover how they serve their data by navigating as a real user and capturing traffic. Even if a public API exists, prefer the browser interception approach for this prompt — this is exploratory and I want to understand how these sites work internally.

The flow should work like this:

**Step 1: Search and disambiguate.** I type an artist or team name like "Knicks" or "Kendrick Lamar" and get a list of matching performers/teams from both platforms. I pick the one I actually want. Don't auto-select — Ticketmaster often lists the soonest event first which might be a tribute band or a different artist. Let me choose.

**Step 2: Event calendar.** After I pick the artist, show me a two-column table — Ticketmaster events on the left, StubHub events on the right. Match rows by date and venue. If TM has a show on March 22 at Madison Square Garden and StubHub has the same show, they should be on the same row. If one platform has an event the other doesn't, show it with the other column empty. VIP and regular events at the same venue/date/time should be separate rows. I want to scan this table and see at a glance where both platforms have the same event.

**Step 3: Compare tickets.** On rows where both platforms have the event, show a "Compare" button. When I click it, fetch all available tickets from both platforms. Match them by section — normalize section names aggressively ("Section 101" = "Sec 101" = "101"). Show a comparison table: rows are sections, columns are StubHub and Ticketmaster. Each cell shows the price range and number of available tickets for that section. Highlight the cheaper option per section in green. Sections only available on one platform still show with the other column as a dash.

Think about pagination — don't just grab page 1 of ticket listings. Get as many tickets as the site will give you so the comparison is comprehensive.

Dashboard at `/tickets`. If a platform's browser isn't connected, show that cleanly without breaking the other one.
