# Phase 4: Multi-Domain API Discovery - Expanded Scope

Demonstrate the framework's extensibility by discovering and reverse-engineering APIs from diverse real-world websites.

## Target Websites for Discovery

### Tier 1: Financial & Authentication (Complex)
- **Investing.com** - Trading platform with authentication
  - Endpoints: Login, account data, quotes, calendar
  - Auth: Bearer token + CSRF
  - Complexity: High (2FA, session management)

- **MinuteInbox** - Temporary email service
  - Endpoints: Generate email, check inbox, refresh
  - Auth: None (stateless)
  - Complexity: Low

### Tier 2: Public Data APIs (No Auth Required)
- **Hacker News** - News aggregator
  - Endpoints: Top stories, comments, user profiles
  - Data: Immutable JSON, structured hierarchy
  - Use Case: Demonstrates read-only API patterns
  - URL: `https://news.ycombinator.com/`

- **Open Trivia Database** - Trivia questions
  - Endpoints: Random question, category list, specific category
  - Data: Multiple choice questions with answers
  - Use Case: Demonstrates parametric queries
  - URL: `https://opentdb.com/`

- **Dog API** - Dog images and breeds
  - Endpoints: Random image, breed list, breed info
  - Data: Images and structured metadata
  - Use Case: Demonstrates image/binary content mixed with JSON
  - URL: `https://dog.ceo/api/`

- **Random User Generator** - Fake user profiles
  - Endpoints: Random user, filter by gender/nationality
  - Data: Complete user object with nested data
  - Use Case: Demonstrates complex nested JSON schemas
  - URL: `https://randomuser.me/`

- **JSONPlaceholder** - Mock REST API
  - Endpoints: Posts, comments, users, todos
  - Data: Paginated, filterable, nested relationships
  - Use Case: Demonstrates CRUD patterns
  - URL: `https://jsonplaceholder.typicode.com/`

### Tier 3: Freemium APIs (Requires Key - Optional)
- **OpenWeatherMap** - Weather data
  - Endpoints: Current weather, forecast, city search
  - Auth: API key (free tier available)
  - Use Case: Demonstrates API key authentication

- **GitHub API** - Repository and user data
  - Endpoints: Search repos, get user, list issues
  - Auth: Optional (public endpoints, higher rate limits with token)
  - Use Case: Demonstrates pagination, filtering, GraphQL

## Discovery Workflow

### For Each Website:

1. **Setup Phase**
   - Create browser profile: `<site-profile-name>`
   - Navigate to website URL
   - Wait for initial page load

2. **Interaction Phase**
   - Click through major features
   - Trigger all API calls by interacting with UI
   - For search APIs: search for common terms
   - For paginated endpoints: scroll/paginate
   - For authentication: use test credentials (where available)

3. **Traffic Capture**
   - Intercept all API requests
   - Extract endpoint patterns, methods, parameters
   - Capture request/response shapes
   - Identify authentication headers

4. **Analysis Phase**
   - Group requests by endpoint
   - Identify URL patterns
   - Extract parameter names and types
   - Document auth requirements

5. **Schema Generation**
   - Use codegen CLI to analyze traffic
   - Generate Zod schemas from response examples
   - Write TypeScript client methods
   - Generate full API client

## Implementation Schedule

```
Phase 4A: MinuteInbox + Investing.com (Complex, demonstrates framework)
  ├─ Browser automation
  ├─ Account creation workflow
  └─ Full credential capture

Phase 4B: Simple Public APIs (Demonstrate extensibility)
  ├─ Hacker News (news/comments/users)
  ├─ Open Trivia (parametric API)
  ├─ Dog API (images + JSON)
  └─ Random User (nested objects)

Phase 4C: CRUD & Pagination
  ├─ JSONPlaceholder (full CRUD)
  ├─ GitHub API (search + pagination)
  └─ OpenWeatherMap (optional, requires key)

Phase 4D: Comparison & Documentation
  ├─ Compare 7+ auto-generated clients
  ├─ Identify patterns and variations
  ├─ Document API client quality metrics
  └─ Show generated code samples
```

## Expected Outcomes

By end of Phase 4, we'll have:

✅ **7+ fully-typed API clients** generated from traffic
✅ **Zero manual documentation** - all types inferred from real responses
✅ **Multi-pattern coverage** - REST, pagination, filtering, nested objects, files
✅ **Proof that framework scales** - works with unrelated domains
✅ **Quality baseline** - compare generated clients across different API styles

## Metrics to Track

For each discovered API:
- Number of unique endpoints captured
- Request/response size distribution
- Authentication method (none, key, token, cookie, OAuth)
- API response complexity (nesting depth, array sizes)
- Generated client lines of code
- Number of inferred types
- Zod schema validation success rate

## Quality Assurance

For each generated client, verify:
1. TypeScript compilation passes
2. All types are correctly inferred
3. Schemas validate actual API responses
4. Client methods handle pagination correctly
5. Error responses are typed
6. Auth headers are properly propagated

## Success Criteria

✅ All 7+ websites discovered and clients generated
✅ No human intervention needed to write API documentation
✅ All generated clients compile without errors
✅ Real API calls using generated clients all succeed
✅ Code repository demonstrates framework maturity
✅ Open source community can immediately use on their own APIs
