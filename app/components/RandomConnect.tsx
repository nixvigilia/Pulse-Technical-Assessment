"use client";

import { useEffect, useRef, useState } from "react";
import { LANGUAGE_OPTIONS } from "@/lib/language-options";
import { MATCH_ACCEPT_MS } from "@/lib/match";
import type { MatchSnapshot, SessionPreferences } from "@/lib/types";

const EMPTY_PREFS: SessionPreferences = {
  spokenLanguages: [],
  preferredLanguage: null,
  gender: null,
};

type GenderPref = "anyone" | "men" | "women";

const SEARCH_WAIT_MESSAGES = [
  "Good conversations can start with a stranger…",
  "Somewhere out there, someone is looking to chat too…",
  "A new connection might be just around the corner…",
  "Every stranger has a story to tell…",
  "Maybe your next favorite conversation starts here…",
  "Making the world feel a little smaller…",
  "Someone new is just a hello away…",
  "Great conversations happen unexpectedly…",
] as const;

const SEARCH_MSG_HOLD_MS = 3500;
const SEARCH_MSG_FADE_MS = 320;

function WaitDots({
  className = "bg-primary/80",
  size = "size-2",
}: {
  className?: string;
  size?: string;
}) {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`search-wait-dot ${size} rounded-full ${className}`}
          style={{ animationDelay: `${i * 0.22}s` }}
        />
      ))}
    </>
  );
}

function SearchRadar() {
  return (
    <div
      className="relative mx-auto flex size-28 items-center justify-center"
      aria-hidden
    >
      <span className="search-radar-ring" />
      <span className="search-radar-ring search-radar-ring-delay" />
      <span className="absolute size-16 rounded-full bg-primary/10" />
      <span className="absolute size-2.5 rounded-full bg-primary shadow-[0_0_18px_rgba(78,222,163,0.85)]" />
    </div>
  );
}

