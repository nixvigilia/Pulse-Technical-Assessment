"use client";

import { useState } from "react";

export default function EntryGate({
  onReady,
}: {
  onReady: (lat: number, lng: number) => void;
}) {
  const [status, setStatus] = useState<"idle" | "locating" | "error">("idle");
  const [error, setError] = useState<string>("");

  function enter() {
    if (!("geolocation" in navigator)) {
      setStatus("error");
      setError("Your browser doesn't support location access.");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => onReady(pos.coords.latitude, pos.coords.longitude),
      (err) => {
        setStatus("error");
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission is required to place you on the map."
            : "Couldn't get your location. Please try again.",
        );
      },
      // High accuracy + maximumAge:0 forces a fresh fix (Wi-Fi/GPS scan)
      // instead of reusing the browser's cached IP-based location.
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  return (
    <div className="relative flex min-h-full flex-1 flex-col items-center justify-center gap-8 overflow-hidden bg-surface p-6 text-on-surface">
      <div className="pointer-events-none absolute left-1/2 top-1/2 size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[120px]" />
      <div className="relative text-center">
        <div className="mb-4 flex items-center justify-center gap-2">
          <span className="size-2.5 animate-pulse rounded-full bg-primary shadow-[0_0_10px_#4edea3]" />
          <h1 className="font-sans text-4xl font-semibold tracking-tight">Pulse</h1>
        </div>
        <p className="mx-auto max-w-sm text-on-surface-variant">
          A living globe of anonymous strangers. Drop onto the map and connect.
        </p>
      </div>

      <button
        onClick={enter}
        disabled={status === "locating"}
        className="relative rounded-full bg-primary-container px-8 py-3 font-sans text-sm font-medium text-on-primary shadow-[0_0_16px_rgba(16,185,129,0.35)] transition hover:bg-primary disabled:opacity-60"
      >
        {status === "locating" ? "Locating…" : "Enter Pulse"}
      </button>

      {status === "error" && (
        <p className="relative max-w-sm text-center text-sm text-error">{error}</p>
      )}

      <p className="relative max-w-sm text-center font-mono text-[11px] tracking-wide text-outline">
        No sign-up. Your dot is placed{" "}
        <span className="font-medium text-primary">1–3&nbsp;km</span> from your
        real location — randomized, not exact. Nothing is stored — closing the
        tab ends everything.
      </p>
    </div>
  );
}
