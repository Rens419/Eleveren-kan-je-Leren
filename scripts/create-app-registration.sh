#!/usr/bin/env bash
# Creates the Entra app registration Eleveren needs for one-click PIM activation (future Graph mode).
# Run by an admin who may create app registrations: `az login`, then ./scripts/create-app-registration.sh
# Nothing is granted here: an admin still has to approve the permissions (URL printed at the end).
set -euo pipefail

NAME="${1:-Eleveren}"
GRAPH="00000003-0000-0000-c000-000000000000"
SCOPES=(
  "User.Read"
  "PrivilegedEligibilitySchedule.Read.AzureADGroup"
  "PrivilegedAssignmentSchedule.ReadWrite.AzureADGroup"
  "RoleManagementPolicy.Read.AzureADGroup"
)

command -v az >/dev/null || { echo "Azure CLI (az) ontbreekt." >&2; exit 1; }
tenant=$(az account show --query tenantId -o tsv)

echo "Rechten opzoeken in Microsoft Graph…"
access=""
for scope in "${SCOPES[@]}"; do
  id=$(az ad sp show --id "$GRAPH" --query "oauth2PermissionScopes[?value=='${scope}'].id | [0]" -o tsv)
  [ -n "$id" ] || { echo "Recht ${scope} niet gevonden." >&2; exit 1; }
  access="${access}{\"id\":\"${id}\",\"type\":\"Scope\"},"
done
manifest=$(mktemp)
printf '[{"resourceAppId":"%s","resourceAccess":[%s]}]' "$GRAPH" "${access%,}" > "$manifest"

app=$(az ad app create --display-name "$NAME" \
  --sign-in-audience AzureADMyOrg \
  --is-fallback-public-client true \
  --public-client-redirect-uris "http://localhost" \
  --required-resource-accesses "@${manifest}" \
  --query appId -o tsv)
rm -f "$manifest"
az ad sp create --id "$app" >/dev/null

cat <<EOF

App-registratie '${NAME}' aangemaakt (single-tenant, public client, geen secret).

  Tenant-ID:  ${tenant}
  Client-ID:  ${app}

Een beheerder moet de rechten nog goedkeuren, via deze link:
  https://login.microsoftonline.com/${tenant}/adminconsent?client_id=${app}

Zet daarna in de Eleveren-config: "auth": { "tenantId": "${tenant}", "clientId": "${app}" }
EOF
