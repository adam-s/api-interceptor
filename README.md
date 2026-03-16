# API Interceptor: Reverse-Engineer Any Web API Without Documentation

[![CI Status](https://img.shields.io/github/actions/workflow/status/adam-s/api-interceptor/ci.yml?branch=main)](https://github.com/adam-s/api-interceptor/actions)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-22-green.svg)](package.json)
[![Made for HN](https://img.shields.io/badge/made%20for-Hacker%20News-orange)](https://news.ycombinator.com)

**Tired of undocumented APIs?** Capture real browser traffic, infer TypeScript types, and auto-generate fully-typed API clients — without writing a line of documentation.

## The Problem You're Solving

Many websites lack official API documentation or it's outdated:
- Startups launching fast don't have time for docs
- Legacy services haven't documented their APIs
- Third-party services gate access or change APIs without notice

**The old way:** Open DevTools, manually capture requests, write TypeScript types, hope they stay accurate.

**The new way:**
```bash
pnpm exec tsx scripts/discover-apis.ts --site hackernews
pnpm run codegen hackernews
# Now you have a fully-typed, auto-generated API client
```

## What You Get

✅ **Zero Manual Documentation** - Types inferred from real browser traffic
✅ **Fully Typed Clients** - TypeScript + Zod validation
✅ **Works With Any Domain** - Robinhood, MinuteInbox, Investing.com, Hacker News, etc.
✅ **Plug-and-Play** - Add new domains with just a config file
✅ **Browser-Accurate** - Captures what the UI actually does
✅ **Open Source** - MIT licensed, for the community

## 5-Minute Demo

### 1. Install
```bash
git clone https://github.com/adam-s/api-interceptor
cd api-interceptor
pnpm install
```

### 2. Start the Server
```bash
pnpm run dev
# API server on :3001
# Dashboard on :3000
```

### 3. Discover an API
```bash
pnpm exec tsx scripts/discover-apis.ts --site hackernews
# Browser opens, navigates HN, captures API traffic
# Saves to /tmp/discovered-traffic.json
```

### 4. Generate Typed Client
```bash
pnpm run codegen hackernews \
  --output ./packages/browser/generated/hn-api-client.ts \
  --traffic /tmp/discovered-traffic.json
```

### 5. Use It
```typescript
import { createHNClient } from './packages/browser/generated/hn-api-client';

const hn = createHNClient();
const stories = await hn.getTopStories();
// ✅ stories is fully typed!
// ✅ IDE autocomplete works!
// ✅ No manual type writing!
```

## How It Works

### Phase 1: Capture Real Traffic
Uses **Patchright** (headless Chromium via CDP) to intercept all API requests while you navigate a website normally. Same approach DevTools uses.

### Phase 2: Analyze Patterns
Groups requests by endpoint pattern, extracts parameters, identifies auth headers. Smart URL normalization (`/users/abc-123` → `/users/{id}`).

### Phase 3: Infer Types
Analyzes response JSON across multiple examples to build **Zod schemas**. Handles optional fields, nested objects, arrays.

### Phase 4: Generate Client
Creates a TypeScript class with:
- Typed methods for each endpoint
- Automatic auth header injection
- Zod schema validation
- Error handling
- Full JSDoc comments

## Real-World Examples

### MinuteInbox (Temp Email Service)
```bash
pnpm exec tsx scripts/discover-apis.ts --site minuteinbox
# 5 endpoints captured
# Types: Email, InboxMessage, GenerateResponse
# Auth: None (stateless)
```

### Investing.com (Trading Platform)
```bash
pnpm exec tsx scripts/discover-apis.ts --site investing
# 20+ endpoints captured
# Types: Account, Quote, EarningsCalendar, Order
# Auth: Bearer token + CSRF
# Complexity: High (shows framework scales)
```

### Hacker News (News Aggregator)
```bash
pnpm exec tsx scripts/discover-apis.ts --site hackernews
# JSON API endpoints
# Types: Story, Comment, User
# Auth: None (public)
# Demonstrates: Hierarchical data
```

### Open Trivia (Q&A Service)
```bash
pnpm exec tsx scripts/discover-apis.ts --site opentrivia
# Parametric endpoints (category, difficulty, count)
# Types: Question, Category
# Demonstrates: Query parameters
```

## Why This Matters

### For Developers
- **Ship faster** - No time wasted on manual API reverse-engineering
- **Better types** - Types based on real responses, not guesses
- **Less errors** - Zod validation catches problems early
- **Adapt quickly** - When APIs change, re-run the script

### For Security
- **Transparency** - See exactly what APIs your apps talk to
- **Auth capture** - Document auth requirements automatically
- **Compliance** - Track data flow without manual audit

### For the Open Source Community
- **De-monopolize** - Don't depend on official APIs that might disappear
- **Empower developers** - Build on closed platforms safely
- **Share patterns** - Common API patterns documented and shareable

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Patchright Browser                    │
│  (Headless Chrome with CDP route interception)          │
└──────────────────┬──────────────────────────────────────┘
                   │ captures
                   ▼
┌──────────────────────────────────────────────────────────┐
│               GenericInterceptor                         │
│  (Domain-agnostic, extracts headers, bodies, patterns)  │
└──────────────────┬──────────────────────────────────────┘
                   │ analyzes
                   ▼
┌──────────────────────────────────────────────────────────┐
│            Traffic Analyzer + Schema Inferencer          │
│  (Groups endpoints, infers Zod schemas from examples)   │
└──────────────────┬──────────────────────────────────────┘
                   │ generates
                   ▼
┌──────────────────────────────────────────────────────────┐
│         Codegen: TypeScript Client Generator            │
│    (Writes classes, methods, validation, JSDoc)        │
└──────────────────────────────────────────────────────────┘
                   │ outputs
                   ▼
            Fully-Typed API Client
```

## Supported Domains

| Website | Status | Auth | Examples |
|---------|--------|------|----------|
| **Robinhood Trading** | ✅ Implemented | Token | Account, Orders, Quotes |
| **MinuteInbox** | ✅ Implemented | None | Email Gen, Inbox |
| **Investing.com** | ✅ Implemented | Token | Quotes, Calendar, Profile |
| **Hacker News** | 🚀 In Progress | None | Stories, Comments, Users |
| **Open Trivia** | 🚀 In Progress | None | Questions, Categories |
| **Dog CEO** | 🚀 In Progress | None | Images, Breeds |
| **Random User** | 🚀 In Progress | None | Profiles, Search |
| **JSONPlaceholder** | 🚀 In Progress | None | Posts, Comments, CRUD |
| **_Your API Here_** | 📝 Contribute | Any | Your Examples |

## Getting Started

### Prerequisites
- Node.js 22+ (use `nvm` if needed)
- pnpm (npm alternative, better monorepo support)
- Docker (optional, for containerization)

### Installation & Setup

```bash
# Clone
git clone https://github.com/adam-s/api-interceptor
cd api-interceptor

# Install
pnpm install

# Start dev server
pnpm run dev

# In another terminal: Run discovery
pnpm exec tsx scripts/discover-apis.ts --site hackernews

# Generate client
pnpm run codegen hackernews
```

### Local CI Before Committing

```bash
# Full CI (lint, type, test, build, docker)
./scripts/ci-local.sh

# Quick (skip docker)
./scripts/ci-local.sh --quick
```

## Project Structure

```
api-interceptor/
├── packages/
│   ├── browser/              # Traffic capture + codegen
│   │   ├── src/
│   │   │   ├── shared/       # GenericInterceptor, session management
│   │   │   ├── codegen/      # CLI + traffic analyzer → Zod → TS
│   │   │   ├── domain-config.ts  # Registry of all domains
│   │   │   ├── robinhood/    # Reference implementation
│   │   │   ├── investing/    # Complex auth example
│   │   │   ├── minuteinbox/  # Simple example
│   │   │   └── ...
│   ├── shared/               # Common utilities
│   └── web/                  # Dashboard UI
├── apps/
│   ├── api/                  # Hono server (traffic collection)
│   └── web/                  # Next.js 16 dashboard
├── scripts/
│   ├── ci-local.sh          # Local CI checks
│   └── discover-apis.ts     # Multi-domain discovery
├── docs/
│   ├── PHASE_4_MULTI_DOMAIN.md  # Detailed implementation
│   └── ARCHITECTURE.md           # Design docs
└── .github/workflows/
    └── ci.yml               # GitHub Actions
```

## Development & Contributing

### Run Tests
```bash
pnpm test
pnpm test:watch
```

### Type Checking
```bash
pnpm typecheck
```

### Code Quality (Biome)
```bash
pnpm biome ci .    # Check
pnpm biome fix .   # Auto-fix
```

### Add a New Domain

1. Create domain config:
```bash
mkdir packages/browser/src/yoursite
touch packages/browser/src/yoursite/{config,interceptor}.ts
```

2. Implement (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)):
```typescript
// config.ts
export const yoursiteConfig: InterceptorConfig = {
  domainName: 'yoursite',
  interceptPatterns: ['https://api.yoursite.com/**'],
  requiredHeaders: [],
  // ...
};

// interceptor.ts
export class YourSiteInterceptor extends GenericInterceptor {
  constructor() {
    super(yoursiteConfig);
  }
}
```

3. Register in `domain-config.ts` (3 lines)

4. Discover:
```bash
pnpm exec tsx scripts/discover-apis.ts --site yoursite
```

5. Submit PR with generated client!

## Roadmap

- [x] Phase 1 - Generic base classes (Robinhood reference)
- [x] Phase 2 - Domain registry & decoupling
- [x] Phase 3 - Codegen CLI (Zod + TypeScript)
- [ ] Phase 4 - Multi-domain discovery (7+ real APIs)
- [ ] Phase 5 - npm package + CI/CD
- [ ] Phase 6 - Community contributions

## FAQ

**Q: Is this legal?**
A: The framework is neutral. It captures browser traffic like DevTools. **Respect each site's ToS**. Use for personal projects, internal tools, authorized integrations.

**Q: How accurate are the types?**
A: Quality depends on response consistency. We handle optional fields, nested objects, arrays. For complex APIs, you can manually refine generated schemas.

**Q: Will it work with authentication?**
A: Yes! If you're logged in, the framework captures your session cookies/tokens. Generated clients automatically inject them.

**Q: Can I sell products built with this?**
A: MIT licensed. Use freely. Just respect ToS of APIs you're using.

**Q: How do I use this for my own API?**
A: Generate a client from your own traffic to document API patterns, validate schemas, or expose to external integrators.

## Philosophy

### Zero Manual API Documentation

When you capture real browser traffic, you're seeing the truth. Not what the API "should" do, but what it actually does.

This is ideal for:
- **Closed/internal APIs** with no public docs
- **Rapid prototyping** and integration
- **Monitoring** third-party APIs
- **Reverse-engineering** without guessing
- **Building adapters** across different API styles

### Extensible Design

The same framework works for Robinhood (high auth complexity), MinuteInbox (no auth), and Hacker News (public API). That's powerful.

Adding a new domain takes:
- 1 config file (30 lines)
- 1 interceptor class (5 lines)
- 2 lines to register

**Zero** changes to core infrastructure.

## License

MIT - Use freely, modify, distribute. See [LICENSE](LICENSE).

## Support

- 📖 **Docs** - [docs/](docs/)
- 🐛 **Issues** - [GitHub Issues](https://github.com/adam-s/api-interceptor/issues)
- 💬 **Discussions** - [GitHub Discussions](https://github.com/adam-s/api-interceptor/discussions)
- 🐦 **Twitter** - [@apiinterceptor](https://twitter.com)

## Credits

Built by developers frustrated with undocumented APIs. Made for the Hacker News community.

---

**Stop reverse-engineering APIs manually. Start capturing real traffic, generating real types, and shipping fast.**
