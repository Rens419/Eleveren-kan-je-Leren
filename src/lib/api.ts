import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AppStateDto, BookmarkImport, Candidate, Config, SettingsPatch } from "./types";
import { mock } from "./mock";

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!inTauri) return mock.call<T>(cmd, args);
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw new Error(typeof e === "string" ? e : (e as Error).message ?? String(e));
  }
}

export const api = {
  getState: () => call<AppStateDto>("get_state"),
  saveConfig: (config: Config) => call<AppStateDto>("save_config", { config }),
  saveSettings: (patch: SettingsPatch) => call<AppStateDto>("save_settings", { patch }),
  resolveTenant: (domain: string) => call<string>("resolve_tenant", { domain }),
  copyText: (text: string) => call<void>("copy_text", { text }),
  openPortal: (customerId: string, portalId: string) => call<string>("open_portal", { customerId, portalId }),
  startHandoff: (customerId: string, ticket: string) => call<string>("start_handoff", { customerId, ticket }),
  reopenPim: () => call<void>("reopen_pim"),
  confirmActivation: (customerId: string, ticket: string, durationMinutes: number) =>
    call<AppStateDto>("confirm_activation", { customerId, ticket, durationMinutes }),
  endActivation: (customerId: string) => call<AppStateDto>("end_activation", { customerId }),
  pickBookmarks: () => call<BookmarkImport | null>("pick_bookmarks"),
  applyImport: (candidates: Candidate[], pimUrl: string | null, groupTemplate: string | null) =>
    call<AppStateDto>("apply_import", { candidates, pimUrl, groupTemplate }),
  importConfig: () => call<number | null>("import_config"),
  exportConfig: () => call<string | null>("export_config"),
  listBrowserProfiles: (browser: string) => call<{ dir: string; name: string }[]>("list_browser_profiles", { browser }),
  openSettings: (tab?: string) => call<void>("open_settings_window", { tab: tab ?? null }),
  hidePanel: () => call<void>("hide_panel"),
  quit: () => call<void>("quit_app"),
};

export function onEvent(name: string, handler: (payload: unknown) => void): () => void {
  if (!inTauri) return mock.on(name, handler);
  let un: (() => void) | undefined;
  let cancelled = false;
  listen(name, (e) => handler(e.payload)).then((f) => (cancelled ? f() : (un = f)));
  return () => {
    cancelled = true;
    un?.();
  };
}
