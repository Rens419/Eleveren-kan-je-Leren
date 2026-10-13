import { useEffect, useMemo, useState } from "react";
import { api, onEvent } from "../lib/api";
import { Svg, tabIcons } from "../lib/icons";
import { useStore } from "../lib/store";
import type { BookmarkImport, Config, Customer, Defaults, PortalDef } from "../lib/types";
import { ImportReview } from "../components/ImportReview";

type Tab = keyof typeof tabIcons;
const TABS: [Tab, string][] = [["klanten", "Klanten"], ["portalen", "Portalen"], ["algemeen", "Algemeen"], ["delen", "Delen"]];
const DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

const blank = (): Customer => ({ id: "", name: "", initialDomain: "", tenantId: null, defaultDomain: null, sharepointAdminUrl: null, pimGroups: [], portals: null, notes: null });
const compact = (s: string) => s.replace(/[^A-Za-z0-9]/g, "");

export function Settings() {
  const { state, toast, toastState } = useStore();
  const initial = new URLSearchParams(location.search).get("tab") as Tab | null;
  const [tab, setTab] = useState<Tab>(initial && initial in tabIcons ? initial : "klanten");
  const [imp, setImp] = useState<BookmarkImport | null>(null);
  useEffect(() => onEvent("settings-tab", (t) => typeof t === "string" && t in tabIcons && setTab(t as Tab)), []);

  if (!state) return <div className="win" />;
  return (
    <div className="win" style={{ position: "relative" }}>
      <div className="toolbar">
        {TABS.map(([id, label]) => (
          <button key={id} className={`tab${tab === id ? " on" : ""}`} onClick={() => setTab(id)}>
            <Svg d={tabIcons[id]} size={20} sw={1.7} />{label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {tab === "klanten" && <Customers />}
        {tab === "portalen" && <Portals />}
        {tab === "algemeen" && <General />}
        {tab === "delen" && (
          <Share onBookmarks={async () => {
            try { const r = await api.pickBookmarks(); if (r) setImp(r); } catch (e) { toast((e as Error).message); }
          }} />
        )}
      </div>
      {imp && (
        <div className="sheet"><div style={{ height: 560, position: "relative", display: "flex", flexDirection: "column" }}>
          <ImportReview data={imp} onCancel={() => setImp(null)} onDone={(n) => { setImp(null); setTab("klanten"); toast(`${n} klanten geïmporteerd`); }} />
        </div></div>
      )}
      {toastState && <div className="hud" key={toastState.key} role="status"><div style={{ fontWeight: 500 }}>{toastState.text}</div>{toastState.sub && <div className="kbd" style={{ fontSize: 10.5 }}>{toastState.sub}</div>}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ klanten */
function Customers() {
  const { state, apply, toast } = useStore();
  const cfg = state!.config;
  const [draft, setDraft] = useState<Customer[]>(cfg.customers);
  const [dirty, setDirty] = useState(false);
  const [idx, setIdx] = useState(0);
  const [filter, setFilter] = useState("");
  const [lookup, setLookup] = useState<{ kind: "ok" | "warn" | "busy"; text: string } | null>(null);

  useEffect(() => { if (!dirty) setDraft(cfg.customers); }, [cfg.customers, dirty]);
  const c = draft[idx] ?? null;
  const allPortals = useMemo(() => {
    const list: PortalDef[] = [...state!.builtinPortals];
    for (const p of cfg.portals) { const i = list.findIndex((x) => x.id === p.id); if (i >= 0) list[i] = p; else list.push(p); }
    return list;
  }, [state, cfg.portals]);

  const patch = (p: Partial<Customer>) => { setDraft((d) => d.map((x, i) => (i === idx ? { ...x, ...p } : x))); setDirty(true); };
  const derivedGroup = (c: Customer) => cfg.defaults.pimGroupTemplate.replace("{name}", compact(c.name || "Naam"));

  async function findTenant(domain: string) {
    const d = domain.trim().toLowerCase();
    if (!DOMAIN.test(d)) { setLookup(domain ? { kind: "warn", text: "Ongeldig domein" } : null); return; }
    setLookup({ kind: "busy", text: "Tenant zoeken…" });
    try {
      const tid = await api.resolveTenant(d);
      setDraft((x) => x.map((y, i) => (i === idx ? { ...y, tenantId: tid } : y)));
      setDirty(true);
      setLookup({ kind: "ok", text: `tenant ${tid}` });
    } catch (e) { setLookup({ kind: "warn", text: (e as Error).message }); }
  }

  async function save() {
    try {
      const customers = draft.filter((x) => x.name.trim() || x.initialDomain.trim()).map((x) => ({
        ...x, pimGroups: x.pimGroups.length ? x.pimGroups : x.name.trim() ? [derivedGroup(x)] : [],
      }));
      const next = await api.saveConfig({ ...cfg, customers });
      apply(next); setDirty(false);
      toast("Bewaard");
    } catch (e) { toast((e as Error).message); }
  }

  const visibleIds = (x: Customer) => (x.portals ?? allPortals.filter((p) => p.enabledByDefault).map((p) => p.id));
  const togglePortal = (id: string) => {
    if (!c) return;
    const cur = new Set(visibleIds(c));
    cur.has(id) ? cur.delete(id) : cur.add(id);
    const defaults = allPortals.filter((p) => p.enabledByDefault).map((p) => p.id);
    const same = defaults.length === cur.size && defaults.every((d) => cur.has(d));
    patch({ portals: same ? null : allPortals.map((p) => p.id).filter((i) => cur.has(i)) });
  };

  const rows = draft.map((x, i) => ({ x, i })).filter(({ x }) => { const q = filter.trim().toLowerCase(); return !q || x.name.toLowerCase().includes(q) || x.initialDomain.includes(q); });
  const status = c?.tenantId ? { kind: "ok" as const, text: `tenant ${c.tenantId}` } : lookup ?? (c && c.initialDomain ? { kind: "warn" as const, text: "tenant nog niet opgezocht" } : { kind: "warn" as const, text: "vul het …onmicrosoft.com-domein in" });

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 20, padding: "18px 20px" }}>
      <div style={{ width: 470, flexShrink: 0, display: "flex", flexDirection: "column" }}>
        <input aria-label="Filter klanten" className="field" placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ marginBottom: 8 }} />
        <div className="table" style={{ flex: 1 }}>
          <div className="tr sec" style={{ gridTemplateColumns: "1.1fr 1.4fr 1.5fr", fontSize: 11.5, fontWeight: 600, boxShadow: "inset 0 -1px 0 var(--line)", background: "transparent" }}><span>Naam</span><span>Domein</span><span>PIM-groep</span></div>
          <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            {rows.map(({ x, i }) => (
              <button key={i} className={`tr${i === idx ? " on" : ""}`} style={{ gridTemplateColumns: "1.1fr 1.4fr 1.5fr" }} onClick={() => { setIdx(i); setLookup(null); }}>
                <span className="cell">{x.name || "Nieuwe klant"}</span>
                <span className="cell mono sec">{x.initialDomain || "—"}</span>
                <span className="cell mono sec">{x.pimGroups[0] ?? (x.name ? derivedGroup(x) : "—")}</span>
              </button>
            ))}
          </div>
          <div style={{ display: "flex", borderTop: "1px solid var(--line)" }}>
            <button className="sq" aria-label="Klant toevoegen" onClick={() => { setDraft((d) => [...d, blank()]); setIdx(draft.length); setFilter(""); setDirty(true); setLookup(null); }}>+</button>
            <button className="sq" aria-label="Klant verwijderen" onClick={() => { setDraft((d) => d.filter((_, i) => i !== idx)); setIdx(Math.max(0, idx - 1)); setDirty(true); }}>−</button>
            <span className="sec" style={{ flex: 1, textAlign: "right", fontSize: 11.5, padding: "3px 8px" }}>{draft.length} klanten</span>
          </div>
        </div>
      </div>

      {c ? (
        <div className="scroll" style={{ flex: 1, minWidth: 0, overflowY: "auto", paddingTop: 34 }}>
          <div className="form">
            <label htmlFor="nm" className="lbl">Naam:</label>
            <input id="nm" className="field" value={c.name} placeholder="Klantnaam" onChange={(e) => patch({ name: e.target.value })} />
            <label htmlFor="dm" className="lbl">Onmicrosoft:</label>
            <input id="dm" className="field mono" value={c.initialDomain} placeholder="klant.onmicrosoft.com"
              onChange={(e) => { patch({ initialDomain: e.target.value, tenantId: null }); setLookup(null); }} onBlur={(e) => { if (!c.tenantId && e.target.value) void findTenant(e.target.value); }} />
            <div />
            <div className="mono" style={{ fontSize: 11.5, marginTop: -5, color: status.kind === "ok" ? "light-dark(#1f7a4d, #5cc98c)" : "light-dark(#a35a00, #f0a345)" }}>
              {status.kind === "ok" ? "✓ " : ""}{status.text}{" "}
              {status.kind !== "ok" && c.initialDomain && <button className="link" style={{ fontSize: 11.5 }} onClick={() => void findTenant(c.initialDomain)}>zoek</button>}
            </div>
            <label htmlFor="dd" className="lbl">Standaarddomein:</label>
            <input id="dd" className="field" value={c.defaultDomain ?? ""} placeholder="optioneel" onChange={(e) => patch({ defaultDomain: e.target.value || null })} />
            <label htmlFor="gp" className="lbl">PIM-groep:</label>
            <input id="gp" className="field mono" value={c.pimGroups[0] ?? ""} placeholder={derivedGroup(c)} onChange={(e) => patch({ pimGroups: e.target.value ? [e.target.value] : [] })} />
            <div />
            <div className="sec" style={{ fontSize: 11.5, marginTop: -5 }}>{c.pimGroups[0] ? "handmatig ingesteld" : "uit het template, leeg laten voor de standaard"}</div>
            <label htmlFor="sp" className="lbl">SharePoint-admin:</label>
            <input id="sp" className="field mono" value={c.sharepointAdminUrl ?? ""} placeholder="automatisch uit het domein" onChange={(e) => patch({ sharepointAdminUrl: e.target.value || null })} />
            <div className="lbl" style={{ alignSelf: "start", paddingTop: 2 }}>Portalen:</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", rowGap: 5, columnGap: 12 }}>
              {allPortals.map((p) => (
                <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" checked={visibleIds(c).includes(p.id)} onChange={() => togglePortal(p.id)} />{p.label}
                </label>
              ))}
            </div>
            <div />
            <div style={{ display: "flex", gap: 8, alignItems: "center", paddingTop: 10 }}>
              <button className="btn primary" disabled={!dirty} onClick={() => void save()}>Bewaar</button>
              {dirty && <button className="btn" onClick={() => { setDraft(cfg.customers); setDirty(false); setIdx(0); }}>Herstel</button>}
            </div>
          </div>
        </div>
      ) : (
        <div className="sec" style={{ flex: 1, paddingTop: 80, textAlign: "center" }}>Nog geen klanten. Voeg er een toe met +, of importeer via het tabblad Delen.</div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- portalen */
function Portals() {
  const { state, apply, toast } = useStore();
  const cfg = state!.config;
  const [custom, setCustom] = useState<PortalDef[]>(cfg.portals);
  const [dirty, setDirty] = useState(false);
  const edit = (i: number, p: Partial<PortalDef>) => { setCustom((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x))); setDirty(true); };

  async function save() {
    const seen = new Set<string>();
    const list: PortalDef[] = [];
    for (const p of custom) {
      if (!p.label.trim() || !p.url.trim()) continue;
      if (!/^https:\/\//.test(p.url.trim())) { toast("Een portaal-URL moet met https:// beginnen"); return; }
      let id = p.id || p.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      while (seen.has(id)) id += "-2";
      seen.add(id);
      list.push({ ...p, id, label: p.label.trim(), url: p.url.trim() });
    }
    try { apply(await api.saveConfig({ ...cfg, portals: list } as Config)); setDirty(false); toast("Bewaard"); } catch (e) { toast((e as Error).message); }
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "18px 20px", gap: 8 }}>
      <div className="sec" style={{ fontSize: 12 }}>Variabelen: <span className="mono">{"{initialDomain} {tenantId} {defaultDomain} {tenantPrefix}"}</span></div>
      <div className="table" style={{ flex: 1 }}>
        <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {state!.builtinPortals.map((p, i) => (
            <div key={p.id} className="tr" style={{ gridTemplateColumns: "150px minmax(0,1fr) 40px" }}>
              <span>{p.label}</span><span className="cell mono sec">{p.url}</span><span className="mono sec" style={{ textAlign: "right" }}>{i < 9 ? `⌘${i + 1}` : ""}</span>
            </div>
          ))}
          {custom.map((p, i) => (
            <div key={i} className="tr" style={{ gridTemplateColumns: "150px minmax(0,1fr) 24px", height: 30 }}>
              <input className="field" aria-label="Naam" value={p.label} placeholder="Naam" onChange={(e) => edit(i, { label: e.target.value })} />
              <input className="field mono" aria-label="URL" value={p.url} placeholder="https://…{initialDomain}" onChange={(e) => edit(i, { url: e.target.value })} />
              <button className="link mut" aria-label="Verwijder portaal" onClick={() => { setCustom((l) => l.filter((_, j) => j !== i)); setDirty(true); }}>−</button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", borderTop: "1px solid var(--line)", alignItems: "center" }}>
          <button className="sq" aria-label="Eigen portaal toevoegen" onClick={() => { setCustom((l) => [...l, { id: "", label: "", url: "", icon: null, enabledByDefault: true }]); setDirty(true); }}>+</button>
          <span className="sec" style={{ flex: 1, fontSize: 11.5, padding: "3px 10px" }}>Eigen portalen (bijv. CIPP). Een eigen portaal met dezelfde naam als een standaard overschrijft die.</span>
          <button className="btn primary" style={{ margin: 4 }} disabled={!dirty} onClick={() => void save()}>Bewaar</button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- algemeen */
function DefField({ value, onCommit, mono, placeholder, width, type }: { value: string; onCommit: (v: string) => void; mono?: boolean; placeholder?: string; width?: number; type?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <input className={`field${mono ? " mono" : ""}`} type={type} value={v} placeholder={placeholder} style={{ width }} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v)} />;
}

function General() {
  const { state, apply, toast } = useStore();
  const s = state!.settings;
  const d = state!.config.defaults;
  const [profiles, setProfiles] = useState<{ dir: string; name: string }[]>([]);
  useEffect(() => { void api.listBrowserProfiles(s.browser).then(setProfiles).catch(() => setProfiles([])); }, [s.browser]);

  const setS = async (p: Parameters<typeof api.saveSettings>[0]) => { try { apply(await api.saveSettings(p)); } catch (e) { toast((e as Error).message); } };
  const setD = async (p: Partial<Defaults>) => { try { apply(await api.saveConfig({ ...state!.config, defaults: { ...d, ...p } })); } catch (e) { toast((e as Error).message); } };
  const chromium = ["edge", "chrome", "brave"].includes(s.browser);

  return (
    <div className="scroll" style={{ flex: 1, overflowY: "auto", padding: "30px 0", display: "flex", justifyContent: "center" }}>
      <div className="form" style={{ gridTemplateColumns: "190px 380px", width: 590 }}>
        <label htmlFor="br" className="lbl">Portalen openen in:</label>
        <select id="br" className="field" style={{ width: 210 }} value={s.browser} onChange={(e) => void setS({ browser: e.target.value, profile: "" })}>
          <option value="default">Standaardbrowser</option><option value="edge">Microsoft Edge</option><option value="chrome">Google Chrome</option>
          <option value="brave">Brave</option><option value="safari">Safari</option><option value="firefox">Firefox</option>
        </select>
        {chromium && (<>
          <label htmlFor="pf" className="lbl">Browserprofiel:</label>
          <select id="pf" className="field" style={{ width: 210 }} value={s.profile} onChange={(e) => void setS({ profile: e.target.value })}>
            <option value="">Laatst gebruikt</option>
            {profiles.map((p) => <option key={p.dir} value={p.dir}>{p.name}</option>)}
            {s.profile && !profiles.some((p) => p.dir === s.profile) && <option value={s.profile}>{s.profile}</option>}
          </select>
        </>)}
        <div style={{ gridColumn: "span 2", height: 1, background: "var(--line)" }} />
        <label className="lbl">Ticketsysteem:</label>
        <DefField value={d.ticketSystem ?? ""} placeholder="bijv. je PSA" width={210} onCommit={(v) => void setD({ ticketSystem: v || null })} />
        <label className="lbl">Standaardduur (min):</label>
        <DefField value={String(d.durationMinutes)} type="number" width={90} onCommit={(v) => void setD({ durationMinutes: Math.max(15, Math.min(1440, Number(v) || 240)) })} />
        <label className="lbl">Reden:</label>
        <DefField value={d.justificationTemplate} mono onCommit={(v) => void setD({ justificationTemplate: v || "Ticket {ticket} – {customer}" })} />
        <label className="lbl">PIM-groep template:</label>
        <DefField value={d.pimGroupTemplate} mono onCommit={(v) => void setD({ pimGroupTemplate: v || "PIM_{name}" })} />
        <label className="lbl">PIM-pagina:</label>
        <DefField value={d.pimUrl} mono onCommit={(v) => /^https:\/\//.test(v) ? void setD({ pimUrl: v }) : toast("De PIM-pagina moet met https:// beginnen")} />
        <label className="lbl">Wachttijd GDAP (min):</label>
        <DefField value={String(d.gdapDelayMinutes)} type="number" width={90} onCommit={(v) => void setD({ gdapDelayMinutes: Math.max(0, Math.min(30, Number(v) || 0)) })} />
        <div style={{ gridColumn: "span 2", height: 1, background: "var(--line)" }} />
        <div className="lbl">Sneltoets:</div>
        <div><span className="mono" style={{ display: "inline-block", padding: "2px 8px", borderRadius: 5, background: "var(--field)", boxShadow: "inset 0 0 0 .5px var(--line)" }}>⌥⌘E</span></div>
        <div />
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={s.autostart} onChange={(e) => void setS({ autostart: e.target.checked })} />Openen bij inloggen</label>
        <div />
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={s.notify} onChange={(e) => void setS({ notify: e.target.checked })} />Melding 10 minuten voor PIM verloopt</label>
        <div />
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={s.openAfter} onChange={(e) => void setS({ openAfter: e.target.checked })} />M365 openen nadat PIM actief is</label>
        <div style={{ gridColumn: "span 2", height: 1, background: "var(--line)" }} />
        <div className="lbl">Graph-koppeling:</div>
        <div className="sec" style={{ lineHeight: 1.4 }}>Niet gekoppeld. Met een goedgekeurde app-registratie activeert Eleveren PIM in één klik. Zie docs/app-registratie.md.</div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- delen */
function Share({ onBookmarks }: { onBookmarks: () => void }) {
  const { state, toast, refresh } = useStore();
  const run = async (f: () => Promise<string | null>) => { try { const m = await f(); if (m) toast(m); } catch (e) { toast((e as Error).message); } };
  return (
    <div style={{ flex: 1, display: "flex", justifyContent: "center", padding: "30px 0" }}>
      <div className="form" style={{ gridTemplateColumns: "130px 420px", width: 560, alignContent: "start" }}>
        <div className="lbl">Config:</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => void run(async () => { const p = await api.exportConfig(); return p ? "Config geëxporteerd" : null; })}>Exporteer…</button>
          <button className="btn" onClick={() => void run(async () => { const n = await api.importConfig(); await refresh(); return n === null ? null : `${n} nieuwe klanten toegevoegd`; })}>Importeer…</button>
        </div>
        <div className="lbl">Favorieten:</div>
        <div><button className="btn" onClick={onBookmarks}>Importeer HTML-export…</button></div>
        <div />
        <div className="sec" style={{ lineHeight: 1.45 }}>De config bevat klantnamen en domeinen. Deel hem alleen intern, via Teams of OneDrive, nooit via GitHub. Je favorieten, browser en sneltoets gaan niet mee.</div>
        <div className="lbl">Locatie:</div>
        <div className="mono sec" style={{ fontSize: 11.5, lineHeight: 1.5, userSelect: "text" }}>{state!.configPath}</div>
      </div>
    </div>
  );
}
