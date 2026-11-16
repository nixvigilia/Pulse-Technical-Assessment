import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { STALE_MS, SIGNAL_TTL_MS } from "@/lib/presence";
import type { PollResponse } from "@/lib/types";
import { authorizePresence } from "@/lib/authorize-presence";
import { releasePartnersForPresenceIds } from "@/lib/presence-cleanup";
import { SESSION_KEY_HEADER } from "@/lib/session-constants";
import type { PresenceStatus } from "@/lib/presence-state";
import { computeActivityCounts } from "@/lib/activity";
import {
  enrichMatchSnapshot,
  expirePendingMatches,
  tryPairSearchers,
} from "@/lib/match-queue";
import { parseLanguageList } from "@/lib/languages";
import { isGenderValue } from "@/lib/match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/poll?id= — heartbeat, reap, peers, drain mailbox.
// Requires header X-Pulse-Session-Key matching this id's presence row.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const id = params.get("id");
  const secret = request.headers.get(SESSION_KEY_HEADER);

  if (!id) {
    return Response.json({ error: "missing id" }, { status: 400 });
  }

  if (!(await authorizePresence(id, secret))) {
    return Response.json({ error: "unauthorized" }, { status: 403 });
  }

  const now = Date.now();
  const staleCutoff = new Date(now - STALE_MS);
  const signalCutoff = new Date(now - SIGNAL_TTL_MS);

  await prisma.presence.updateMany({
    where: { id },
    data: { lastSeen: new Date(now) },
  });

  const staleRows = await prisma.presence.findMany({
    where: { lastSeen: { lt: staleCutoff } },
    select: { id: true },
  });
  if (staleRows.length > 0) {
    const staleIds = staleRows.map((r) => r.id);
    await releasePartnersForPresenceIds(staleIds);
    await prisma.presence.deleteMany({ where: { id: { in: staleIds } } });
  }
  await prisma.signal.deleteMany({ where: { createdAt: { lt: signalCutoff } } });

  const nowDate = new Date(now);
  await expirePendingMatches(nowDate);
  await tryPairSearchers(nowDate);

  const allLive = await prisma.presence.findMany({
    where: { lastSeen: { gte: staleCutoff } },
    select: { status: true },
  });
  const activity = computeActivityCounts(
    allLive.map((r) => r.status as PresenceStatus),
  );

  const selfRow = await prisma.presence.findUnique({
    where: { id },
  });
  const match = selfRow ? await enrichMatchSnapshot(selfRow) : null;

  const peers = await prisma.presence.findMany({
    where: {
      id: { not: id },
      lastSeen: { gte: staleCutoff },
    },
    select: { id: true, lat: true, lng: true, status: true },
  });

  const inbox = await prisma.signal.findMany({
    where: { toId: id },
    orderBy: { createdAt: "asc" },
  });
  if (inbox.length > 0) {
    await prisma.signal.deleteMany({
      where: { id: { in: inbox.map((s) => s.id) } },
    });
  }

  const preferences = {
    spokenLanguages: parseLanguageList(selfRow?.spokenLanguages),
    preferredLanguage: selfRow?.preferredLanguage ?? null,
    gender: selfRow?.gender && isGenderValue(selfRow.gender)
      ? selfRow.gender
      : null,
  };

  const response: PollResponse = {
    activity,
    match: match ?? {
      phase: "idle" as const,
      language: null,
      mode: null,
      youAccepted: false,
      acceptedCount: 0,
      expiresAt: null,
      peerId: null,
    },
    preferences,
    peers: peers.map((p) => ({
      id: p.id,
      lat: p.lat,
      lng: p.lng,
      status: p.status as PresenceStatus,
    })),
    signals: inbox.map((s) => ({
      id: s.id,
      fromId: s.fromId,
      toId: s.toId,
      type: s.type as PollResponse["signals"][number]["type"],
      payload: s.payload,
      createdAt: s.createdAt.toISOString(),
    })),
  };

  return Response.json(response);
}