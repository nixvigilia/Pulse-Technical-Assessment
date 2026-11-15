import { prisma } from "@/lib/prisma";
import { releaseMatchPartner } from "@/lib/match-queue";
import { PRESENCE_STATUS } from "@/lib/presence-state";

/** When a session vanishes, free their partner and notify them. */
export async function releasePartnersForPresenceIds(
  departedIds: string[],
): Promise<void> {
  if (departedIds.length === 0) return;

  await releaseMatchPartner(departedIds);

  const departed = await prisma.presence.findMany({
    where: { id: { in: departedIds } },
    select: { id: true, peerId: true },
  });

  const partnerIds = [
    ...new Set(
      departed.map((d) => d.peerId).filter((p): p is string => Boolean(p)),
    ),
  ];

  if (partnerIds.length > 0) {
    await prisma.presence.updateMany({
      where: { id: { in: partnerIds } },
      data: { status: PRESENCE_STATUS.available, peerId: null },
    });
    for (const departedRow of departed) {
      if (!departedRow.peerId) continue;
      await prisma.signal.create({
        data: {
          fromId: departedRow.id,
          toId: departedRow.peerId,
          type: "end",
          payload: null,
        },
      });
    }
  }
}