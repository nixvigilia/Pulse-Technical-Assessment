"use client";

import type { ActivityCounts } from "@/lib/types";

export default function ActivityBar({ activity }: { activity: ActivityCounts }) {
  return (
    <div className="hidden items-center gap-1.5 rounded-full bg-surface-container/60 px-2.5 py-1 font-mono text-xs tracking-wide text-on-surface-variant shadow-[0_0_12px_rgba(0,0,0,0.2)] sm:flex">
      <span className="size-2 shrink-0 animate-pulse rounded-full bg-primary shadow-[0_0_8px_#4edea3]" />
      <span>
        <strong className="font-medium text-primary">{activity.online}</strong> online
      </span>
      <span className="opacity-40" aria-hidden>
        ·
      </span>
      <span>
        <strong className="font-medium text-secondary">{activity.available}</strong>{" "}
        available
      </span>
    </div>
  );
}
