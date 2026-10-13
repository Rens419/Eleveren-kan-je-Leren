// In-browser stand-in for the Rust backend, used only when the page runs outside Tauri
// (design review and screenshots). Fictional customers only.

import type { AppStateDto, Candidate, Config, Customer, PortalDef, ResolvedPortal, Settings } from "./types";

const builtin: PortalDef[] = [
  ["m365", "M365 admin center", "https://admin.cloud.microsoft/?delegatedOrg={initialDomain}"],
  ["exchange", "Exchange", "https://admin.cloud.microsoft/exchange?landingpage=homepage&form=mac_sidebar&delegatedOrg={initialDomain}"],
  ["entra", "Entra", "https://entra.microsoft.com/{tenantId}"],
  ["teams", "Teams", "https://admin.teams.microsoft.com/?delegatedOrg={initialDomain}"],
  ["azure", "Azure", "https://portal.azure.com/{tenantId}"],
  ["intune", "Intune", "https://intune.microsoft.com/{tenantId}"],
  ["sharepoint", "SharePoint", "https://{tenantPrefix}-admin.sharepoint.com"],
  ["defender", "Defender", "https://security.microsoft.com/?tid={tenantId}"],
  ["purview", "Purview", "https://purview.microsoft.com/?tid={tenantId}"],
  ["powerplatform", "Power Platform", "https://admin.powerplatform.microsoft.com/account/login/{tenantId}"],
  ["powerbi", "Power BI", "https://app.powerbi.com/admin-portal?ctid={tenantId}"],
].map(([id, label, url]) => ({ id, label, url, icon: id, enabledByDefault: true }));

const names = [
  ["Contoso", "contoso"], ["Fabrikam", "fabrikam"], ["Northwind Traders", "northwindtraders"],
  ["Tailspin Toys", "tailspintoys"], ["Woodgrove Bank", "woodgrovebank"], ["Litware", "litwareinc"],
  ["Adventure Works", "adventureworks"], ["Wide World Importers", "wideworldimporters"],
  ["Proseware", "proseware"], ["Alpine Ski House", "alpineskihouse"], ["Fourth Coffee", "fourthcoffee"],
  ["Lucerne Publishing", "lucernepublishing"],
];

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const compact = (s: string) => s.replace(/[^A-Za-z0-9]/g, "");

const params = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
const empty = params.has("empty");

let config: Config = {
  version: 1,
  defaults: {
    ticketSystem: "Autotask", durationMinutes: 240, justificationTemplate: "Ticket {ticket} – {customer}",
    pimGroupTemplate: "G_Cipp_{name}_Editor", pimUrl: "https://aad.portal.azure.com/#view/Microsoft_Azure_PIMCommon/CommonMenuBlade/~/aadgroup", gdapDelayMinutes: 3,
  },
  auth: null,
  portals: [{ id: "cipp", label: "CIPP", url: "https://cipp.example.com/?tenantFilter={initialDomain}", icon: null, enabledByDefault: true }],
  customers: empty ? [] : names.map(([name, prefix], i) => ({
    id: slug(name), name, initialDomain: `${prefix}.onmicrosoft.com`,
    tenantId: i === 4 ? null : `00000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`,
    defaultDomain: i === 0 ? "contoso.com" : null, sharepointAdminUrl: null,
    pimGroups: [`G_Cipp_${compact(name)}_Editor`], portals: null, notes: null,
  })),
};

const nowSec = () => Math.floor(Date.now() / 1000);
let settings: Settings = {
  browser: "edge", profile: "Werk", favorites: ["contoso", "fabrikam", "tailspin-toys"], recent: [],
  shortcut: "CommandOrControl+Alt+E", autostart: true, notify: true, openAfter: true,
  timers: empty ? {} : {
    fabrikam: { startedAt: nowSec() - 3000, endsAt: nowSec() + 161 * 60, ticket: "240101", durationMinutes: 240, warned: false, openPortal: null, openAt: null },
    "northwind-traders": { startedAt: nowSec() - 3000, endsAt: nowSec() + 8 * 60, ticket: "240102", durationMinutes: 60, warned: false, openPortal: null, openAt: null },
  },
};

const listeners = new Map<string, Set<(p: unknown) => void>>();
const emit = (name: string) => listeners.get(name)?.forEach((h) => h(null));

function render(tpl: string, c: Customer): string | null {
  const prefix = c.initialDomain.endsWith(".onmicrosoft.com") ? c.initialDomain.replace(".onmicrosoft.com", "") : null;
  const map: Record<string, string | null> = {
    "{initialDomain}": c.initialDomain || null, "{tenantId}": c.tenantId, "{defaultDomain}": c.defaultDomain ?? c.initialDomain,
    "{tenantPrefix}": prefix, "{name}": c.name,
  };
  let out = tpl;
  for (const [k, v] of Object.entries(map)) {
    if (out.includes(k)) {
      if (!v) return null;
      out = out.split(k).join(encodeURIComponent(v));
    }
  }
  return out;
}

function portalsFor(c: Customer): ResolvedPortal[] {
  const all = [...builtin];
  for (const p of config.portals) { const i = all.findIndex((x) => x.id === p.id); if (i >= 0) all[i] = p; else all.push(p); }
  return all
    .filter((p) => (c.portals ? c.portals.includes(p.id) : p.enabledByDefault))
    .map((p) => {
      const url = p.id === "sharepoint" && c.sharepointAdminUrl ? c.sharepointAdminUrl : render(p.url, c);
      return { id: p.id, label: p.label, icon: p.icon ?? null, url, missing: url ? null : "tenant-ID ontbreekt" };
    });
}

