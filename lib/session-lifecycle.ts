// Tab-scoped bookkeeping so a refresh can leave the previous coordination session.
import { leave } from "@/lib/api";

const LIVE_SESSION_KEY = "pulse-live-session";

type LiveSessionRecord = { id: string; secret: string };

export function rememberLiveSession(id: string, secret: string): void {
  if (typeof sessionStorage === "undefined") return;
  const record: LiveSessionRecord = { id, secret };
  sessionStorage.setItem(LIVE_SESSION_KEY, JSON.stringify(record));
}

export function forgetLiveSession(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(LIVE_SESSION_KEY);
}

/** New document load after refresh: beacon-leave the session the old tab failed to clean up. */
export function leaveOrphanedLiveSessionFromStorage(): void {
  if (typeof sessionStorage === "undefined") return;
  const raw = sessionStorage.getItem(LIVE_SESSION_KEY);
  if (!raw) return;
  forgetLiveSession();
  try {
    const { id, secret } = JSON.parse(raw) as LiveSessionRecord;
    if (typeof id === "string" && typeof secret === "string") {
      leave(id, secret);
    }
  } catch {}
}