"use client";

// Avisos del navegador: tono corto y notificación del sistema (si el usuario la habilitó).

const DESKTOP_KEY = "magon.alerts.desktop";
const SOUND_KEY = "magon.alerts.sound";

function read(key: string, fallback: boolean): boolean {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value === "1";
  } catch {
    return fallback;
  }
}

function write(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* sin almacenamiento: vale solo para esta sesión */
  }
}

export function desktopSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function desktopEnabled(): boolean {
  return desktopSupported() && Notification.permission === "granted" && read(DESKTOP_KEY, true);
}

export async function enableDesktop(): Promise<boolean> {
  if (!desktopSupported()) return false;
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  write(DESKTOP_KEY, permission === "granted");
  return permission === "granted";
}

export function disableDesktop() {
  write(DESKTOP_KEY, false);
}

export function soundEnabled(): boolean {
  return read(SOUND_KEY, true);
}

export function setSoundEnabled(value: boolean) {
  write(SOUND_KEY, value);
}

export function playChime() {
  if (!soundEnabled()) return;
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    [880, 1320].forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + index * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.12, now + index * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.12 + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + index * 0.12);
      osc.stop(now + index * 0.12 + 0.3);
    });
    window.setTimeout(() => void ctx.close(), 800);
  } catch {
    /* el navegador bloquea el audio hasta que hubo una interacción: no es grave */
  }
}

export function showDesktop(title: string, body: string, onClick: () => void) {
  if (!desktopEnabled()) return;
  try {
    const notification = new Notification(title, { body, tag: `magon-${title}` });
    notification.onclick = () => {
      window.focus();
      onClick();
      notification.close();
    };
  } catch {
    /* algunos navegadores móviles no permiten crear notificaciones desde la página */
  }
}
