Build me an academic paper search tool. Create domain plugins for PubMed, Semantic Scholar, and ArXiv — check if they have public APIs first before trying browser interception.

I want to search a research topic and see papers from all three databases deduplicated by DOI. Dashboard at `/research` — show citation counts, abstracts, authors, and source badges. Sort by most cited. I want to see which papers are the most influential in a field.

## Hints

- ArXiv has a public Atom API at `export.arxiv.org/api` — returns XML (Atom format). Parse with regex: `/<entry>([\s\S]*?)<\/entry>/g`. No API key needed.
- Semantic Scholar has a public REST API at `api.semanticscholar.org/graph/v1` — 100 req/5min unauthenticated. It may return `total: 0` with 200 status under load (soft rate limit) — retry after a few seconds.
- PubMed/NCBI uses E-utilities at `eutils.ncbi.nlm.nih.gov` — returns NCBI XML. Parse with `/<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g`.
- All three are `browserRequired: false` — no browser interception needed.
- Since these are independent HTTP calls to different servers, they can be fetched in parallel with `Promise.all`.
