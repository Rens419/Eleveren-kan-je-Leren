# Eleveren

Menubalk-app voor macOS waarmee je met één klik de adminportalen van een klant opent en de PIM-groep voor die klant activeert (met ticketnummer). Gemaakt voor MSP's die via GDAP en CIPP bij klanten werken.

- Zoek een klant, kies een portaal (M365, Exchange, Entra, Teams, Azure, Intune, SharePoint, Defender, Purview, Power Platform, Power BI, eigen links zoals CIPP) en het opent in de browser en het profiel van jouw keuze.
- Vul een ticketnummer in en activeer PIM. De app opent de PIM-pagina, zet de groepsnaam op je klembord, houdt de resterende tijd bij en meldt het 10 minuten voor het verlopen.
- Klanten voeg je toe in de app, of je importeert je browserfavorieten.

> **Geen klantgegevens in deze repo.** De klantconfig staat lokaal op je Mac en wordt handmatig gedeeld. Zie [Privacy](#privacy).

## Installeren

```bash
curl -fsSL https://raw.githubusercontent.com/Rens419/Eleveren-kan-je-Leren/main/scripts/install.sh | bash
```

Het script haalt de nieuwste release op, zet `Eleveren.app` in `/Applications` en start hem. De app is niet door Apple genotariseerd (geen Developer-account), het script haalt daarom de quarantaine-vlag weg zodat macOS hem niet blokkeert. Wil je dat niet, download dan de `.dmg` zelf van de [releases](https://github.com/Rens419/Eleveren-kan-je-Leren/releases) en kies bij de eerste start *Systeeminstellingen → Privacy en beveiliging → Toch openen*.

## Eerste start: klanten toevoegen

Open het paneel via het icoon in de menubalk of met `⌥⌘E`. Er zijn drie manieren:

1. **Config importeren**: een collega exporteert zijn config (*Instellingen → Delen → Exporteer*) en deelt het bestand via Teams of OneDrive. Jij importeert het.
2. **Uit browserfavorieten**: exporteer je favorieten als HTML (Edge: *Favorieten → ⋯ → Favorieten exporteren*). Elke map met Microsoft-adminlinks wordt een klant. Het onmicrosoft-domein en de tenant-ID worden uit de links gehaald. Een favoriet met "PIM" in de naam wordt je standaard PIM-pagina.
3. **Handmatig**: *Instellingen → Klanten → +*. Naam en `…onmicrosoft.com`-domein is genoeg, de tenant-ID zoekt de app zelf op.

## PIM-activatie (zonder app-registratie)

PIM voor groepen kan alleen via de Graph API met rechten waar een beheerder toestemming voor moet geven. Tot dat geregeld is, werkt Eleveren zo:

1. Je vult een ticketnummer in en klikt **Activeer PIM**.
2. De PIM-pagina opent en de groepsnaam staat op je klembord. De reden en het ticketnummer kopieer je met één klik.
3. Je activeert in de portal en klikt in Eleveren op **Geactiveerd**. De app houdt dan **lokaal** de resterende tijd bij en opent na een paar minuten (GDAP-wachttijd) het M365-portaal.

Eén-klik-activatie via Graph is voorbereid: zie [docs/app-registratie.md](docs/app-registratie.md) voor wat er nodig is en de tekst voor de goedkeuring.

## Privacy

- De config (`config.json`) en je persoonlijke instellingen (`settings.json`) staan in `~/Library/Application Support/io.github.rens419.eleveren/`.
- `scripts/check-no-customer-data.sh` faalt als er een echt `.onmicrosoft.com`-domein of tenant-ID in de repo staat. Het draait in CI en als pre-commit hook: `git config core.hooksPath .githooks`.
- De app doet geen analytics en stuurt niets weg. Het enige netwerkverkeer is het opzoeken van een tenant-ID bij `login.microsoftonline.com` (publieke OpenID-configuratie) en het openen van de portalen in je browser.

## Zelf bouwen

Vereist: Node 22+, Rust (`brew install rustup`) en de Xcode Command Line Tools.

```bash
npm install
npm run tauri dev      # ontwikkelen
npm test               # Rust-tests
npm run build          # typecheck + frontend-build
npm run tauri build -- --target universal-apple-darwin
```

`npm run dev` zonder Tauri toont de UI in de browser met fictieve klanten (handig voor ontwerp). Een nieuwe release maak je met een tag: `git tag v0.1.0 && git push --tags`.

## Dank

Het idee komt van [FrodeHus/elevate](https://github.com/FrodeHus/elevate) (MIT). De portaal-URL's zijn gebaseerd op de lijst in [CIPP](https://github.com/KelvinTegelaar/CIPP). Er is geen code overgenomen.

## Licentie

MIT, zie [LICENSE](LICENSE).
