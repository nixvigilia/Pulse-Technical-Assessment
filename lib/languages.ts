import {
  DEFAULT_MATCH_LANGUAGE,
  LANGUAGE_OPTIONS,
  type LanguageCode,
} from "@/lib/language-options";

export { DEFAULT_MATCH_LANGUAGE, LANGUAGE_OPTIONS, type LanguageCode };

const VALID = new Set<string>(LANGUAGE_OPTIONS.map((l) => l.code));

export function isValidLanguageCode(code: unknown): code is LanguageCode {
  return typeof code === "string" && VALID.has(code);
}

export function parseLanguageList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c): c is string => typeof c === "string" && VALID.has(c));
  } catch {
    return [];
  }
}

export function serializeLanguageList(codes: string[]): string {
  const unique = [...new Set(codes.filter((c) => VALID.has(c)))];
  return JSON.stringify(unique);
}