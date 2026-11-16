"use client";

import type { ActivityCounts } from "@/lib/types";

export default function ActivityBar({ activity }: { activity: ActivityCounts }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border border-zinc-700/80 bg-zinc-900/85 px-4 py-2 text-xs text-zinc-200 shadow-lg backdrop-blur">
      <span>
        <strong className="font-semibold text-emerald-300">{activity.online}</strong>{" "}
        online
      </span>
      <span className="text-zinc-600" aria-hidden>
        ·
      </span>
      <span>
        <strong className="font-semibold text-emerald-300">{activity.available}</strong>{" "}
        available
      </span>
      <span className="text-zinc-600" aria-hidden>
        ·
      </span>
      <span>
        <strong className="font-semibold text-emerald-300">{activity.accepting}</strong>{" "}
        accepting
      </span>
    </div>
  );
}