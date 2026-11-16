"use client";

import { useEffect, useRef, useState } from "react";

export interface ChatMessage {
  id: number;
  mine: boolean;
  text: string;
  system?: boolean;
}

export default function ChatPanel({
  messages,
  connected,
  videoBusy,
  onSend,
  onStartVideo,
  onEnd,
}: {
  messages: ChatMessage[];
  connected: boolean;
  videoBusy: boolean;
  onSend: (text: string) => void;
  onStartVideo?: () => void;
  onEnd: () => void;
}) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !connected) return;
    onSend(text);
    setDraft("");
  }

  return (
    <aside className="absolute bottom-0 right-0 top-16 z-20 flex w-full max-w-md flex-col bg-surface-container-low/95 text-on-surface shadow-[-8px_0_32px_rgba(0,0,0,0.6)] backdrop-blur-2xl">
      <header className="flex h-16 items-center justify-between bg-surface-container-lowest/60 px-4">
        <div className="min-w-0">
          <p className="font-sans text-sm font-semibold">Private chat</p>
          <p className="font-mono text-[11px] tracking-wide text-outline">
            {connected ? "Connected" : "Connecting…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onStartVideo && (
            <button
              type="button"
              onClick={onStartVideo}
              disabled={!connected || videoBusy}
              className="rounded-full bg-surface-container-high px-3 py-1.5 font-sans text-[13px] font-medium text-primary transition hover:bg-surface-bright disabled:opacity-40"
            >
              Video
            </button>
          )}
          <button
            type="button"
            onClick={onEnd}
            className="rounded-full bg-error-container px-3 py-1.5 font-sans text-[13px] font-medium text-white transition hover:bg-red-600"
          >
            End
          </button>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4 text-sm">
        <div className="py-1 text-center">
          <span className="inline-block rounded-full bg-surface-container/50 px-3 py-1 font-mono text-[11px] tracking-wide text-outline">
            Private · Messages disappear when you leave
          </span>
        </div>
        {messages.length === 0 && (
          <p className="mt-6 text-center text-sm text-on-surface-variant">
            Say hello. Messages are peer-to-peer and never stored.
          </p>
        )}
        {messages.map((m) =>
          m.system ? (
            <p
              key={m.id}
              className="self-center rounded-full bg-surface-container/70 px-3 py-1 text-center text-xs text-on-surface-variant"
            >
              {m.text}
            </p>
          ) : (
            <div
              key={m.id}
              className={`flex max-w-[85%] flex-col gap-1 ${
                m.mine ? "items-end self-end" : "self-start"
              }`}
            >
              <span
                className={`font-sans text-[11px] font-medium tracking-wide ${
                  m.mine ? "text-secondary" : "text-primary"
                }`}
              >
                {m.mine ? "You" : "Stranger"}
              </span>
              <span
                className={`rounded-xl px-3 py-2 text-sm ${
                  m.mine
                    ? "bg-primary-container font-medium text-on-primary"
                    : "bg-surface-container text-on-surface"
                }`}
              >
                {m.text}
              </span>
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={submit}
        className="bg-surface-container-lowest/80 p-4"
      >
        <div className="flex items-center gap-2 rounded-xl bg-surface-container-lowest py-1.5 pr-1.5 pl-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={connected ? "Type a message…" : "Connecting…"}
            disabled={!connected}
            className="min-w-0 flex-1 bg-transparent text-sm text-on-surface outline-none placeholder:text-outline-variant disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!connected || !draft.trim()}
            className="shrink-0 rounded-lg bg-primary-container px-3.5 py-1.5 font-sans text-[13px] font-medium text-on-primary transition hover:bg-primary disabled:opacity-40"
            aria-label="Send"
          >
            Send
          </button>
        </div>
      </form>
    </aside>
  );
}