function SearchElapsed() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => {
      setSeconds(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  const label =
    minutes > 0
      ? `${minutes}:${rest.toString().padStart(2, "0")}`
      : `${seconds}s`;

  return (
    <p className="font-mono text-[11px] tracking-wide text-outline">
      Searching for {label}
    </p>
  );
}

function MatchAcceptExpiryLine({ expiresAt }: { expiresAt: string }) {
  const [remainingRatio, setRemainingRatio] = useState(1);

  useEffect(() => {
    const endMs = new Date(expiresAt).getTime();
    const startMs = endMs - MATCH_ACCEPT_MS;
    const tick = () => {
      const span = endMs - startMs;
      const left = Math.max(0, endMs - Date.now());
      setRemainingRatio(span > 0 ? left / span : 0);
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [expiresAt]);

  const pct = Math.round(remainingRatio * 100);

  return (
    <div
      className="mt-3 h-1 w-full overflow-hidden rounded-full bg-surface-container-highest"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label="Time left to accept"
    >
      <div
        className="h-full rounded-full bg-secondary transition-[width] duration-100 ease-linear"
        style={{ width: `${remainingRatio * 100}%` }}
      />
    </div>
  );
}

function RotatingSearchMessage() {
  const [index, setIndex] = useState(() =>
    Math.floor(Math.random() * SEARCH_WAIT_MESSAGES.length),
  );
  const [fading, setFading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let holdTimer: ReturnType<typeof setTimeout>;
    let fadeTimer: ReturnType<typeof setTimeout>;

    const scheduleNext = () => {
      if (cancelled) return;
      holdTimer = setTimeout(() => {
        if (cancelled) return;
        setFading(true);
        fadeTimer = setTimeout(() => {
          if (cancelled) return;
          setIndex((i) => (i + 1) % SEARCH_WAIT_MESSAGES.length);
          setFading(false);
          scheduleNext();
        }, SEARCH_MSG_FADE_MS);
      }, SEARCH_MSG_HOLD_MS);
    };

    scheduleNext();
    return () => {
      cancelled = true;
      clearTimeout(holdTimer);
      clearTimeout(fadeTimer);
    };
  }, []);

  return (
    <p
      role="status"
      aria-live="polite"
      className={`min-h-[3.25rem] text-center font-body text-[15px] leading-snug text-on-surface transition-opacity duration-300 ease-in-out ${
        fading ? "opacity-0" : "opacity-100"
      }`}
    >
      {SEARCH_WAIT_MESSAGES[index]}
    </p>
  );
}
export default function RandomConnect({
  open,
  onClose,
  preferences: prefsProp,
  match,
  onSavePreferences,
  onJoin,
  onCancel,
  onAccept,
  onDecline,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  preferences: SessionPreferences;
  match: MatchSnapshot;
  onSavePreferences: (prefs: SessionPreferences) => Promise<void>;
  onJoin: (opts: {
    genderPreference: GenderPref;
    spokenLanguages: string[];
    gender: "man" | "woman" | "unspecified" | null;
  }) => Promise<void>;
  onCancel: () => Promise<void>;
  onAccept: () => Promise<void>;
  onDecline: () => Promise<void>;
  busy: boolean;
}) {
  const preferences = prefsProp ?? EMPTY_PREFS;

  const [spoken, setSpoken] = useState<string[]>(preferences.spokenLanguages ?? []);
  const [gender, setGender] = useState<
    "man" | "woman" | "unspecified" | ""
  >(preferences.gender ?? "");
  const [genderPref, setGenderPref] = useState<GenderPref>("anyone");

  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      setSpoken(preferences.spokenLanguages ?? []);
      setGender(preferences.gender ?? "");
      setGenderPref("anyone");
    }
    wasOpen.current = open;
  }, [open, preferences]);

  if (!open) return null;

  const inQueue =
    match.phase === "searching" || match.phase === "pending";

  const canJoin = spoken.length > 0;

  async function handleClose() {
    if (inQueue && !busy) {
      await onCancel();
    }
    onClose();
  }

  async function handleSaveAndMaybeJoin(join: boolean) {
    const genderVal =
      gender === "" || gender === "unspecified"
        ? null
        : gender === "man" || gender === "woman"
          ? gender
          : null;
    if (join) {
      await onJoin({
        genderPreference: genderPref,
        spokenLanguages: spoken,
        gender: genderVal,
      });
    } else {
      await onSavePreferences({
        spokenLanguages: spoken,
        preferredLanguage: null,
        gender: genderVal,
      });
    }
  }

  return (
    <div
      className="absolute inset-0 z-40 flex items-end justify-center bg-surface-container-lowest/50 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-surface-container/95 p-5 text-on-surface shadow-[0_16px_40px_rgba(0,0,0,0.8)] backdrop-blur-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <PanelTitle match={match} />
          {match.phase !== "searching" && (
            <button
              type="button"
              disabled={busy && inQueue}
              onClick={() => void handleClose()}
              className="rounded-lg bg-surface-container-high px-3 py-1 font-sans text-[13px] text-on-surface-variant transition hover:text-on-surface disabled:opacity-50"
            >
              Close
            </button>
          )}
        </div>

        {match.phase === "pending" && (
          <div className="mb-4 rounded-xl bg-surface-container-high p-4 text-sm">
            <p className="font-medium text-secondary">Match found — accept to connect</p>
            {match.expiresAt && (
              <MatchAcceptExpiryLine expiresAt={match.expiresAt} />
            )}
            {!match.youAccepted ? (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onAccept()}
                  className="flex-1 rounded-lg bg-primary-container py-2 font-sans text-sm font-medium text-on-primary shadow-[0_0_12px_rgba(16,185,129,0.3)] transition hover:bg-primary disabled:opacity-50"
                >
                  Accept
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onDecline()}
                  className="flex-1 rounded-lg bg-surface-container py-2 font-sans text-sm text-on-surface-variant transition hover:text-on-surface disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            ) : (
              <p className="mt-3 text-center text-xs text-on-surface-variant">
                Waiting for the other person…
              </p>
            )}
          </div>
        )}

        {match.phase === "searching" && (
          <div className="flex flex-col items-center gap-5 rounded-xl bg-surface-container-high/80 px-5 py-8 text-sm">
            <SearchRadar />
            <div className="flex w-full flex-col items-center gap-2">
              <div className="flex items-center gap-1.5" aria-hidden>
                <WaitDots size="size-1.5" />
              </div>
              <RotatingSearchMessage />
              <SearchElapsed />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onCancel()}
              className="rounded-full bg-surface-container px-5 py-2 font-sans text-xs text-on-surface-variant transition hover:text-on-surface disabled:opacity-50"
            >
              Stop searching
            </button>
          </div>
        )}

        {match.phase === "idle" && (
          <>
            <fieldset className="mb-4 space-y-2">
              <legend className="font-sans text-[13px] font-medium tracking-wide text-on-surface-variant">
                Spoken languages
              </legend>
              <p className="text-xs text-outline">
                Pick at least one. We match you with someone who shares any of
                the same languages.
              </p>
              <div className="flex flex-wrap gap-2">
                {LANGUAGE_OPTIONS.map((lang) => {
                  const on = spoken.includes(lang.code);
                  return (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() =>
                        setSpoken((prev) =>
                          on
                            ? prev.filter((c) => c !== lang.code)
                            : [...prev, lang.code],
                        )
                      }
                      className={`rounded-full px-3 py-1 font-sans text-xs ${
                        on
                          ? "bg-primary-container font-medium text-on-primary"
                          : "bg-surface-container-high text-on-surface-variant"
                      }`}
                    >
                      {lang.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <label className="mb-3 block text-sm">
              <span className="font-sans text-[13px] text-on-surface-variant">
                Your gender (optional)
              </span>
              <select
                value={gender}
                onChange={(e) =>
                  setGender(e.target.value as typeof gender)
                }
                className="mt-1 w-full rounded-lg bg-surface-container-high px-3 py-2 text-sm text-on-surface outline-none"
              >
                <option value="">Prefer not to say</option>
                <option value="man">Man</option>
                <option value="woman">Woman</option>
              </select>
            </label>

            <fieldset className="mb-3">
              <legend className="font-sans text-[13px] text-on-surface-variant">
                Connect with
              </legend>
              <div className="mt-2 flex gap-2">
                {(
                  [
                    ["anyone", "Anyone"],
                    ["men", "Men"],
                    ["women", "Women"],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setGenderPref(v)}
                    className={`flex-1 rounded-full py-2 font-sans text-xs ${
                      genderPref === v
                        ? "bg-primary-container font-medium text-on-primary"
                        : "bg-surface-container-high text-on-surface-variant"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

          </>
        )}

        {match.phase === "idle" && !inQueue && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={busy || !canJoin}
              onClick={() => void handleSaveAndMaybeJoin(true)}
              className="w-full rounded-full bg-primary-container py-3 font-sans text-sm font-medium text-on-primary shadow-[0_0_12px_rgba(16,185,129,0.3)] transition hover:bg-primary disabled:opacity-50"
            >
              Random connect
            </button>
            {!canJoin && (
              <p className="text-center text-xs text-error">
                Select at least one spoken language to search.
              </p>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSaveAndMaybeJoin(false)}
              className="w-full rounded-full bg-surface-container-high py-2 font-sans text-xs text-on-surface-variant transition hover:text-on-surface"
            >
              Save preferences only
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PanelTitle({ match }: { match: MatchSnapshot }) {
  if (match.phase === "searching") {
    return (
      <div>
        <h2 className="font-sans text-lg font-medium tracking-tight">
          Searching…
        </h2>
        <p className="mt-0.5 font-sans text-xs text-on-surface-variant">
          Matching you with someone who shares a language
        </p>
      </div>
    );
  }
  if (match.phase === "pending") {
    return (
      <h2 className="font-sans text-lg font-medium tracking-tight">
        Random connection
      </h2>
    );
  }
  return (
    <h2 className="font-sans text-lg font-medium tracking-tight">
      Random connection
    </h2>
  );
}