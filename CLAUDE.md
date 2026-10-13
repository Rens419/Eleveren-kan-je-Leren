# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Eleveren is a Tauri v2 menu bar app (Rust backend, React + TypeScript frontend) for MSP admins: search a customer, open that customer's admin portals in a chosen browser/profile, and run a PIM-for-Groups activation workflow with a ticket number. macOS first; Windows is planned (browser opening and tray positioning are the OS-specific parts). UI text is Dutch, code and comments are English.

## Commands

```bash
npm install
npm run tauri dev                 # run the app (needs Rust: `brew install rustup`, Xcode CLT)
npm run dev                       # UI only, in a browser, backed by src/lib/mock.ts (fictional customers)
npm run build                     # tsc --noEmit + vite build
npm test                          # cargo test --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml <name>   # a single Rust test, e.g. `timers::tests::warns_once`
npm run check:privacy             # scripts/check-no-customer-data.sh
npm run tauri build -- --target universal-apple-darwin
python3 scripts/make-icons.py && npx tauri icon src-tauri/icons/source.png   # regenerate icons
```

`cargo`/`rustup` live in `/opt/homebrew/opt/rustup/bin` after `brew install rustup`; add it to `PATH` if `cargo` is not found.

## Hard rule: no customer data in the repo or in chat

The real config (customer names, `*.onmicrosoft.com` domains, tenant IDs) and any bookmark export must never be committed, pasted into chat, or read by Claude. Use only fictional customers (Contoso, Fabrikam, Northwind…) and tenant GUIDs of the form `00000000-0000-0000-0000-0000000000NN` in examples, tests and mockups. `scripts/check-no-customer-data.sh` enforces this (CI + `.githooks/pre-commit`; enable with `git config core.hooksPath .githooks`). Runtime data lives in `~/Library/Application Support/io.github.rens419.eleveren/` (`config.json` shared by hand, `settings.json` personal).

## Architecture

Two windows, one frontend bundle: `src/main.tsx` renders `views/Panel.tsx` (tray popover, window label `panel`) or `views/Settings.tsx` (`?window=settings`, created on demand in `windows.rs`). Both talk to Rust only through `src/lib/api.ts`; mutating commands return a fresh `AppStateDto` and Rust emits a `state-changed` event, which `lib/store.tsx` turns into a refetch. `api.ts` falls back to `lib/mock.ts` when not running inside Tauri.

Backend (`src-tauri/src`):
- `config/` — `Config` (the shareable file: defaults, custom portals, customers, optional `auth`), `merge_from` (import semantics), `normalize` (ids/slugs). `templates.rs` holds the built-in portal URL templates (variables `{initialDomain}`, `{tenantId}`, `{defaultDomain}`, `{tenantPrefix}`) and `resolve_for` per customer. `bookmarks.rs` parses Netscape-HTML exports into customer candidates.
- `state.rs` — `Settings` (personal: browser/profile, favorites, recent, local PIM `Timer`s) and `AppState` behind a `Mutex` (`Shared`).
- `commands.rs` — the whole UI surface; `snapshot()` builds `StateDto` (config + settings + resolved portal URLs per customer).
- `timers.rs` — 15 s background ticker; the pure `step()` decides notifications, delayed "open M365", expiry (unit-tested without Tauri).
- `windows.rs` — panel toggle/positioning under the tray icon, settings window, and the `MODAL` flag that stops the panel hiding on blur while a native file dialog is open (dialogs therefore live in Rust commands, not in JS).
- `tenant.rs` — tenant-ID from a domain via the public OpenID configuration (no sign-in).
- `browser.rs` — `open` via `/usr/bin/open`, maps a Chromium profile display name to its directory using `Local State`; only http(s) URLs are accepted.

PIM model: there is no Graph connection yet (it needs an app registration with admin consent; see `docs/app-registratie.md`). v1 is a "hand-off": `start_handoff` opens `defaults.pimUrl` and copies the group name, the user activates in the portal, `confirm_activation` stores a local `Timer`. The status shown in the UI is therefore *locally tracked*, not read from Entra. A future Graph mode should sit behind the same commands, enabled by `config.auth`.

## Conventions worth knowing

- Look: native macOS (menu-style rows, system blue selection, SF/SF Mono, translucent material, spring-like push transitions, inline validation instead of toasts). The user rejected a card/pill/icon-chip dashboard look as "AI slop"; keep to `src/styles.css` tokens and the approved mockup style.
- Customer `id` is a stable slug assigned by `Config::normalize`; favorites, recents and timers reference it, so do not regenerate ids on rename.
- Capabilities (`src-tauri/capabilities/default.json`) grant both windows only `core:default` and `core:window:allow-hide`; new plugin use needs an explicit permission there.
- macOS signing is ad hoc (`signingIdentity: "-"`); `scripts/install.sh` strips the quarantine flag. There is no Apple Developer ID.
