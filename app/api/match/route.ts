import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizePresence } from "@/lib/authorize-presence";
import {
  handleMatchAccept,
  handleMatchCancel,
  handleMatchDecline,
  joinMatchQueue,
} from "@/lib/match-queue";
import { isGenderPref } from "@/lib/match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = new Set(["join", "cancel", "accept", "decline"]);

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const { id, secret, action, genderPreference, spokenLanguages, gender } = (
    body ?? {}
  ) as Record<string, unknown>;

  if (typeof id !== "string" || !(await authorizePresence(id, secret))) {
    return Response.json({ error: "unauthorized" }, { status: 403 });
  }
  if (typeof action !== "string" || !ACTIONS.has(action)) {
    return Response.json({ error: "invalid action" }, { status: 400 });
  }

  if (action === "join") {
    const pref = isGenderPref(genderPreference) ? genderPreference : "anyone";
    const langs =
      Array.isArray(spokenLanguages) &&
      spokenLanguages.every((c) => typeof c === "string")
        ? spokenLanguages
        : undefined;
  const genderVal =
    gender === undefined
      ? undefined
      : gender === null
        ? null
        : typeof gender === "string"
          ? gender
          : undefined;
    const result = await joinMatchQueue(id, pref, {
      spokenLanguages: langs,
      gender: genderVal,
    });
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 409 });
    }
    return Response.json({ ok: true });
  }

  if (action === "cancel") {
    await handleMatchCancel(id);
    await prisma.presence.update({
      where: { id },
      data: { matchCooldownUntil: null },
    });
    return Response.json({ ok: true });
  }

  if (action === "accept") {
    const ok = await handleMatchAccept(id);
    if (!ok) return Response.json({ error: "cannot accept" }, { status: 409 });
    return Response.json({ ok: true });
  }

  if (action === "decline") {
    await handleMatchDecline(id);
    await prisma.presence.update({
      where: { id },
      data: { matchCooldownUntil: null },
    });
    return Response.json({ ok: true });
  }

  return Response.json({ error: "unknown" }, { status: 400 });
}