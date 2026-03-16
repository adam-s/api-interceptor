# Phase 3: Generic API Client Generator

**Objective:** Auto-generate typed API clients from captured traffic + domain configs.

**Timeline:** 3-4 days
**Effort:** ~30 hours
**Deliverables:** API client generator tool + RobinhoodApiClient v2 (auto-generated)

---

## Architecture

### Input
1. **Captured Traffic** (from `/browser/traffic` endpoint)
   - Request: URL, method, headers, body
   - Response: status, headers, body (typically JSON)

2. **Domain Config**
   - Base URLs, header schemas, required headers
   - Verification endpoint patterns

### Output
1. **TypeScript API Client** (generated)
   - Zod schemas for request/response
   - Type-safe methods for each endpoint
   - Error handling
   - Header injection for auth

### Process
```
Captured Traffic
     ↓
Pattern Extraction (deduplicate URLs, group by method)
     ↓
Schema Inference (Zod schemas from response JSON)
     ↓
Method Generation (one method per endpoint)
     ↓
Client Class Assembly (inject auth, configure URLs)
     ↓
TypeScript API Client (ready to use)
```

---

## Tasks

### Task 1: Traffic Analyzer
File: `packages/browser/src/codegen/traffic-analyzer.ts`

```typescript
interface EndpointPattern {
  method: string;
  pattern: string;           // /accounts/{id}/positions
  examples: TrafficEntry[];
  requestSchema?: ZodSchema;
  responseSchema?: ZodSchema;
  minExamples: number;       // Need ≥3 examples to infer schema
}

// Deduplicate traffic entries by replacing IDs with {id} patterns
function normalizeUrl(url: string): string {
  return url
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '{id}')
    .replace(/\/\d+\//g, '/{id}/')
    .replace(/\?.*$/, '');
}

// Group traffic by endpoint pattern
function analyzeTraffic(entries: TrafficEntry[]): Map<string, EndpointPattern[]> {
  // For each unique (method, normalizedUrl) pair, collect examples
  // Return map of domain → endpoint patterns
}
```

### Task 2: Schema Inferencer
File: `packages/browser/src/codegen/schema-inferencer.ts`

```typescript
// Given ≥3 response examples, infer Zod schema
function inferResponseSchema(examples: unknown[]): ZodSchema {
  // Analyze JSON structure across examples
  // Return z.object({ ... })
  // Handle optional fields, unions, arrays
}

// Given ≥3 request body examples, infer input schema
function inferRequestSchema(examples: unknown[]): ZodSchema {
  // Similar to response schema
}

// Validate schema consistency across examples
function validateSchema(schema: ZodSchema, examples: unknown[]): boolean {
  // Parse each example with schema, report mismatches
}
```

### Task 3: Client Code Generator
File: `packages/browser/src/codegen/client-codegen.ts`

```typescript
interface ClientGenerationConfig {
  domainName: string;
  baseUrls: string[];
  requiredHeaders: string[];
  endpoints: EndpointPattern[];
  className: string;          // e.g., "RobinhoodApiClient"
}

// Generate TypeScript client code as string
function generateClient(config: ClientGenerationConfig): string {
  // Template:
  // class RobinhoodApiClient {
  //   constructor(headers: Record<string, string>)
  //   async getAccounts(): Promise<AccountsResponse> { ... }
  //   async getPositions(accountId: string): Promise<PositionsResponse> { ... }
  //   ...
  // }

  // Each method:
  // - Takes URL params as fn args
  // - Returns typed Promise<T>
  // - Includes request/response Zod schemas
  // - Injects auth headers
  // - Handles errors gracefully
}

// Generate Zod schemas as code
function generateSchemas(endpoints: EndpointPattern[]): string {
  // export const AccountsResponseSchema = z.object({ ... })
}

// Assemble full TypeScript file
function assembleClientFile(config: ClientGenerationConfig): string {
  // Imports + schemas + client class
}
```

### Task 4: CLI Tool
File: `packages/browser/src/codegen/cli.ts`

```typescript
// Usage: pnpm codegen robinhood --output ./generated/robinhood-api-client.ts

async function main() {
  const domain = process.argv[2];
  const outputPath = process.argv[3];

  // 1. Fetch traffic from /browser/traffic
  const traffic = await fetch('http://localhost:3001/browser/traffic').then(r => r.json());

  // 2. Get domain config
  const config = getDomainConfig(domain);

  // 3. Analyze traffic
  const patterns = analyzeTraffic(traffic.entries);

  // 4. Infer schemas for each endpoint
  const endpoints = patterns.map(ep => ({
    ...ep,
    requestSchema: inferRequestSchema(ep.examples.map(ex => ex.requestBody)),
    responseSchema: inferResponseSchema(ep.examples.map(ex => ex.responseBody)),
  }));

  // 5. Generate client code
  const clientCode = generateClient({
    domainName: domain,
    baseUrls: config.baseUrls,
    requiredHeaders: config.requiredHeaders,
    endpoints,
    className: `${capitalize(domain)}ApiClient`,
  });

  // 6. Write to file
  fs.writeFileSync(outputPath, clientCode);
  console.log(`✅ Generated ${outputPath}`);
}
```

### Task 5: Integration Test
File: `packages/browser/src/codegen/__tests__/codegen.test.ts`

```typescript
describe('API Client Generator', () => {
  it('generates Robinhood client from traffic', async () => {
    const traffic = [
      {
        method: 'GET',
        url: 'https://api.robinhood.com/accounts/',
        requestHeaders: { Authorization: 'Bearer token' },
        responseBody: { results: [{ account_number: '123' }] },
      },
      // ... more examples
    ];

    const client = generateClient(robinhoodConfig);

    // Should generate valid TypeScript
    expect(client).toContain('class RobinhoodApiClient');
    expect(client).toContain('async getAccounts()');
    expect(client).toContain('AccountsResponseSchema');
  });
});
```

---

## Success Criteria

✅ Traffic analyzer deduplicates URLs correctly (matching {id} patterns)
✅ Schema inferencer produces valid Zod schemas
✅ Generated client has zero TypeScript errors
✅ Generated client compiles to JavaScript
✅ CLI tool works end-to-end: traffic → client
✅ Generated code includes proper error handling
✅ Backward compatible: old RobinhoodApiClient still works

---

## What Comes Next (Phase 4)

Implement LinkedInInterceptor + LinkedIn domain config, then use Phase 3 generator to auto-create LinkedIn API client from captured traffic.

---

## Go/No-Go

**Status:** 🚀 READY TO IMPLEMENT

**Complexity:** Medium-High (schema inference is tricky)
**Risk:** Low (generated code can be manually reviewed)
**Value:** High (unlocks "one-command API discovery" for any website)
