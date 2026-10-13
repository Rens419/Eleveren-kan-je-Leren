import { useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../lib/store";
import type { BookmarkImport } from "../lib/types";

/** Review step after reading a bookmarks export: pick customers, set the group template. */
export function ImportReview({ data, onCancel, onDone }: { data: BookmarkImport; onCancel: () => void; onDone: (added: number) => void }) {
  const { state, apply, toast } = useStore();
  const [off, setOff] = useState<Set<number>>(new Set());
  const [template, setTemplate] = useState(state?.config.defaults.pimGroupTemplate ?? "PIM_{name}");
  const [busy, setBusy] = useState(false);
  const chosen = data.candidates.filter((_, i) => !off.has(i));
  const example = template.replace("{name}", "Contoso");

  async function run() {
    setBusy(true);
    try {
      const before = state?.config.customers.length ?? 0;
      const next = await api.applyImport(chosen, data.pimUrl, template);
      apply(next);
      onDone(next.config.customers.length - before);
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <div style={{ padding: "14px 15px 12px", boxShadow: "inset 0 -0.5px 0 var(--line)" }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Favorieten importeren</div>
        <div className="sec" style={{ marginTop: 3, fontSize: 12.5 }}>
          {data.candidates.length} klanten gevonden{data.skipped.length ? `, ${data.skipped.length} map(pen) overgeslagen` : ""}
        </div>
      </div>
      <div className="edge" style={{ flex: 1, minHeight: 0, padding: "4px 5px" }}>
        {data.candidates.map((c, i) => (
          <label key={i} style={{ display: "flex", alignItems: "center", gap: 9, minHeight: 40, padding: "4px 10px", borderRadius: 5 }}>
            <input type="checkbox" checked={!off.has(i)} onChange={() => setOff((p) => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n; })} />
            <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
              <span className="cell">{c.name}</span>
              <span className="mono cell" style={{ fontSize: 11.5, color: c.initialDomain ? "var(--mut)" : "light-dark(#a35a00, #f0a345)" }}>
                {c.initialDomain ?? "alleen tenant-ID, vul het domein later aan"}
              </span>
            </span>
            <span className="mono sec">{c.linkCount}</span>
          </label>
        ))}
        {data.pimUrl && (
          <>
            <div className="rule" />
            <div style={{ padding: "4px 10px", display: "flex", flexDirection: "column" }}>
              <span>PIM-pagina herkend</span>
              <span className="sec cell" style={{ fontSize: 12 }}>wordt je standaard PIM-pagina</span>
            </div>
          </>
        )}
      </div>
      <div style={{ padding: "10px 15px", boxShadow: "inset 0 0.5px 0 var(--line)", display: "grid", gridTemplateColumns: "70px minmax(0,1fr)", columnGap: 10, rowGap: 4, alignItems: "center" }}>
        <label htmlFor="tpl" className="sec" style={{ fontSize: 12.5, textAlign: "right" }}>PIM-groep</label>
        <input id="tpl" className="field mono" value={template} onChange={(e) => setTemplate(e.target.value)} />
        <div />
        <div className="mono sec" style={{ fontSize: 11.5 }}>{example}</div>
      </div>
      <div style={{ padding: "10px 15px", boxShadow: "inset 0 0.5px 0 var(--line)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button className="btn" onClick={onCancel}>Annuleren</button>
        <button className="btn primary" disabled={busy || chosen.length === 0} onClick={() => void run()}>
          {chosen.length === 1 ? "1 klant importeren" : `${chosen.length} klanten importeren`}
        </button>
      </div>
    </>
  );
}
