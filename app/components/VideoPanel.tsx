"use client";

import { useEffect, useRef } from "react";

export default function VideoPanel({
  localStream,
  remoteStream,
  onEnd,
}: {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onEnd: () => void;
}) {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localRef.current && localRef.current.srcObject !== localStream) {
      localRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteRef.current && remoteRef.current.srcObject !== remoteStream) {
      remoteRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  return (
    <div className="absolute inset-x-0 bottom-0 top-16 z-30 flex flex-col overflow-hidden bg-surface-container-lowest">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[140px]" />

      <div className="relative z-20 flex items-center justify-between px-4 pt-4 lg:px-10">
        <div className="flex items-center gap-2 rounded-full bg-surface-container/80 px-4 py-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.5)] backdrop-blur-xl">
          <span className="size-2 animate-pulse rounded-full bg-primary shadow-[0_0_8px_#4edea3]" />
          <span className="font-sans text-sm font-semibold tracking-tight">Stranger</span>
          <span className="font-mono text-outline-variant">·</span>
          <span className="font-mono text-xs font-medium tracking-wide text-primary">Live</span>
        </div>
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-3 py-2 sm:px-4">
        <div className="relative h-full w-full max-w-7xl overflow-hidden rounded-xl bg-surface-container-low shadow-[0_24px_64px_rgba(0,0,0,0.85)]">
          <video
            ref={remoteRef}
            autoPlay
            playsInline
            className="absolute inset-0 h-full w-full bg-surface-container object-cover"
          />
          {!remoteStream && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-on-surface-variant">
              Waiting for stranger&rsquo;s video…
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-surface-container-lowest/40 via-transparent to-surface-container-lowest/70" />

          <div className="absolute bottom-4 right-4 z-20 aspect-[4/3] w-36 overflow-hidden rounded-xl bg-surface-container-high shadow-[0_12px_32px_rgba(0,0,0,0.8)] sm:w-56">
            <video
              ref={localRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface-container-lowest/60 via-transparent to-transparent" />
            <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-surface-container-lowest/80 px-1.5 py-0.5 backdrop-blur-md">
              <span className="size-1.5 rounded-full bg-primary" />
              <span className="font-sans text-[11px] font-medium tracking-wide">You</span>
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-30 flex items-center justify-center px-4 pb-6 pt-1">
        <div className="flex items-center rounded-full bg-surface-container/90 px-4 py-2 shadow-[0_16px_48px_rgba(0,0,0,0.7)] backdrop-blur-2xl">
          <button
            type="button"
            onClick={onEnd}
            className="flex size-11 items-center justify-center rounded-full bg-error-container text-sm font-medium text-white shadow-[0_0_16px_rgba(147,0,10,0.55)] transition hover:bg-red-600"
            aria-label="End video"
          >
            End
          </button>
        </div>
      </div>
    </div>
  );
}
