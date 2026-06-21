#!/usr/bin/env node
// Collect contact info from HN commenters on your posts
// Usage: node scripts/hn-contacts.mjs [hn-username]
//        node scripts/hn-contacts.mjs dataviz1000

const HN_API = "https://hacker-news.firebaseio.com/v0";
const ALGOLIA = "https://hn.algolia.com/api/v1";
const GH_API = "https://api.github.com";

const username = process.argv[2] || "dataviz1000";

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+\s*(?:@|\[at\]|\bat\b)\s*[a-zA-Z0-9.\-]+\s*(?:\.|\[dot\]|\bdot\b)\s*[a-zA-Z]{2,}/gi;
const URL_RE = /https?:\/\/[^\s"'<>)\\]+/g;
const GITHUB_RE = /github\.com\/([a-zA-Z0-9\-]+)\/?(?:[^/\s])?/;

function decodeHtml(s) {
  return s
    .replace(/&#x2F;/g, "/")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/<[^>]+>/g, " ");
}

function normalizeEmail(raw) {
  return raw
    .replace(/\s*\[at\]\s*/gi, "@")
    .replace(/\s+at\s+/gi, "@")
    .replace(/\s*\[dot\]\s*/gi, ".")
    .replace(/\s+dot\s+/gi, ".")
    .replace(/\s/g, "")
    .toLowerCase();
}

async function fetchSafe(url, opts = {}) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), ...opts });
    if (!res.ok) return null;
    return res;
  } catch {
    return null;
  }
}

async function getJson(url, opts = {}) {
  const res = await fetchSafe(url, opts);
  return res ? res.json().catch(() => null) : null;
}

async function getHtml(url) {
  const res = await fetchSafe(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; HN-contact-finder)" },
  });
  return res ? res.text().catch(() => null) : null;
}

async function getUser(name) {
  return getJson(`${HN_API}/user/${name}.json`);
}

async function getItem(id) {
  return getJson(`${HN_API}/item/${id}.json`);
}

// Try to get public email from a GitHub username
async function githubEmail(ghUser) {
  const profile = await getJson(`${GH_API}/users/${ghUser}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (profile?.email) return profile.email;

  // Check public events for email in commits
  const events = await getJson(`${GH_API}/users/${ghUser}/events/public`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!Array.isArray(events)) return null;
  for (const ev of events) {
    const commits = ev?.payload?.commits || [];
    for (const c of commits) {
      const email = c?.author?.email;
      if (email && !email.includes("noreply")) return email;
    }
  }
  return null;
}

// Try to find an email on a personal website
async function websiteEmail(url) {
  const html = await getHtml(url);
  if (!html) return null;
  const matches = html.match(EMAIL_RE);
  if (!matches) return null;
  const emails = matches
    .map(normalizeEmail)
    .filter(e => e.includes("@") && !e.includes("example") && !e.includes("your@"));
  return emails[0] || null;
}

// Scrape the HN profile page to get the "website" field (separate from bio)
async function hnProfileWebsite(name) {
  const html = await getHtml(`https://news.ycombinator.com/user?id=${name}`);
  if (!html) return null;
  // HN renders website as a link next to the "website" label
  const m = html.match(/website.*?href="([^"]+)"/s) || html.match(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>[^<]*<\/a>\s*<\/td>/);
  return m?.[1] || null;
}

async function collectCommenters(item, commenters = new Set(), depth = 0) {
  if (!item?.kids?.length || depth > 5) return commenters;
  const kids = await Promise.all(item.kids.map(id => getItem(id)));
  for (const kid of kids) {
    if (!kid) continue;
    if (kid.by && kid.by !== username) commenters.add(kid.by);
    await collectCommenters(kid, commenters, depth + 1);
  }
  return commenters;
}

async function findPosts() {
  const data = await getJson(`${ALGOLIA}/search_by_date?tags=story,author_${username}&hitsPerPage=50`);
  return data?.hits || [];
}

async function resolveContact(profile) {
  const about = decodeHtml(profile.about || "");

  // 1. Direct email in about
  const directEmails = (about.match(EMAIL_RE) || []).map(normalizeEmail).filter(e => e.includes("@"));
  if (directEmails.length) return { email: directEmails[0], source: "hn-bio" };

  // 2. Collect all URLs from about
  const urls = (about.match(URL_RE) || []).map(u => u.replace(/[.,;)]+$/, ""));

  // 3. GitHub link → GitHub API
  for (const url of urls) {
    const m = url.match(GITHUB_RE);
    if (m && m[1] && m[1] !== "sponsors") {
      const ghUser = m[1];
      console.error(`  [${profile.id}] Checking GitHub: ${ghUser}`);
      const email = await githubEmail(ghUser);
      if (email) return { email, source: `github:${ghUser}` };
    }
  }

  // 4. HN profile page website field
  const hnSite = await hnProfileWebsite(profile.id);
  if (hnSite) {
    const m = hnSite.match(GITHUB_RE);
    if (m?.[1]) {
      console.error(`  [${profile.id}] Checking GitHub from HN profile: ${m[1]}`);
      const email = await githubEmail(m[1]);
      if (email) return { email, source: `github:${m[1]}` };
    }
    console.error(`  [${profile.id}] Checking website: ${hnSite}`);
    const email = await websiteEmail(hnSite);
    if (email) return { email, source: `website:${hnSite}` };
  }

  // 5. Personal websites from about
  for (const url of urls) {
    if (url.match(GITHUB_RE)) continue; // already handled
    if (url.includes("twitter.com") || url.includes("linkedin.com") || url.includes("keybase.io")) continue;
    console.error(`  [${profile.id}] Checking website: ${url}`);
    const email = await websiteEmail(url);
    if (email) return { email, source: `website:${url}` };
  }

  return null;
}

async function main() {
  console.error(`Fetching HN posts by ${username}...`);
  const posts = await findPosts();
  if (!posts.length) { console.error("No posts found."); process.exit(1); }

  console.error(`Found ${posts.length} post(s):`);
  for (const p of posts) console.error(`  [${p.objectID}] ${p.title}`);

  const allCommenters = new Set();
  for (const post of posts) {
    console.error(`\nCollecting commenters on: ${post.title}`);
    const item = await getItem(post.objectID);
    if (item) {
      await collectCommenters(item, allCommenters);
      console.error(`  ${allCommenters.size} unique commenters so far`);
    }
  }

  console.error(`\nResolving contact info for ${allCommenters.size} commenters...`);

  // CSV header
  console.log("username,email,source,about_snippet,karma,hn_profile");

  let found = 0;
  const names = [...allCommenters];

  // Process sequentially to avoid rate limits
  for (const name of names) {
    const profile = await getUser(name);
    if (!profile) continue;

    const contact = await resolveContact(profile);
    const about = decodeHtml(profile.about || "").slice(0, 100).replace(/,/g, ";").replace(/\n/g, " ");
    const email = contact?.email || "";
    const source = contact?.source || "";

    console.log(`${name},${email},${source},${about},${profile.karma},https://news.ycombinator.com/user?id=${name}`);
    if (email) found++;

    // Small delay to avoid hammering APIs
    await new Promise(r => setTimeout(r, 300));
  }

  console.error(`\nDone. ${allCommenters.size} commenters, ${found} emails found.`);
  console.error("Usage: node scripts/hn-contacts.mjs dataviz1000 > contacts.csv");
}

main().catch(err => { console.error(err); process.exit(1); });
