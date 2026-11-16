import { parseLanguageList } from "@/lib/languages";

export type GenderValue = "man" | "woman" | "unspecified";
export type GenderPref = "anyone" | "men" | "women";
export type ConnectionMode = "text" | "text_video";

export const MATCH_ACCEPT_MS = 20_000;
export const MATCH_JOIN_CAP = 30;

export interface MatchPrefs {
  spokenLanguages: string | null;
  gender: string | null;
  matchLanguage: string | null;
  matchGenderPref: string | null;
  matchMode: string | null;
}

export function isGenderValue(value: unknown): value is GenderValue {
  return value === "man" || value === "woman" || value === "unspecified";
}

export function isGenderPref(value: unknown): value is GenderPref {
  return value === "anyone" || value === "men" || value === "women";
}

export function isConnectionMode(value: unknown): value is ConnectionMode {
  return value === "text" || value === "text_video";
}

function normalizeGender(gender: GenderValue | null): GenderValue {
  if (gender === "man" || gender === "woman") return gender;
  return "unspecified";
}

/** Whether observer's filter accepts target's gender (or lack thereof). */
export function genderFilterAccepts(
  filter: GenderPref,
  targetGender: GenderValue | null,
): boolean {
  if (filter === "anyone") return true;
  const target = normalizeGender(targetGender);
  // Prefer not to say matches Connect with: Anyone, Men, or Women.
  if (target === "unspecified") return true;
  if (filter === "men") return target === "man";
  if (filter === "women") return target === "woman";
  return false;
}

export function mutualGenderCompatible(
  a: MatchPrefs,
  b: MatchPrefs,
): boolean {
  const aGender = isGenderValue(a.gender) ? a.gender : "unspecified";
  const bGender = isGenderValue(b.gender) ? b.gender : "unspecified";
  const aPref = isGenderPref(a.matchGenderPref) ? a.matchGenderPref : "anyone";
  const bPref = isGenderPref(b.matchGenderPref) ? b.matchGenderPref : "anyone";
  return (
    genderFilterAccepts(aPref, bGender) && genderFilterAccepts(bPref, aGender)
  );
}

/** Languages both users listed as spoken (intersection). */
export function sharedSpokenLanguages(
  aSpoken: string | null,
  bSpoken: string | null,
): string[] {
  const aList = parseLanguageList(aSpoken);
  const bList = parseLanguageList(bSpoken);
  if (aList.length === 0 || bList.length === 0) return [];
  const bSet = new Set(bList);
  return aList.filter((code) => bSet.has(code));
}

export function hasSpokenLanguages(spoken: string | null): boolean {
  return parseLanguageList(spoken).length > 0;
}

export function usersCanMatch(a: MatchPrefs, b: MatchPrefs): boolean {
  return (
    sharedSpokenLanguages(a.spokenLanguages, b.spokenLanguages).length > 0 &&
    mutualGenderCompatible(a, b)
  );
}

export interface MatchSkipFields {
  id: string;
  matchSkipPartnerId: string | null;
}

/**
 * After expire/decline, avoid immediately re-pairing the same duo when other
 * compatible searchers exist. If they are the only match for each other, allow it.
 */
export function shouldDeferSkippedPair(
  a: MatchSkipFields,
  b: MatchSkipFields,
  searchers: MatchSkipFields[],
  paired: Set<string>,
  canMatch: (x: MatchPrefs, y: MatchPrefs) => boolean,
  prefs: (row: MatchSkipFields) => MatchPrefs,
): boolean {
  const skipped =
    a.matchSkipPartnerId === b.id || b.matchSkipPartnerId === a.id;
  if (!skipped) return false;

  const otherForA = searchers.some(
    (c) =>
      c.id !== a.id &&
      c.id !== b.id &&
      !paired.has(c.id) &&
      canMatch(prefs(a), prefs(c)) &&
      a.matchSkipPartnerId !== c.id &&
      c.matchSkipPartnerId !== a.id,
  );
  const otherForB = searchers.some(
    (c) =>
      c.id !== a.id &&
      c.id !== b.id &&
      !paired.has(c.id) &&
      canMatch(prefs(b), prefs(c)) &&
      b.matchSkipPartnerId !== c.id &&
      c.matchSkipPartnerId !== b.id,
  );

  return otherForA || otherForB;
}
