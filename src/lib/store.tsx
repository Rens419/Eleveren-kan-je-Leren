import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, onEvent } from "./api";
import type { AppStateDto, Customer, ResolvedPortal } from "./types";

interface Ctx {
  state: AppStateDto | null;
  /** Seconds since epoch, ticking every 15 s. */
  now: number;
  apply: (s: AppStateDto) => void;
  refresh: () => Promise<void>;
  toast: (text: string, sub?: string) => void;
  toastState: { text: string; sub?: string; key: number } | null;
}

const C = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppStateDto | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [toastState, setToast] = useState<Ctx["toastState"]>(null);
  const timer = useRef<number | undefined>(undefined);

  const refresh = useCallback(async () => setState(await api.getState()), []);
  useEffect(() => {
    void refresh();
    const off = onEvent("state-changed", () => void refresh());
    const tick = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 15000);
    return () => { off(); window.clearInterval(tick); };
  }, [refresh]);

  const toast = useCallback((text: string, sub?: string) => {
    window.clearTimeout(timer.current);
    setToast({ text, sub, key: Date.now() });
    timer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const value = useMemo(() => ({ state, now, apply: setState, refresh, toast, toastState }), [state, now, refresh, toast, toastState]);
  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useStore() {
  const v = useContext(C);
  if (!v) throw new Error("StoreProvider ontbreekt");
  return v;
}

export function fmtRemaining(seconds: number): string {
  const m = Math.max(0, Math.ceil(seconds / 60));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

export function clock(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export type Pim = { active: boolean; expiring: boolean; left: number; endsAt: number };

export function pimOf(state: AppStateDto, customerId: string, now: number): Pim | null {
  const t = state.settings.timers[customerId];
  if (!t || t.endsAt <= now) return null;
  const left = t.endsAt - now;
  return { active: true, expiring: left <= 15 * 60, left, endsAt: t.endsAt };
}

export function portalsOf(state: AppStateDto, c: Customer): ResolvedPortal[] {
  return state.portals[c.id] ?? [];
}

export function justification(state: AppStateDto, ticket: string, customer: string): string {
  return state.config.defaults.justificationTemplate.replace("{ticket}", ticket).replace("{customer}", customer);
}

export function groupOf(state: AppStateDto, c: Customer): string {
  return c.pimGroups[0] ?? state.config.defaults.pimGroupTemplate.replace("{name}", c.name.replace(/[^A-Za-z0-9]/g, ""));
}
