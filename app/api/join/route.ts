import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyPrivacyOffset, isValidLatLng } from "@/lib/geo";
import {
  hashSessionSecret,
  isValidSessionSecret,
  verifySessionSecret,
} from "@/lib/session-secret";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/join — body { id, secret, lat, lng } (raw coords).
// Applies a 1–3 km privacy offset. Raw coordinates are never stored.
// First join creates the row; later joins must present the same secret.
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const { id, secret, lat, lng } = (body ?? {}) as Record<string, unknown>;

  if (typeof id !== "string" || id.length < 8 || id.length > 64) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }
  if (!isValidSessionSecret(secret)) {
    return Response.json({ error: "invalid secret" }, { status: 400 });
  }
  if (!isValidLatLng(lat, lng)) {
    return Response.json({ error: "invalid coordinates" }, { status: 400 });
  }

  const offset = applyPrivacyOffset(lat as number, lng as number);
  const existing = await prisma.presence.findUnique({
    where: { id },
    select: { secretHash: true },
  });

  if (existing) {
    if (!verifySessionSecret(secret, existing.secretHash)) {
      return Response.json({ error: "unauthorized" }, { status: 403 });
    }
    await prisma.presence.update({
      where: { id },
      data: {
        lat: offset.lat,
        lng: offset.lng,
        lastSeen: new Date(),
      },
    });
  } else {
    await prisma.presence.create({
      data: {
        id,
        secretHash: hashSessionSecret(secret),
        lat: offset.lat,
        lng: offset.lng,
        busy: false,
        lastSeen: new Date(),
      },
    });
  }

  return Response.json({ ok: true });
}