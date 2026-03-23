#!/usr/bin/env bash
# Cache API route responses for offline dashboard development.
# Usage: ./scripts/cache-routes.sh [--port 3001] [--domain boardshop]
set -euo pipefail

PORT=3001
DOMAIN=""
CACHE_DIR="tmp/cache"

while [[ $# -gt 0 ]]; do
  case $1 in
    --port) PORT="$2"; shift 2;;
    --domain) DOMAIN="$2"; shift 2;;
    --cache-dir) CACHE_DIR="$2"; shift 2;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

# Precondition: verify API server is reachable
if ! curl -sf --max-time 5 "http://localhost:${PORT}/api" > /dev/null 2>&1; then
  echo "ERROR: API server not reachable at localhost:${PORT}. Start it first."
  exit 1
fi

# Precondition: verify requested domain is registered
if [ -n "$DOMAIN" ]; then
  if ! curl -s "http://localhost:${PORT}/api" | python3 -c "import sys,json; d=json.load(sys.stdin); names=[x['name'] for x in d.get('domains',[])]; exit(0 if '${DOMAIN}' in names else 1)" 2>/dev/null; then
    echo "ERROR: Domain '${DOMAIN}' is not registered on localhost:${PORT}."
    echo "Registered domains: $(curl -s "http://localhost:${PORT}/api" | python3 -c "import sys,json; d=json.load(sys.stdin); print(', '.join(x['name'] for x in d.get('domains',[])))")"
    exit 1
  fi
fi

# Get all domains and routes from the API index
ROUTES_JSON=$(curl -s "http://localhost:${PORT}/api")

echo "$ROUTES_JSON" | python3 -c "
import json, sys, subprocess, os

data = json.load(sys.stdin)
port = '${PORT}'
domain_filter = '${DOMAIN}'
cache_dir = '${CACHE_DIR}'

for domain in data.get('domains', []):
    name = domain.get('name', '')
    if domain_filter and name != domain_filter:
        continue

    os.makedirs(f'{cache_dir}/{name}', exist_ok=True)
    print(f'Caching {name}...')

    for route in domain.get('routes', []):
        parts = route.split(' ', 1)
        if len(parts) != 2:
            continue
        method, path = parts

        if method != 'GET':
            continue

        # Skip routes with unresolved path params
        if ':' in path:
            print(f'  SKIP {path} (needs params)')
            continue

        # Generate cache filename from path
        cache_name = path.replace(f'/api/{name}/', '').replace('/', '-') or 'index'

        url = f'http://localhost:{port}{path}'

        # Add default query params for search routes
        if 'search' in path and '?' not in url:
            url += '?q=test'

        print(f'  GET {path} -> {cache_dir}/{name}/{cache_name}.json')
        result = subprocess.run(
            ['curl', '-s', '--max-time', '30', url],
            capture_output=True, text=True
        )
        outpath = f'{cache_dir}/{name}/{cache_name}.json'
        with open(outpath, 'w') as f:
            f.write(result.stdout)

print('Done.')
"
