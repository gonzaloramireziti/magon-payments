"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { api, notifyError, notifyOk } from "./api";

// Cronómetro de horas compartido por todo el panel (cabecera, Mi día, ticket y Horas):
// un store chico para no pasar props por todos lados.

export type TimeEntry = {
  id: string;
  userId: string;
  userName: string | null;
  ticketId: string | null;
  ticketNumber: number | null;
  ticketTitle: string | null;
  clientId: string | null;
  clientName: string | null;
  workDate: string;
  minutes: number | null;
  runningSince: string | null;
  note: string | null;
  createdAt: string;
};

type TimerState = { running: TimeEntry | null; available: boolean; version: number };

let state: TimerState = { running: null, available: true, version: 0 };
const listeners = new Set<() => void>();

function set(next: Partial<TimerState>) {
  state = { ...state, ...next, version: state.version + 1 };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => state;

/** Estado del cronómetro. `version` cambia con cada carga, para recargar listas de horas. */
export function useTimer(): TimerState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export async function refreshTimer() {
  try {
    const data = await api<{ running: TimeEntry | null }>(`/api/admin/time?from=${todayLocal()}&to=${todayLocal()}`);
    set({ running: data.running, available: true });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "TIME_UNAVAILABLE" || code === "NEEDS_USER") set({ running: null, available: false });
  }
}

export async function startTimer(target: { ticketId?: string; clientId?: string; note?: string }) {
  try {
    const data = await api<{ entry: TimeEntry; stopped: TimeEntry | null }>("/api/admin/time", {
      method: "POST",
      json: { action: "start", ...target },
    });
    set({ running: data.entry });
    if (data.stopped?.minutes) notifyOk(`Se guardaron ${duration(data.stopped.minutes)} del cronómetro anterior`);
  } catch (error) {
    notifyError(error);
  }
}

export async function stopTimer() {
  try {
    const data = await api<{ entry: TimeEntry | null }>("/api/admin/time", { method: "POST", json: { action: "stop" } });
    set({ running: null });
    if (data.entry?.minutes) notifyOk(`Guardado: ${duration(data.entry.minutes)}${data.entry.ticketNumber ? ` en #${data.entry.ticketNumber}` : ""}`);
  } catch (error) {
    notifyError(error);
  }
}

export async function addTime(body: { minutes: number; date?: string; ticketId?: string; clientId?: string; note?: string }) {
  await api("/api/admin/time", { method: "POST", json: body });
  set({});
}

export async function updateTime(id: string, body: { minutes?: number; date?: string; note?: string }) {
  await api("/api/admin/time", { method: "PATCH", json: { id, ...body } });
  set({});
}

export async function deleteTime(id: string) {
  await api(`/api/admin/time?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  set({});
}

/** Avisa a las listas que recarguen (p. ej. después de frenar desde la cabecera). */
export function bumpTime() {
  set({});
}

/** 90 → "1 h 30 min". */
export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "1:30", "2", "45m", "1h 15m", "90" (minutos) → minutos. null si no se entiende. */
export function parseDuration(raw: string): number | null {
  const text = raw.trim().toLowerCase().replace(",", ".");
  if (!text) return null;
  let minutes: number;
  const clock = text.match(/^(\d{1,2}):(\d{1,2})$/);
  const parts = text.match(/^(?:(\d+(?:\.\d+)?)\s*h(?:s|oras?)?)?\s*(?:(\d+)\s*m(?:in)?)?$/);
  if (clock) minutes = Number(clock[1]) * 60 + Number(clock[2]);
  else if (/^\d+(\.\d+)?$/.test(text)) {
    // Un número solo: hasta 12 son horas ("2" = 2 h, "1.5" = 1 h 30); más, minutos ("45").
    const n = Number(text);
    minutes = n <= 12 ? n * 60 : n;
  } else if (parts && (parts[1] || parts[2])) minutes = Number(parts[1] ?? 0) * 60 + Number(parts[2] ?? 0);
  else return null;
  minutes = Math.round(minutes);
  return minutes >= 1 && minutes <= 1440 ? minutes : null;
}

/** Fecha local YYYY-MM-DD (el navegador ya está en la hora de Argentina). */
export function todayLocal(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Lunes de la semana de hoy. */
export function weekStart(): string {
  const day = new Date().getDay(); // 0 = domingo
  return todayLocal(-((day + 6) % 7));
}

/** Tiempo corrido del cronómetro, actualizado cada 30 s. */
export function useElapsed(since: string | null | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [since]);
  if (!since) return 0;
  return Math.max(0, Math.floor((now - new Date(since).getTime()) / 60_000));
}

export function useTimeEntries(query: string | null) {
  const { version } = useTimer();
  const [entries, setEntries] = useState<TimeEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (query === null) return;
    let cancelled = false;
    api<{ entries: TimeEntry[] }>(`/api/admin/time?${query}`)
      .then((data) => {
        if (!cancelled) {
          setEntries(data.entries);
          setError(null);
        }
      })
      .catch((err: Error & { code?: string }) => {
        if (cancelled) return;
        setEntries([]);
        setError(err.code === "TIME_UNAVAILABLE" ? "Falta correr la migración 012 para cargar horas." : err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [query, version]);
  return { entries, error };
}
