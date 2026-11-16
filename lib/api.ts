// Client-side helpers for talking to the coordination API.
import type { PollResponse, SignalType } from "@/lib/types";
import { SESSION_KEY_HEADER } from "@/lib/session-constants";

export async function join(
  id: string,
  secret: string,
  lat: number,
  lng: number,
): Promise<void> {
  const res = await fetch("/api/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, secret, lat, lng }),
  });
  if (!res.ok) throw new Error(`join failed: ${res.status}`);
}

export async function poll(id: string, secret: string): Promise<PollResponse> {
  const res = await fetch(`/api/poll?id=${encodeURIComponent(id)}`, {
    cache: "no-store",
    headers: { [SESSION_KEY_HEADER]: secret },
  });
  if (!res.ok) throw new Error(`poll failed: ${res.status}`);
  return res.json();
}

export async function sendSignal(
  fromId: string,
  secret: string,
  toId: string,
  type: SignalType,
  payload?: string,
): Promise<void> {
  const res = await fetch("/api/signal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fromId, secret, toId, type, payload }),
  });
  if (!res.ok) throw new Error(`signal failed: ${res.status}`);
}

export async function savePreferences(
  id: string,
  secret: string,
  prefs: {
    spokenLanguages?: string[];
    preferredLanguage?: string | null;
    gender?: "man" | "woman" | "unspecified" | null;
  },
): Promise<void> {
  const res = await fetch("/api/preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, secret, ...prefs }),
  });
  if (!res.ok) throw new Error(`preferences failed: ${res.status}`);
}

const MATCH_ERROR_HINT: Record<string, string> = {
  "spoken languages required": "Select at least one spoken language.",
  "not available": "You cannot search right now — try again in a second.",
  "pending match": "Finish or cancel the current match offer first.",
  "in a connection": "End your current chat before starting a new search.",
};

export async function matchAction(
  id: string,
  secret: string,
  action: "join" | "cancel" | "accept" | "decline",
  fields?: {
    genderPreference?: "anyone" | "men" | "women";
    spokenLanguages?: string[];
    gender?: "man" | "woman" | "unspecified" | null;
  },
): Promise<void> {
  const res = await fetch("/api/match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, secret, action, ...fields }),
  });
  if (!res.ok) {
    let hint = `Match request failed (${res.status}).`;
    try {
      const body = (await res.json()) as { error?: string };
      if (typeof body.error === "string") {
        hint = MATCH_ERROR_HINT[body.error] ?? body.error;
      }
    } catch {
      /* ignore */
    }
    throw new Error(hint);
  }
}

export function leave(id: string, secret: string): void {
  const body = JSON.stringify({ id, secret });
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon(
      "/api/leave",
      new Blob([body], { type: "application/json" }),
    );
  } else {
    void fetch("/api/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  }
}