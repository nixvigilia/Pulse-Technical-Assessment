import { describe, expect, it } from "vitest";
import {
  genderFilterAccepts,
  mutualGenderCompatible,
  sharedSpokenLanguages,
  shouldDeferSkippedPair,
  usersCanMatch,
} from "./match";

const spokenEn = JSON.stringify(["en"]);
const spokenEs = JSON.stringify(["es"]);
const spokenEnEs = JSON.stringify(["en", "es"]);

describe("genderFilterAccepts", () => {
  it("anyone accepts all", () => {
    expect(genderFilterAccepts("anyone", "man")).toBe(true);
    expect(genderFilterAccepts("anyone", null)).toBe(true);
    expect(genderFilterAccepts("anyone", "unspecified")).toBe(true);
  });

  it("men and women are strict for declared genders", () => {
    expect(genderFilterAccepts("men", "man")).toBe(true);
    expect(genderFilterAccepts("men", "woman")).toBe(false);
    expect(genderFilterAccepts("women", "woman")).toBe(true);
    expect(genderFilterAccepts("women", "man")).toBe(false);
  });

  it("prefer not to say matches men, women, and anyone filters", () => {
    expect(genderFilterAccepts("men", null)).toBe(true);
    expect(genderFilterAccepts("men", "unspecified")).toBe(true);
    expect(genderFilterAccepts("women", null)).toBe(true);
    expect(genderFilterAccepts("women", "unspecified")).toBe(true);
    expect(genderFilterAccepts("anyone", "unspecified")).toBe(true);
  });
});

describe("sharedSpokenLanguages", () => {
  it("returns intersection", () => {
    expect(sharedSpokenLanguages(spokenEnEs, spokenEs)).toEqual(["es"]);
    expect(sharedSpokenLanguages(spokenEn, spokenEs)).toEqual([]);
    expect(sharedSpokenLanguages(spokenEn, spokenEn)).toEqual(["en"]);
  });
});

describe("mutualGenderCompatible", () => {
  it("unspecified with women filter does not match man", () => {
    const base = {
      matchLanguage: null,
      spokenLanguages: spokenEn,
      matchMode: "text",
    };
    expect(
      mutualGenderCompatible(
        { gender: "unspecified", matchGenderPref: "anyone", ...base },
        { gender: "man", matchGenderPref: "anyone", ...base },
      ),
    ).toBe(true);
    expect(
      mutualGenderCompatible(
        { gender: "unspecified", matchGenderPref: "women", ...base },
        { gender: "man", matchGenderPref: "anyone", ...base },
      ),
    ).toBe(false);
  });
});

describe("shouldDeferSkippedPair", () => {
  const prefs = (id: string, skip: string | null) => ({
    id,
    matchSkipPartnerId: skip,
    spokenLanguages: spokenEn,
    gender: "man",
    matchGenderPref: "anyone",
    matchLanguage: null,
    matchMode: null,
  });

  it("defers when another compatible searcher exists", () => {
    const a = prefs("a", "b");
    const b = prefs("b", "a");
    const c = prefs("c", null);
    const searchers = [a, b, c];
    expect(
      shouldDeferSkippedPair(a, b, searchers, new Set(), usersCanMatch, (r) => r),
    ).toBe(true);
  });

  it("allows re-pair when they are each other's only option", () => {
    const a = prefs("a", "b");
    const b = prefs("b", "a");
    const searchers = [a, b];
    expect(
      shouldDeferSkippedPair(a, b, searchers, new Set(), usersCanMatch, (r) => r),
    ).toBe(false);
  });
});

describe("usersCanMatch", () => {
  it("requires overlapping spoken languages", () => {
    const base = {
      gender: "man",
      matchGenderPref: "anyone",
      matchMode: "text_video",
      matchLanguage: null,
    };
    expect(
      usersCanMatch(
        { ...base, spokenLanguages: spokenEn },
        { ...base, spokenLanguages: spokenEs },
      ),
    ).toBe(false);
    expect(
      usersCanMatch(
        { ...base, spokenLanguages: spokenEnEs },
        { ...base, spokenLanguages: spokenEn },
      ),
    ).toBe(true);
  });
});
