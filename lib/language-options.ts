/** UI + server allowlist — kept in its own module for reliable client bundling. */
export const DEFAULT_MATCH_LANGUAGE = "en";

export const LANGUAGE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
  { code: "hi", label: "Hindi" },
  { code: "ar", label: "Arabic" },
] as const;

export type LanguageCode = (typeof LANGUAGE_OPTIONS)[number]["code"];