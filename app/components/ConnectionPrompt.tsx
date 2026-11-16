"use client";

// Reusable card for "someone wants to connect" and "someone wants to start video".
export default function ConnectionPrompt({
  title,
  subtitle,
  acceptLabel,
  declineLabel,
  onAccept,
  onDecline,
}: {
  title: string;
  subtitle?: string;
  acceptLabel: string;
  declineLabel: string;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="absolute right-4 top-20 z-30 w-[min(24rem,calc(100%-2rem))]">
      <div className="rounded-xl bg-surface-container/90 p-4 text-on-surface shadow-[0_16px_40px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
        <div className="mb-3 flex items-start gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary/20 text-secondary">
            <span className="size-2 animate-pulse rounded-full bg-secondary shadow-[0_0_8px_#4cd7f6]" />
          </div>
          <div className="min-w-0">
            <h2 className="font-sans text-[13px] font-semibold tracking-wide">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-xs text-on-surface-variant">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onAccept}
            className="flex-1 rounded-lg bg-primary-container px-3 py-1.5 text-center font-sans text-[13px] font-medium text-on-primary shadow-[0_0_12px_rgba(16,185,129,0.3)] transition hover:bg-primary"
          >
            {acceptLabel}
          </button>
          <button
            onClick={onDecline}
            className="rounded-lg bg-surface-container-high px-4 py-1.5 font-sans text-[13px] font-medium text-on-surface-variant transition hover:text-on-surface"
          >
            {declineLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
