import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type { SignalType } from "@/lib/types";
import { authorizePresence } from "@/lib/authorize-presence";
import {
  canAcceptConnection,
  canEndCall,
  canReceiveRequest,
  canStartCall,
  PRESENCE_STATUS,
} from "@/lib/presence-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TYPES: SignalType[] = [
  "request",
  "accept",
  "decline",
  "offer",
  "answer",
  "ice",
  "call-start",
  "call-end",
  "end",
];

const MAX_PAYLOAD = 64 * 1024;

// POST /api/signal — body { fromId, secret, toId, type, payload? }
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const { fromId, secret, toId, type, payload } = (body ?? {}) as Record<
    string,
    unknown
  >;

  if (typeof fromId !== "string" || typeof toId !== "string") {
    return Response.json({ error: "invalid ids" }, { status: 400 });
  }
  if (!(await authorizePresence(fromId, secret))) {
    return Response.json({ error: "unauthorized" }, { status: 403 });
  }
  if (typeof type !== "string" || !VALID_TYPES.includes(type as SignalType)) {
    return Response.json({ error: "invalid type" }, { status: 400 });
  }
  if (
    payload !== undefined &&
    payload !== null &&
    (typeof payload !== "string" || payload.length > MAX_PAYLOAD)
  ) {
    return Response.json({ error: "invalid payload" }, { status: 400 });
  }

  const signalType = type as SignalType;
  const payloadStr = typeof payload === "string" ? payload : null;

  if (signalType === "request") {
    const allowed = await prisma.$transaction(async (tx) => {
      const [target, from] = await Promise.all([
        tx.presence.findUnique({
          where: { id: toId },
          select: { status: true },
        }),
        tx.presence.findUnique({
          where: { id: fromId },
          select: { status: true },
        }),
      ]);
      if (
        !target ||
        !from ||
        !canReceiveRequest(target.status) ||
        !canReceiveRequest(from.status)
      ) {
        return false;
      }
      return true;
    });
    if (!allowed) {
      await sendDecline(toId, fromId);
      return Response.json({ ok: true, autoDeclined: true });
    }
  }

  if (signalType === "accept") {
    const ok = await prisma.$transaction(async (tx) => {
      const rows = await tx.presence.findMany({
        where: { id: { in: [fromId, toId] } },
        select: { id: true, status: true },
      });
      const fromRow = rows.find((r) => r.id === fromId);
      const toRow = rows.find((r) => r.id === toId);
      if (
        !fromRow ||
        !toRow ||
        !canAcceptConnection(fromRow.status, toRow.status)
      ) {
        return false;
      }
      const updated = await tx.presence.updateMany({
        where: {
          id: { in: [fromId, toId] },
          status: PRESENCE_STATUS.available,
        },
        data: { status: PRESENCE_STATUS.busy },
      });
      if (updated.count !== 2) return false;
      await tx.presence.update({
        where: { id: fromId },
        data: { peerId: toId },
      });
      await tx.presence.update({
        where: { id: toId },
        data: { peerId: fromId },
      });
      return true;
    });
    if (!ok) {
      await sendDecline(toId, fromId);
      return Response.json({ ok: true, autoDeclined: true });
    }
  } else if (signalType === "decline" || signalType === "end") {
    await prisma.presence.updateMany({
      where: { id: { in: [fromId, toId] } },
      data: {
        status: PRESENCE_STATUS.available,
        peerId: null,
        matchMode: null,
        matchLanguage: null,
        matchGenderPref: null,
        matchId: null,
        matchPartnerId: null,
        matchExpiresAt: null,
        matchAccepted: false,
      },
    });
  } else if (signalType === "call-start") {
    const transitioned = await prisma.$transaction(async (tx) => {
      const rows = await tx.presence.findMany({
        where: { id: { in: [fromId, toId] } },
        select: { id: true, status: true, peerId: true },
      });
      const fromRow = rows.find((r) => r.id === fromId);
      const toRow = rows.find((r) => r.id === toId);
      if (
        !fromRow ||
        !toRow ||
        fromRow.peerId !== toId ||
        toRow.peerId !== fromId
      ) {
        return "deny" as const;
      }
      if (
        fromRow.status === PRESENCE_STATUS.on_call &&
        toRow.status === PRESENCE_STATUS.on_call
      ) {
        return "noop" as const;
      }
      if (!canStartCall(fromRow.status, toRow.status)) {
        return "deny" as const;
      }
      const updated = await tx.presence.updateMany({
        where: {
          id: { in: [fromId, toId] },
          status: PRESENCE_STATUS.busy,
        },
        data: { status: PRESENCE_STATUS.on_call },
      });
      return updated.count === 2 ? ("ok" as const) : ("deny" as const);
    });
    if (transitioned === "deny") {
      return Response.json({ error: "call not allowed" }, { status: 409 });
    }
  } else if (signalType === "call-end") {
    const transitioned = await prisma.$transaction(async (tx) => {
      const rows = await tx.presence.findMany({
        where: { id: { in: [fromId, toId] } },
        select: { id: true, status: true, peerId: true },
      });
      const fromRow = rows.find((r) => r.id === fromId);
      const toRow = rows.find((r) => r.id === toId);
      if (
        !fromRow ||
        !toRow ||
        fromRow.peerId !== toId ||
        toRow.peerId !== fromId
      ) {
        return "deny" as const;
      }
      if (
        fromRow.status === PRESENCE_STATUS.busy &&
        toRow.status === PRESENCE_STATUS.busy
      ) {
        return "noop" as const;
      }
      if (!canEndCall(fromRow.status, toRow.status)) {
        return "deny" as const;
      }
      const updated = await tx.presence.updateMany({
        where: {
          id: { in: [fromId, toId] },
          status: PRESENCE_STATUS.on_call,
        },
        data: { status: PRESENCE_STATUS.busy },
      });
      return updated.count === 2 ? ("ok" as const) : ("deny" as const);
    });
    if (transitioned === "deny") {
      return Response.json({ error: "call not allowed" }, { status: 409 });
    }
  }

  // Video presence is reflected on the next poll; no mailbox delivery needed.
  if (signalType !== "call-start" && signalType !== "call-end") {
    await prisma.signal.create({
      data: { fromId, toId, type: signalType, payload: payloadStr },
    });
  }

  return Response.json({ ok: true });
}

async function sendDecline(targetId: string, initiatorId: string) {
  await prisma.signal.create({
    data: { fromId: targetId, toId: initiatorId, type: "decline", payload: null },
  });
}