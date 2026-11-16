import { LANGUAGE_OPTIONS } from "@/lib/language-options";
import type { GenderPref } from "@/lib/match";

const LANG_LABEL = new Map(
  LANGUAGE_OPTIONS.map((o) => [o.code, o.label] as const),
);

export function spokenLanguageLabels(codes: string[]): string[] {
  return codes.map((c) => LANG_LABEL.get(c as (typeof LANGUAGE_OPTIONS)[number]["code"]) ?? c);
}

export function genderDisplayLabel(
  gender: "man" | "woman" | "unspecified" | null,
): string | null {
  if (gender === "man") return "Man";
  if (gender === "woman") return "Woman";
  if (gender === "unspecified") return "Prefer not to say";
  return null;
}

export function connectWithDisplayLabel(pref: GenderPref | null): string | null {
  if (pref === "anyone") return "Anyone";
  if (pref === "men") return "Men";
  if (pref === "women") return "Women";
  return null;
}

export function hasPublicPreferences(peer: {
  spokenLanguages: string[];
  gender: "man" | "woman" | "unspecified" | null;
  matchGenderPref: GenderPref | null;
}): boolean {
  return (
    peer.spokenLanguages.length > 0 ||
    genderDisplayLabel(peer.gender) !== null ||
    connectWithDisplayLabel(peer.matchGenderPref) !== null
  );
}