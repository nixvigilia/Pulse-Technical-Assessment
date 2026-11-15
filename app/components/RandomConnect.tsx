"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LANGUAGE_OPTIONS } from "@/lib/language-options";
import type { MatchSnapshot, SessionPreferences } from "@/lib/types";

const EMPTY_PREFS: SessionPreferences = {
  spokenLanguages: [],
  preferredLanguage: null,
  gender: null,
};

type GenderPref = "anyone" | "men" | "women";
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

  const countdown = useMemo(() => {
    if (!match.expiresAt) return null;
    const left = Math.max(
      0,
      Math.ceil((new Date(match.expiresAt).getTime() - Date.now()) / 1000),
    );
    return left;
  }, [match.expiresAt]);

  if (!open) return null;

  const inQueue =
    match.phase === "searching" || match.phase === "pending";

  const canJoin = spoken.length > 0;

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
      className="absolute inset-0 z-40 flex items-end justify-center bg-zinc-950/50 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 p-5 text-zinc-100 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <PanelTitle match={match} />
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-zinc-600 px-3 py-1 text-xs text-zinc-400 hover:border-zinc-500"
          >
            Close
          </button>
        </div>

        {match.phase === "pending" && (
          <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
            <p className="font-medium text-amber-100">Match found — accept to connect</p>
            {match.language && (
              <p className="mt-1 text-xs text-amber-200/70">
                Shared language:{" "}
                {LANGUAGE_OPTIONS.find((l) => l.code === match.language)?.label ??
                  match.language}
              </p>
            )}
            <p className="mt-1 text-amber-200/80">
              {match.acceptedCount}/2 accepted
              {countdown !== null && ` · ${countdown}s left`}
            </p>
            <div className="mt-3 flex gap-2">
              {!match.youAccepted && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onAccept()}
                    className="flex-1 rounded-full bg-emerald-400 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-300 disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onDecline()}
                    className="flex-1 rounded-full border border-zinc-600 py-2 text-sm hover:border-zinc-500 disabled:opacity-50"
                  >
                    Decline
                  </button>
                </>
              )}
              {match.youAccepted && (
                <p className="text-amber-100/90">Waiting for the other person…</p>
              )}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onCancel()}
              className="mt-2 w-full text-xs text-zinc-400 underline hover:text-zinc-300"
            >
              Cancel
            </button>
          </div>
        )}

        {match.phase === "searching" && (
          <div className="mb-4 rounded-xl border border-zinc-600 bg-zinc-800/50 p-4 text-sm">
            <p>Finding someone who shares a spoken language…</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onCancel()}
              className="mt-3 w-full rounded-full border border-zinc-500 py-2 text-sm hover:bg-zinc-800 disabled:opacity-50"
            >
              Cancel search
            </button>
          </div>
        )}

        {match.phase === "idle" && (
          <>
            <fieldset className="mb-4 space-y-2">
              <legend className="text-sm font-medium text-zinc-300">
                Spoken languages
              </legend>
              <p className="text-xs text-zinc-500">
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
                      className={`rounded-full px-3 py-1 text-xs ${
                        on
                          ? "bg-emerald-400 text-zinc-950"
                          : "border border-zinc-600 text-zinc-300"
                      }`}
                    >
                      {lang.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <label className="mb-3 block text-sm">
              <span className="text-zinc-300">Your gender (optional)</span>
              <select
                value={gender}
                onChange={(e) =>
                  setGender(e.target.value as typeof gender)
                }
                className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm"
              >
                <option value="">Prefer not to say</option>
                <option value="man">Man</option>
                <option value="woman">Woman</option>
              </select>
            </label>

            <fieldset className="mb-3">
              <legend className="text-sm text-zinc-300">Connect with</legend>
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
                    className={`flex-1 rounded-full py-2 text-xs ${
                      genderPref === v
                        ? "bg-emerald-400 text-zinc-950"
                        : "border border-zinc-600"
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
              className="w-full rounded-full bg-emerald-400 py-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-300 disabled:opacity-50"
            >
              Random connect
            </button>
            {!canJoin && (
              <p className="text-center text-xs text-amber-400/90">
                Select at least one spoken language to search.
              </p>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSaveAndMaybeJoin(false)}
              className="w-full rounded-full border border-zinc-600 py-2 text-xs text-zinc-400 hover:border-zinc-500"
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
      <h2 className="text-lg font-semibold">Searching…</h2>
    );
  }
  if (match.phase === "pending") {
    return <h2 className="text-lg font-semibold">Random connection</h2>;
  }
  return <h2 className="text-lg font-semibold">Random connection</h2>;
}