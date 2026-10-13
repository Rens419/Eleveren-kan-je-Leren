#!/usr/bin/env bash
# Fails when the working tree contains something that looks like real customer data:
# an onmicrosoft.com domain or a tenant GUID that is not one of the fictional examples.
# Runs in CI and as a pre-commit hook (see .githooks/pre-commit).
set -euo pipefail
cd "$(dirname "$0")/.."

ALLOWED_PREFIXES='contoso|fabrikam|northwindtraders|tailspintoys|woodgrovebank|litwareinc|adventureworks|wideworldimporters|proseware|alpineskihouse|fourthcoffee|lucernepublishing|margiestravel|klant|customer|example|tenant|yourtenant|company'
# Fictional fixtures, plus Microsoft Graph's own public application ID.
FAKE_GUID='^00000000-0000-0000-0000-[0-9a-f]{12}$|^aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee$|^00000003-0000-0000-c000-000000000000$'

files=$(git ls-files -co --exclude-standard | grep -v -E '^(scripts/check-no-customer-data\.sh|package-lock\.json|src-tauri/Cargo\.lock)$' || true)
status=0

domains=$(echo "$files" | xargs grep -I -H -o -i -E '[a-z0-9][a-z0-9-]*\.onmicrosoft\.com' 2>/dev/null \
  | grep -v -i -E ":(${ALLOWED_PREFIXES})\.onmicrosoft\.com$" || true)
if [ -n "$domains" ]; then
  echo "Mogelijk een echt klantdomein in de repo:" >&2
  echo "$domains" >&2
  status=1
fi

guids=$(echo "$files" | xargs grep -I -H -o -i -E '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' 2>/dev/null \
  | awk -F: '{ print $0 }' | while IFS= read -r line; do
      guid="${line##*:}"
      if ! echo "$guid" | tr 'A-F' 'a-f' | grep -q -E "$FAKE_GUID"; then echo "$line"; fi
    done || true)
if [ -n "$guids" ]; then
  echo "Mogelijk een echte tenant-ID (GUID) in de repo:" >&2
  echo "$guids" >&2
  status=1
fi

tracked_config=$(git ls-files | grep -E '(^|/)(config|settings)\.json$|\.local\.json$|bookmarks.*\.html$|favorie?ten.*\.html$' | grep -v -E '^src-tauri/(capabilities|tauri\.conf)|^examples/' || true)
if [ -n "$tracked_config" ]; then
  echo "Deze bestanden horen niet in git:" >&2
  echo "$tracked_config" >&2
  status=1
fi

[ $status -eq 0 ] && echo "Geen klantgegevens gevonden."
exit $status