function normalize() {
  const seen = new Set<string>();
  for (const c of config.customers) {
    c.name = c.name.trim(); c.initialDomain = c.initialDomain.trim().toLowerCase();
    let base = slug(c.id || c.name) || "klant"; let id = base; let n = 2;
    while (seen.has(id)) id = `${base}-${n++}`;
    seen.add(id); c.id = id;
  }
  config.customers.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  const ids = new Set(config.customers.map((c) => c.id));
  settings.favorites = settings.favorites.filter((f) => ids.has(f));
}

function snap(): AppStateDto {
  return {
    config: structuredClone(config), settings: structuredClone(settings),
    portals: Object.fromEntries(config.customers.map((c) => [c.id, portalsFor(c)])),
    builtinPortals: builtin, configPath: "~/Library/Application Support/io.github.rens419.eleveren/config.json",
    loadError: null, now: nowSec(),
  };
}

const delay = <T,>(v: T, ms = 120) => new Promise<T>((r) => setTimeout(() => r(v), ms));

export const mock = {
  on(name: string, h: (p: unknown) => void) {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name)!.add(h);
    return () => listeners.get(name)?.delete(h);
  },
  async call<T>(cmd: string, a: Record<string, unknown> = {}): Promise<T> {
    switch (cmd) {
      case "get_state": return snap() as T;
      case "save_config": config = structuredClone(a.config as Config); normalize(); emit("state-changed"); return snap() as T;
      case "save_settings": settings = { ...settings, ...(a.patch as object) }; return snap() as T;
      case "resolve_tenant": {
        const d = String(a.domain).trim().toLowerCase();
        if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) throw new Error("Ongeldig domein");
        if (d.startsWith("nietbestaand")) throw new Error("Tenant niet gevonden");
        return delay("00000000-0000-0000-0000-0000000000aa" as T, 400);
      }
      case "copy_text": console.info("[mock] clipboard:", a.text); return undefined as T;
      case "open_portal": {
        const c = config.customers.find((x) => x.id === a.customerId)!;
        const p = portalsFor(c).find((x) => x.id === a.portalId);
        if (!p?.url) throw new Error(p?.missing ?? "Onbekend portaal");
        console.info("[mock] open", p.url); return p.url as T;
      }
      case "start_handoff": {
        if (!String(a.ticket).trim()) throw new Error("Vul een ticketnummer in");
        const c = config.customers.find((x) => x.id === a.customerId)!;
        return (c.pimGroups[0] ?? "") as T;
      }
      case "reopen_pim": return undefined as T;
      case "confirm_activation": {
        const t = nowSec();
        settings.timers[a.customerId as string] = { startedAt: t, endsAt: t + (a.durationMinutes as number) * 60, ticket: a.ticket as string, durationMinutes: a.durationMinutes as number, warned: false, openPortal: null, openAt: null };
        emit("state-changed"); return snap() as T;
      }
      case "end_activation": delete settings.timers[a.customerId as string]; emit("state-changed"); return snap() as T;
      case "pick_bookmarks":
        return delay({
          candidates: [
            { name: "Adventure Works", initialDomain: "adventureworks.onmicrosoft.com", tenantId: null, linkCount: 10 },
            { name: "Contoso", initialDomain: "contoso.onmicrosoft.com", tenantId: "00000000-0000-0000-0000-000000000001", linkCount: 11 },
            { name: "Fabrikam", initialDomain: "fabrikam.onmicrosoft.com", tenantId: null, linkCount: 11 },
            { name: "Lucerne Publishing", initialDomain: "lucernepublishing.onmicrosoft.com", tenantId: null, linkCount: 11 },
            { name: "Northwind Traders", initialDomain: "northwindtraders.onmicrosoft.com", tenantId: null, linkCount: 9 },
            { name: "Woodgrove Bank", initialDomain: null, tenantId: "00000000-0000-0000-0000-000000000005", linkCount: 6 },
          ],
          pimUrl: "https://aad.portal.azure.com/#view/Microsoft_Azure_PIMCommon/CommonMenuBlade/~/aadgroup", skipped: ["Recepten"],
        } as T, 300);
      case "apply_import": {
        const cands = a.candidates as Candidate[];
        if (a.groupTemplate) config.defaults.pimGroupTemplate = a.groupTemplate as string;
        if (a.pimUrl) config.defaults.pimUrl = a.pimUrl as string;
        for (const c of cands) {
          if (config.customers.some((e) => e.initialDomain === c.initialDomain || e.name.toLowerCase() === c.name.toLowerCase())) continue;
          config.customers.push({ id: "", name: c.name, initialDomain: c.initialDomain ?? "", tenantId: c.tenantId, defaultDomain: null, sharepointAdminUrl: null, pimGroups: [config.defaults.pimGroupTemplate.replace("{name}", compact(c.name))], portals: null, notes: null });
        }
        normalize(); emit("state-changed"); return snap() as T;
      }
      case "import_config": return null as T;
      case "export_config": return null as T;
      case "list_browser_profiles": return [{ dir: "Default", name: "Persoonlijk" }, { dir: "Profile 1", name: "Werk" }] as T;
      case "open_settings_window": window.open(`/?window=settings${a.tab ? `&tab=${a.tab}` : ""}`, "_blank"); return undefined as T;
      case "hide_panel": case "quit_app": return undefined as T;
      default: throw new Error(`mock: onbekende opdracht ${cmd}`);
    }
  },
};
