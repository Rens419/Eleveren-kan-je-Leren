# App-registratie voor één-klik-activatie (nog niet nodig voor v0.1)

Eleveren v0.1 activeert PIM niet zelf: het opent de PIM-pagina en houdt de tijd lokaal bij. Voor echte één-klik-activatie via Microsoft Graph is een app-registratie in de eigen tenant nodig, met toestemming van een beheerder. Dit document is bedoeld als onderbouwing voor die aanvraag.

## Waarom kan dit niet zonder?

De Graph-rechten voor PIM voor groepen vereisen toestemming van een beheerder (admin consent). Er is geen route zonder registratie: de oude, ongedocumenteerde `mspim`-API met een Azure CLI-token werkt sinds mei 2026 niet meer ([az-pim-cli#121](https://github.com/netr0m/az-pim-cli/issues/121)), en de Azure CLI-app van Microsoft kan de PIM-groepsrechten niet krijgen (`AADSTS65002`). Het project [Elevate](https://github.com/FrodeHus/elevate) legt hetzelfde uit.

## Wat wordt er aangevraagd?

Eén app-registratie, **alleen voor onze eigen tenant**, als *public client* (geen client secret, redirect `http://localhost`). Alle rechten zijn **delegated**: de app kan nooit meer dan wat de ingelogde medewerker zelf al in de Azure-portal mag.

| Recht (Microsoft Graph, delegated) | Waarvoor |
|---|---|
| `User.Read` | Eigen profiel lezen na inloggen |
| `PrivilegedEligibilitySchedule.Read.AzureADGroup` | Lezen voor welke PIM-groepen de medewerker eligible is |
| `PrivilegedAssignmentSchedule.ReadWrite.AzureADGroup` | De eigen eligibility activeren en deactiveren (met ticketnummer en reden) |
| `RoleManagementPolicy.Read.AzureADGroup` | Lezen welke regels de groep heeft (maximale duur, MFA, ticket verplicht) |

Wat de app **niet** kan: andermans toegang wijzigen, rollen toewijzen, gegevens van klanten lezen, of iets buiten PIM-activatie doen. MFA en Conditional Access blijven gewoon gelden bij het inloggen.

## Aanmaken

Een beheerder die app-registraties mag maken voert uit (Azure CLI, `az login`):

```bash
./scripts/create-app-registration.sh
```

Het script maakt de registratie aan en print de admin-consent-link. **Het geeft zelf geen toestemming**: dat doet een beheerder via die link. Zet daarna de tenant-ID en client-ID in de Eleveren-config (`"auth": { "tenantId": "…", "clientId": "…" }`).

Handmatig kan ook: Entra admin center → App registrations → New registration → *Accounts in this organizational directory only* → platform *Mobile and desktop applications* met redirect `http://localhost` → API permissions → de vier delegated rechten hierboven → *Grant admin consent*.

## Status in de code

De config kent het veld `auth` al en de activatie zit achter een eigen module (`src-tauri/src/activation`, zodra Graph-modus wordt gebouwd). De huidige PIM-flow werkt zonder en blijft de terugvaloptie.
