import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizePresence } from "@/lib/authorize-presence";
import {
  isValidLanguageCode,
  serializeLanguageList,
} from "@/lib/languages";
import { isGenderValue } from "@/lib/match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/preferences — session-only spoken languages + optional gender
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const { id, secret, spokenLanguages, preferredLanguage, gender } = (
    body ?? {}
  ) as Record<string, unknown>;

  if (typeof id !== "string" || !(await authorizePresence(id, secret))) {
    return Response.json({ error: "unauthorized" }, { status: 403 });
  }

  let spoken: string[] = [];
  if (spokenLanguages !== undefined) {
    if (!Array.isArray(spokenLanguages)) {
      return Response.json({ error: "invalid spokenLanguages" }, { status: 400 });
    }
    spoken = spokenLanguages.filter(
      (c): c is string => typeof c === "string" && isValidLanguageCode(c),
    );
  }

  if (
    preferredLanguage !== undefined &&
    preferredLanguage !== null &&
    (typeof preferredLanguage !== "string" ||
      !isValidLanguageCode(preferredLanguage))
  ) {
    return Response.json({ error: "invalid preferredLanguage" }, { status: 400 });
  }

  if (
    gender !== undefined &&
    gender !== null &&
    !isGenderValue(gender)
  ) {
    return Response.json({ error: "invalid gender" }, { status: 400 });
  }

  const pref =
    preferredLanguage === undefined
      ? undefined
      : preferredLanguage === null
        ? null
        : (preferredLanguage as string);

  const genderVal =
    gender === undefined
      ? undefined
      : gender === null
        ? null
        : gender;

  await prisma.presence.update({
    where: { id },
    data: {
      ...(spokenLanguages !== undefined
        ? { spokenLanguages: serializeLanguageList(spoken) }
        : {}),
      ...(preferredLanguage !== undefined ? { preferredLanguage: pref } : {}),
      ...(gender !== undefined ? { gender: genderVal } : {}),
    },
  });

  return Response.json({ ok: true });
}