export interface Customer {
  id: string;
  name: string;
  initialDomain: string;
  tenantId: string | null;
  defaultDomain: string | null;
  sharepointAdminUrl: string | null;
  pimGroups: string[];
  portals: string[] | null;
  notes: string | null;
}

export interface PortalDef {
  id: string;
  label: string;
  url: string;
  icon?: string | null;
  enabledByDefault: boolean;
}

export interface Defaults {
  ticketSystem: string | null;
  durationMinutes: number;
  justificationTemplate: string;
  pimGroupTemplate: string;
  pimUrl: string;
  gdapDelayMinutes: number;
}

export interface Config {
  version: number;
  defaults: Defaults;
  auth: { tenantId: string; clientId: string } | null;
  portals: PortalDef[];
  customers: Customer[];
}

export interface Timer {
  startedAt: number;
  endsAt: number;
  ticket: string;
  durationMinutes: number;
  warned: boolean;
  openPortal: string | null;
  openAt: number | null;
}

export interface Settings {
  browser: string;
  profile: string;
  favorites: string[];
  recent: string[];
  shortcut: string;
  autostart: boolean;
  notify: boolean;
  openAfter: boolean;
  timers: Record<string, Timer>;
}

export interface ResolvedPortal {
  id: string;
  label: string;
  icon: string | null;
  url: string | null;
  missing: string | null;
}

export interface AppStateDto {
  config: Config;
  settings: Settings;
  portals: Record<string, ResolvedPortal[]>;
  builtinPortals: PortalDef[];
  configPath: string;
  loadError: string | null;
  now: number;
}

export interface Candidate {
  name: string;
  initialDomain: string | null;
  tenantId: string | null;
  linkCount: number;
}

export interface BookmarkImport {
  candidates: Candidate[];
  pimUrl: string | null;
  skipped: string[];
}

export type SettingsPatch = Partial<Pick<Settings, "browser" | "profile" | "favorites" | "shortcut" | "autostart" | "notify" | "openAfter">>;
