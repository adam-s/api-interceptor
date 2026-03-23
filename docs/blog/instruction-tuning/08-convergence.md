# When Do You Stop

Iteration 43. Seven out of eight agents completed the full protocol. Full elimination tables. Routes for every discovered transport. Pagination working. Session harvest successful on auth-gated endpoints. Proxy tests returning real data. The eighth agent hit a genuine edge case — a site with Kasada bot detection that blocked the browser mid-session.

Seven out of eight felt like convergence. It wasn't.

---

Iteration 44 introduced two-pass testing. Pass 1: standard breadth discovery. Pass 2: focused on transports that pass 1 missed — WebSocket, streaming, real-time feeds. The reasoning was simple: some transports only appear on specific page types. A WebSocket might only exist on a live chat page, not on product listings. Breadth-first discovery hits the obvious pages. Pass 2 sends agents to the pages where rare transports live.

The results were uncomfortable. Pass 1 averaged 2.1 transports per site. Pass 2 raised it to 4.3. The "converged" protocol was missing half the transports because it wasn't navigating to the right pages.

```mermaid
graph TD
    subgraph "Iter 1-10: Foundation"
        I1["Decision tree → linear pipeline"]
        I2["Agents find 1 transport → 3"]
        I1 --> I2
    end

    subgraph "Iter 11-30: Language"
        I3["Soft → hard language"]
        I4["Consistency check added"]
        I5["PRE-FLIGHT step added"]
        I3 --> I4 --> I5
    end

    subgraph "Iter 31-43: Refinement"
        I6["Prune 299→153 lines"]
        I7["browserFetch-first BUILD"]
        I8["Budget rebalanced"]
        I6 --> I7 --> I8
    end

    subgraph "Iter 44-46: Depth"
        I9["Two-pass testing"]
        I10["Real-time transport checklist"]
        I11["2.1 → 4.3 transports/site"]
        I9 --> I10 --> I11
    end

    I2 --> I3
    I5 --> I6
    I8 --> I9

    style I1 fill:#1a1a2e,stroke:#e94560,color:#fff
    style I2 fill:#1a1a2e,stroke:#e94560,color:#fff
    style I3 fill:#1a1a2e,stroke:#0f3460,color:#fff
    style I4 fill:#1a1a2e,stroke:#0f3460,color:#fff
    style I5 fill:#1a1a2e,stroke:#0f3460,color:#fff
    style I6 fill:#16213e,stroke:#53cf8d,color:#fff
    style I7 fill:#16213e,stroke:#53cf8d,color:#fff
    style I8 fill:#16213e,stroke:#53cf8d,color:#fff
    style I9 fill:#0f3460,stroke:#53cf8d,color:#fff
    style I10 fill:#0f3460,stroke:#53cf8d,color:#fff
    style I11 fill:#0f3460,stroke:#53cf8d,color:#fff
```

---

The convergence criteria I'd written were:

1. Follow the GATHER→SCAN→CLASSIFY→BUILD pipeline
2. Fill all 8 elimination rows before writing code
3. Build routes for every ✓ transport
4. Validate each route through the proxy
5. Capture browser traffic including detail page visit
6. Complete session harvest for all auth-gated endpoints
7. Complete pagination for all routes
8. Stay near 150 tool calls
9. Write all files to worktree, not main repo

Nine criteria. All measurable. Iteration 43 passed seven of eight agents on all nine. And yet the instructions were still wrong — they didn't tell agents to navigate to page types where rare transports live.

The criteria measured compliance, not coverage. An agent could follow every rule perfectly and still miss WebSocket because no rule said "go to the live chat page."

---

I added the real-time transport checklist to PRE-FLIGHT:

```
- WebSocket: [chat pages, live feeds, dashboards, notifications]
- SSE: [streaming APIs, live updates, REST with event-stream]
- HLS/DASH: [video player pages, live streams, VOD archives]
- PubSub: [event feeds, channel subscriptions]
```

If the site has real-time features, the agent MUST navigate to those pages during GATHER. Not "check for WebSocket markers in the JS bundle" — actually go to the page where WebSocket would be used.

---

So when do you stop? Not when the scorecard is green. Not when the pass rate is high. You stop when the delta between iterations shrinks below the noise — when the failures are genuine edge cases (bot detection, site outages, genuinely unusual architectures) rather than instruction gaps.

After 46 iterations, the instruction changes per iteration dropped to 1-2 minor adjustments. The transport coverage stabilized at 4+ per site. Fresh agents — clean session, no hints, no memory of previous runs — consistently followed the full protocol. The failures that remained were environmental, not instructional.

```mermaid
graph LR
    subgraph "Convergence Signal"
        direction TB
        M1["Changes per iteration"] --> M2["10+ fixes<br/><i>iter 1-10</i>"]
        M2 --> M3["3-5 fixes<br/><i>iter 11-30</i>"]
        M3 --> M4["1-2 fixes<br/><i>iter 31-43</i>"]
        M4 --> M5["0-1 fixes<br/><i>iter 44-46</i>"]
    end

    subgraph "Transports Found"
        T1["1.0 avg<br/><i>iter 1</i>"] --> T2["3.0 avg<br/><i>iter 10</i>"]
        T2 --> T3["3.5 avg<br/><i>iter 30</i>"]
        T3 --> T4["4.3 avg<br/><i>iter 44</i>"]
    end

    style M2 fill:#1a1a2e,stroke:#e94560,color:#fff
    style M3 fill:#1a1a2e,stroke:#0f3460,color:#fff
    style M4 fill:#16213e,stroke:#53cf8d,color:#fff
    style M5 fill:#0f3460,stroke:#53cf8d,color:#fff
    style T1 fill:#1a1a2e,stroke:#e94560,color:#fff
    style T2 fill:#1a1a2e,stroke:#0f3460,color:#fff
    style T3 fill:#16213e,stroke:#53cf8d,color:#fff
    style T4 fill:#0f3460,stroke:#53cf8d,color:#fff
```

But I'm not sure the loop is done. It might never be done. Every new website is a test case, and every edge case that an agent handles wrong reveals something the instructions could say better. The question isn't "are the instructions perfect." It's "are they good enough that a fresh agent, reading them cold, makes the same decisions I would make."

Forty-six iterations in, the answer is usually yes. That's the best I've got.
