#!/usr/bin/env bash
# Installs the latest Eleveren release into /Applications.
#   curl -fsSL https://raw.githubusercontent.com/Rens419/Eleveren-kan-je-Leren/main/scripts/install.sh | bash
set -euo pipefail

REPO="Rens419/Eleveren-kan-je-Leren"
APP="Eleveren"

[ "$(uname -s)" = "Darwin" ] || { echo "Deze installer werkt alleen op macOS." >&2; exit 1; }

echo "Zoeken naar de nieuwste versie…"
json=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest")
url=$(printf '%s' "$json" | grep -o '"browser_download_url": *"[^"]*\.dmg"' | head -n1 | sed 's/.*"\(https[^"]*\)"/\1/')
[ -n "$url" ] || { echo "Geen .dmg gevonden in de nieuwste release." >&2; exit 1; }

tmp=$(mktemp -d)
mount=""
cleanup() { [ -n "$mount" ] && hdiutil detach "$mount" -quiet 2>/dev/null || true; rm -rf "$tmp"; }
trap cleanup EXIT

echo "Downloaden: ${url##*/}"
curl -fL --progress-bar -o "$tmp/app.dmg" "$url"

mount=$(hdiutil attach "$tmp/app.dmg" -nobrowse -readonly -noverify -quiet | awk 'END { $1=$2=""; sub(/^ +/, ""); print }')
[ -d "$mount/${APP}.app" ] || { echo "${APP}.app niet gevonden in de dmg." >&2; exit 1; }

pkill -x "$APP" 2>/dev/null || true
rm -rf "/Applications/${APP}.app"
cp -R "$mount/${APP}.app" "/Applications/"
# The app is signed ad hoc (no Apple Developer ID), so drop the quarantine flag
# or Gatekeeper refuses to open it.
xattr -dr com.apple.quarantine "/Applications/${APP}.app"

echo "Klaar. ${APP} staat in /Applications en start nu."
open "/Applications/${APP}.app"
