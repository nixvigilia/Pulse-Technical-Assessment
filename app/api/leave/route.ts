import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizePresence } from "@/lib/authorize-presence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/leave — body { id, secret }. Called via sendBeacon on tab close.
export async function POST(request: NextRequest) {
  let id: string | undefined;
  let secret: string | undefined;
  try {
    const text = await request.text();
    if (text) {
      const parsed = JSON.parse(text) as { id?: unknown; secret?: unknown };
      id = typeof parsed.id === "string" ? parsed.id : undefined;
      secret = typeof parsed.secret === "string" ? parsed.secret : undefined;
    }
  } catch {
    id = undefined;
    secret = undefined;
  }

  if (typeof id !== "string" || !id) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }

  if (!(await authorizePresence(id, secret))) {
    return Response.json({ error: "unauthorized" }, { status: 403 });
  }

  await prisma.signal.deleteMany({
    where: { OR: [{ toId: id }, { fromId: id }] },
  });
  await prisma.presence.deleteMany({ where: { id } });

  return Response.json({ ok: true });
}