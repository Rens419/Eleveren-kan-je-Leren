import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, onEvent } from "../lib/api";
import { PortalIcon, Svg } from "../lib/icons";
import { clock, fmtRemaining, groupOf, justification, pimOf, portalsOf, useStore, type Pim } from "../lib/store";
import type { BookmarkImport, Customer } from "../lib/types";
import { ImportReview } from "../components/ImportReview";

type View = "list" | "detail" | "handoff" | "import";
const DEPTH: Record<View, number> = { list: 0, import: 1, detail: 1, handoff: 2 };

const dotColor = (p: Pim | null) => (p ? (p.expiring ? "var(--orange)" : "var(--green)") : "var(--grey)");

export function Panel() {
  const { state, now, apply, toast, toastState } = useStore();
  const [view, setView] = useState<View>("list");
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [ticket, setTicket] = useState("");
  const [ticketErr, setTicketErr] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [dur, setDur] = useState(240);
  const [copied, setCopied] = useState<Record<string, boolean>>({});
  const [imp, setImp] = useState<BookmarkImport | null>(null);
  const search = useRef<HTMLInputElement>(null);

  const customers = state?.config.customers ?? [];
  const cur = customers.find((c) => c.id === currentId) ?? null;

  const reset = useCallback(() => {
    setView("list"); setQuery(""); setSel(0); setTicket(""); setTicketErr(false); setReason(null); setCopied({});
    window.setTimeout(() => search.current?.focus(), 30);
  }, []);
  useEffect(() => onEvent("panel-shown", reset), [reset]);
  useEffect(() => { if (view === "list") search.current?.focus(); }, [view, customers.length]);

  const sections = useMemo(() => {
    if (!state) return [];
    const q = query.trim().toLowerCase();
    const withPim = (c: Customer) => ({ c, pim: pimOf(state, c.id, now) });
    if (q) {
      const r = customers.filter((c) => c.name.toLowerCase().includes(q) || c.initialDomain.includes(q)).map(withPim);
      return r.length ? [{ title: "Resultaten", items: r }] : [];
    }
    const all = customers.map(withPim);
    const fav = state.settings.favorites;
    const active = all.filter((x) => x.pim);
    const favs = all.filter((x) => !x.pim && fav.includes(x.c.id));
    const recent = state.settings.recent
      .map((id) => all.find((x) => x.c.id === id))
      .filter((x): x is NonNullable<typeof x> => !!x && !x.pim && !fav.includes(x.c.id))
      .slice(0, 3);
    const shown = new Set([...active, ...favs, ...recent].map((x) => x.c.id));
    const rest = all.filter((x) => !shown.has(x.c.id));
    return [
      active.length ? { title: "Actief", items: active } : null,
      favs.length ? { title: "Favorieten", items: favs } : null,
      recent.length ? { title: "Recent", items: recent } : null,
      rest.length ? { title: "Alle klanten", items: rest } : null,
    ].filter((x): x is NonNullable<typeof x> => !!x);
  }, [state, customers, query, now]);
  const flat = sections.flatMap((s) => s.items);

  const openCustomer = (c: Customer) => {
    setCurrentId(c.id); setView("detail"); setTicket(""); setTicketErr(false); setReason(null); setCopied({});
    setDur(state?.config.defaults.durationMinutes ?? 240);
  };

  async function openPortal(portalId: string, label: string) {
    if (!cur || !state) return;
    try {
      await api.openPortal(cur.id, portalId);
      const live = pimOf(state, cur.id, now);
      toast(live ? `${label} geopend` : `${label} geopend, PIM nog niet actief`);
    } catch (e) { toast((e as Error).message); }
  }

  async function activate() {
    if (!cur) return;
    if (!ticket.trim()) { setTicketErr(true); return; }
    try {
      await api.startHandoff(cur.id, ticket.trim());
      setCopied({ group: true });
      setView("handoff");
    } catch (e) { toast((e as Error).message); }
  }

  async function confirm() {
    if (!cur) return;
    try {
      apply(await api.confirmActivation(cur.id, ticket.trim(), dur));
      setView("detail"); setCopied({});
      toast(`PIM actief voor ${cur.name}`, state?.settings.openAfter ? `M365 opent over ${state.config.defaults.gdapDelayMinutes} min` : undefined);
    } catch (e) { toast((e as Error).message); }
  }

  async function end(c: Customer) {
    apply(await api.endActivation(c.id));
    setTicket(""); setReason(null);
  }

  async function toggleFav(c: Customer) {
    if (!state) return;
    const fav = state.settings.favorites;
    apply(await api.saveSettings({ favorites: fav.includes(c.id) ? fav.filter((f) => f !== c.id) : [...fav, c.id] }));
  }

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === ",") { e.preventDefault(); void api.openSettings(); return; }
      if (view === "list") {
        if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(flat.length - 1, s + 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
        else if (e.key === "Enter" && flat[sel]) openCustomer(flat[sel].c);
        else if (e.key === "Escape") { if (query) setQuery(""); else void api.hidePanel(); }
      } else if (view === "detail") {
        if (e.key === "Escape") setView("list");
        else if (meta && e.key === "Enter" && cur && !pimOf(state!, cur.id, now)) { e.preventDefault(); void activate(); }
        else if (meta && /^[1-9]$/.test(e.key) && cur && state) {
          const p = portalsOf(state, cur)[Number(e.key) - 1];
          if (p) { e.preventDefault(); void openPortal(p.id, p.label); }
        }
      } else if (view === "handoff" || view === "import") {
        if (e.key === "Escape") setView(view === "handoff" ? "detail" : "list");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => setSel(0), [query]);

  if (!state) return <div className="panel-root" />;

  const pim = cur ? pimOf(state, cur.id, now) : null;
  const durs = [...new Set([60, 120, 240, 480, state.config.defaults.durationMinutes])].sort((a, b) => a - b);
  const group = cur ? groupOf(state, cur) : "";
  const reasonText = reason ?? justification(state, ticket.trim() || "…", cur?.name ?? "");

  const pane = (i: number, v: View = (["list", "detail", "handoff"] as View[])[i]): React.CSSProperties => {
    const d = DEPTH[view];
    const mine = DEPTH[v];
    if (view === v) return { transform: "translateX(0)", opacity: 1 };
    if (mine < d) return { transform: "translateX(-30%)", opacity: 0, pointerEvents: "none" };
    return { transform: "translateX(100%)", opacity: 1, pointerEvents: "none" };
  };

  const copyStep = async (key: string, text: string) => {
    await api.copyText(text);
    setCopied((c) => ({ ...c, [key]: true }));
  };

  const activeCount = customers.filter((c) => pimOf(state, c.id, now)).length;
  const stepsData = [
    { key: "group", label: "Zoek de groep", value: group, mono: true },
    { key: "reden", label: "Reden", value: reasonText, mono: false },
    { key: "ticket", label: "Ticketnummer", value: ticket.trim() || "—", mono: true },
  ];
  let idx = -1;

  return (
    <div className="panel-root">
      {/* ---------- list ---------- */}
      <div className="pane" style={pane(0)} aria-hidden={view !== "list"}>
        {customers.length === 0 ? (
          <Welcome onImport={async () => {
            try { const n = await api.importConfig(); if (n !== null) toast(`${n} klanten geïmporteerd`); } catch (e) { toast((e as Error).message); }
          }} onBookmarks={async () => {
            try { const r = await api.pickBookmarks(); if (r) { setImp(r); setView("import"); } } catch (e) { toast((e as Error).message); }
          }} />
        ) : (
          <>
            <div className="search">
              <Svg d="M20 20l-4.2-4.2M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z" sw={2.1} />
              <input ref={search} aria-label="Zoek klant" placeholder="Zoek klant" value={query} onChange={(e) => setQuery(e.target.value)} />
              <span className="kbd">⌥⌘E</span>
            </div>
            <div className="edge" style={{ flex: 1, minHeight: 0, padding: "0 5px 10px" }}>
              {sections.map((s) => (
                <div key={s.title}>
                  <div className="hdr">{s.title}</div>
                  {s.items.map(({ c, pim: p }) => {
                    idx += 1;
                    const mine = idx;
                    return (
                      <button key={c.id} className={`mi lr${mine === sel ? " sel-row" : ""}`} onClick={() => openCustomer(c)} onMouseMove={() => setSel(mine)}>
                        <span className="grow">{c.name}</span>
                        {p && (<><span className="dot" style={{ background: dotColor(p) }} /><span className="kbd" style={{ color: "inherit", fontVariantNumeric: "tabular-nums" }}>{fmtRemaining(p.left)}</span></>)}
                        {!p && state.settings.favorites.includes(c.id) && <span className="kbd" style={{ width: 10, textAlign: "right" }}>★</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
              {query && sections.length === 0 && (
                <div className="sec" style={{ padding: "26px 12px", lineHeight: 1.45 }}>
                  Geen klant voor “{query}”.<br />
                  <button className="link" onClick={() => void api.openSettings("klanten")}>Klant toevoegen…</button>
                </div>
              )}
            </div>
            <div className="foot t-small sec">
              <span>{activeCount ? `${activeCount} actief, lokaal bijgehouden` : `${customers.length} klanten`}</span>
              <button className="link mut t-small" onClick={() => void api.openSettings()}>Instellingen <span className="kbd" style={{ fontSize: 11 }}>⌘,</span></button>
            </div>
          </>
        )}
      </div>

      {/* ---------- detail ---------- */}
      <div className="pane" style={pane(1)} aria-hidden={view !== "detail"}>
        {cur && (
          <>
            <div className="topbar">
              <button className="link back" onClick={() => setView("list")}><Svg d="M14.5 6l-6 6 6 6" sw={2.3} />Klanten</button>
              <button className="link" aria-label={state.settings.favorites.includes(cur.id) ? `${cur.name} uit favorieten halen` : `${cur.name} aan favorieten toevoegen`}
                onClick={() => void toggleFav(cur)} style={{ fontSize: 15, padding: "0 4px", color: state.settings.favorites.includes(cur.id) ? "#e3a008" : "var(--mut)" }}>
                {state.settings.favorites.includes(cur.id) ? "★" : "☆"}
              </button>
            </div>
            <div className="edge" style={{ flex: 1, minHeight: 0 }}>
              <div style={{ padding: "4px 16px 14px" }}>
                <div className="t-title">{cur.name}</div>
                <div className="kbd cell" style={{ marginTop: 3 }}>{cur.initialDomain || "geen domein"}</div>
              </div>
              <div className="card">
                <div className="lbl">PIM</div>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span className="dot" style={{ background: dotColor(pim), boxShadow: "none" }} />
                  <span style={{ fontWeight: 500 }}>{pim ? (pim.expiring ? "Verloopt bijna" : "Actief") : "Niet actief"}</span>
                </div>
                <div />
                <div className="kbd" style={{ fontSize: 11, marginTop: -5, wordBreak: "break-all" }}>{group}</div>
                {!pim ? (
                  <>
                    <label htmlFor="tk" className="lbl">Ticket</label>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <input id="tk" className={`field mono${ticketErr ? " err" : ""}`} placeholder="240117" value={ticket} style={{ width: 130 }}
                        onChange={(e) => { setTicket(e.target.value); setTicketErr(false); }} />
                      {ticketErr && <span className="t-small" style={{ color: "light-dark(#b45309, #f59e0b)" }}>Vul een ticketnummer in</span>}
                    </div>
                    <label htmlFor="rs" className="lbl" style={{ alignSelf: "start", paddingTop: 4 }}>Reden</label>
                    <textarea id="rs" className="field" rows={2} value={reasonText} onChange={(e) => setReason(e.target.value)} />
                    <div className="lbl">Duur</div>
                    <div><div className="seg">{durs.map((m) => (
                      <button key={m} className={dur === m ? "on" : ""} onClick={() => setDur(m)}>{m % 60 === 0 ? `${m / 60}u` : `${m}m`}</button>
                    ))}</div></div>
                    <div />
                    <div style={{ display: "flex", alignItems: "center", gap: 9, paddingTop: 2 }}>
                      <button className="btn primary" onClick={() => void activate()}>Activeer PIM</button>
                      <span className="kbd">⌘↩</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="lbl">Nog</div>
                    <div className="mono" style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fmtRemaining(pim.left)} <span className="sec">tot {clock(pim.endsAt)}</span></div>
                    <div />
                    <div style={{ display: "flex", gap: 14 }}>
                      <button className="link" onClick={() => void end(cur)}>Opnieuw activeren</button>
                      <button className="link" onClick={() => void end(cur)}>Beëindigen</button>
                    </div>
                  </>
                )}
              </div>
              <div style={{ padding: "10px 5px" }}>
                <div className="hdr"><span>Portalen</span><span style={{ fontWeight: 400 }}>{browserLabel(state.settings.browser, state.settings.profile)}</span></div>
                {portalsOf(state, cur).map((p, i) => (
                  <button key={p.id} className="mi" onClick={() => void openPortal(p.id, p.label)} title={p.missing ?? undefined} style={p.url ? undefined : { opacity: 0.45 }}>
                    <PortalIcon id={p.icon} />
                    <span className="grow">{p.label}{p.missing && <span className="sec t-small"> · {p.missing}</span>}</span>
                    <span className="kbd">{i < 9 ? `⌘${i + 1}` : ""}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ---------- hand-off ---------- */}
      <div className="pane" style={pane(2)} aria-hidden={view !== "handoff"}>
        {cur && (
          <>
            <div className="topbar">
              <button className="link back" onClick={() => setView("detail")}><Svg d="M14.5 6l-6 6 6 6" sw={2.3} />{cur.name}</button>
            </div>
            <div className="edge" style={{ flex: 1, minHeight: 0 }}>
              <div style={{ padding: "4px 16px 12px" }}>
                <div className="t-title">Afronden in PIM</div>
                <div className="sec" style={{ marginTop: 4, lineHeight: 1.4 }}>De PIM-pagina staat open{state.settings.browser !== "default" ? ` in ${browserName(state.settings.browser)}` : ""}. Klik op een regel om te kopiëren en plak het daar.</div>
              </div>
              <div style={{ margin: "0 10px", padding: 4, borderRadius: 10, background: "var(--fill)" }}>
                {stepsData.map((s, i) => (
                  <button key={s.key} className="mi tall" onClick={() => void copyStep(s.key, s.key === "ticket" ? ticket.trim() : s.value)}>
                    <span className="kbd" style={{ width: 12 }}>{i + 1}</span>
                    <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                      <span className="sec t-small">{s.label}</span>
                      <span className={`cell${s.mono ? " mono" : ""}`} style={{ fontSize: 12.5 }}>{s.value}</span>
                    </span>
                    <span className="kbd" style={{ color: copied[s.key] ? "light-dark(#1f7a4d, #5cc98c)" : undefined }}>{copied[s.key] ? "gekopieerd" : "kopieer"}</span>
                  </button>
                ))}
                <div className="mi" style={{ height: 32, pointerEvents: "none" }}>
                  <span className="kbd" style={{ width: 12 }}>4</span>
                  <span>Kies {dur / 60} uur en klik op Activeren</span>
                </div>
              </div>
              <label style={{ margin: "12px 16px 0", display: "flex", alignItems: "flex-start", gap: 8 }}>
                <input type="checkbox" style={{ marginTop: 2 }} checked={state.settings.openAfter} onChange={async (e) => apply(await api.saveSettings({ openAfter: e.target.checked }))} />
                <span style={{ lineHeight: 1.35 }}>M365 openen zodra PIM actief is<br /><span className="sec" style={{ fontSize: 12 }}>na {state.config.defaults.gdapDelayMinutes} minuten, als GDAP de groep heeft</span></span>
              </label>
              <div style={{ padding: "16px 16px 12px", display: "flex", gap: 8 }}>
                <button className="btn primary" onClick={() => void confirm()}>Geactiveerd</button>
                <button className="btn" onClick={() => void api.reopenPim().catch((e) => toast((e as Error).message))}>Open PIM opnieuw</button>
              </div>
              <div className="sec t-small" style={{ padding: "0 16px 16px", lineHeight: 1.45 }}>Zonder app-registratie houdt Eleveren de status lokaal bij.</div>
            </div>
          </>
        )}
      </div>

      {/* ---------- bookmarks import ---------- */}
      <div className="pane" style={pane(1, "import")} aria-hidden={view !== "import"}>
        {imp && <ImportReview data={imp} onCancel={() => setView("list")} onDone={(n) => { setView("list"); toast(`${n} klanten geïmporteerd`); }} />}
      </div>

      {toastState && (
        <div className="hud" key={toastState.key} role="status">
          <div style={{ fontWeight: 500 }}>{toastState.text}</div>
          {toastState.sub && <div className="kbd" style={{ fontSize: 10.5 }}>{toastState.sub}</div>}
        </div>
      )}
    </div>
  );
}

function Welcome({ onImport, onBookmarks }: { onImport: () => void; onBookmarks: () => void }) {
  const row = (title: string, sub: string, key: string, onClick: () => void) => (
    <button className="mi tall" onClick={onClick} style={{ height: 48 }}>
      <span style={{ display: "flex", flexDirection: "column", flex: 1 }}><span>{title}</span><span className="sec" style={{ fontSize: 12 }}>{sub}</span></span>
      <span className="kbd">{key}</span>
    </button>
  );
  return (
    <>
      <div style={{ padding: "22px 16px 16px" }}>
        <div className="t-title">Eleveren</div>
        <div className="sec" style={{ marginTop: 8, lineHeight: 1.45 }}>Portalen en PIM-groepen van al je klanten, vanuit de menubalk. Er staan nog geen klanten in.</div>
      </div>
      <div style={{ padding: 5, boxShadow: "inset 0 0.5px 0 var(--line)" }}>
        {row("Config importeren…", "het .json-bestand van een collega", "⌘O", onImport)}
        {row("Uit browserfavorieten…", "HTML-export van Edge, Chrome of Safari", "⌘I", onBookmarks)}
        {row("Zelf een klant toevoegen", "naam en onmicrosoft-domein is genoeg", "⌘N", () => void api.openSettings("klanten"))}
      </div>
      <div className="sec t-small" style={{ padding: "10px 16px", lineHeight: 1.45 }}>Klantgegevens blijven op deze Mac.</div>
    </>
  );
}

const names: Record<string, string> = { default: "standaardbrowser", edge: "Edge", chrome: "Chrome", brave: "Brave", safari: "Safari", firefox: "Firefox" };
const browserName = (b: string) => names[b] ?? b;
const browserLabel = (b: string, p: string) => `in ${browserName(b)}${p ? ` · ${p}` : ""}`;
