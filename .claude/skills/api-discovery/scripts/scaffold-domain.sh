#!/usr/bin/env bash
set -euo pipefail

# Scaffold a new domain plugin from templates.
#
# Usage: bash scaffold-domain.sh <domain-name> <root-domain>
# Example: bash scaffold-domain.sh ticketmaster ticketmaster.com
#
# Creates: domains/<domain-name>/ with package.json, config.ts, interceptor.ts, routes.ts, index.ts

DOMAIN_NAME="${1:?Usage: scaffold-domain.sh <domain-name> <root-domain>}"
ROOT_DOMAIN="${2:?Usage: scaffold-domain.sh <domain-name> <root-domain>}"

# Derive class name: ticketmaster → Ticketmaster, seatgeek → Seatgeek
DOMAIN_CLASS="$(echo "${DOMAIN_NAME}" | sed 's/.*/\u&/')"
DOMAIN_DISPLAY="${DOMAIN_CLASS}"

SKILL_DIR="$(dirname "$0")/.."
TEMPLATE_DIR="${SKILL_DIR}/templates"
PROJECT_ROOT="$(cd "${SKILL_DIR}/../../.." && pwd)"
DOMAIN_DIR="${PROJECT_ROOT}/domains/${DOMAIN_NAME}"

if [ -d "${DOMAIN_DIR}" ]; then
  echo "Domain already exists: ${DOMAIN_DIR}"
  echo "To recreate, delete it first: rm -rf ${DOMAIN_DIR}"
  exit 1
fi

echo "Scaffolding domain: ${DOMAIN_NAME} (${ROOT_DOMAIN})"

mkdir -p "${DOMAIN_DIR}/src"

# Copy and fill templates
for template in "${TEMPLATE_DIR}"/*.template; do
  filename="$(basename "${template}" .template)"
  dest="${DOMAIN_DIR}/src/${filename}"

  # package.json goes in root, not src/
  if [ "${filename}" = "package.json" ]; then
    dest="${DOMAIN_DIR}/${filename}"
  fi

  sed \
    -e "s/{{DOMAIN_NAME}}/${DOMAIN_NAME}/g" \
    -e "s/{{DOMAIN_CLASS}}/${DOMAIN_CLASS}/g" \
    -e "s/{{DOMAIN_DISPLAY}}/${DOMAIN_DISPLAY}/g" \
    -e "s/{{ROOT_DOMAIN}}/${ROOT_DOMAIN}/g" \
    "${template}" > "${dest}"
done

echo "Created: ${DOMAIN_DIR}/"
ls -la "${DOMAIN_DIR}/src/"

echo ""
echo "Next steps:"
echo "  1. Add to apps/api/src/register-domains.ts:"
echo "     import { plugin as ${DOMAIN_NAME} } from '@interceptor/domain-${DOMAIN_NAME}';"
echo "     registerDomain(${DOMAIN_NAME});"
echo ""
echo "  2. Add to apps/api/package.json dependencies:"
echo "     \"@interceptor/domain-${DOMAIN_NAME}\": \"workspace:*\""
echo ""
echo "  3. Run: pnpm install"
echo ""
echo "  4. Discover APIs: connect browser with ?capture=${ROOT_DOMAIN}"
echo "     Then populate src/routes.ts with discovered endpoints."
