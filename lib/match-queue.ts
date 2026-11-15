import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { STALE_MS } from "@/lib/presence";
import { PRESENCE_STATUS } from "@/lib/presence-state";
import {
  hasSpokenLanguages,
  MATCH_ACCEPT_MS,
  sharedSpokenLanguages,
  type ConnectionMode,
  type GenderPref,
  usersCanMatch,
} from "@/lib/match";
import { parseLanguageList, serializeLanguageList } from "@/lib/languages";
import { isGenderValue } from "@/lib/match";

type PresenceRow = {
  id: string;
  status: string;
  peerId: string | null;
  spokenLanguages: string | null;
  gender: string | null;
  matchLanguage: string | null;
  matchGenderPref: string | null;
  matchMode: string | null;
  matchId: string | null;
  matchPartnerId: string | null;
  matchExpiresAt: Date | null;
  matchAccepted: boolean;
  lastSeen: Date;
};

export async function expirePendingMatches(now: Date): Promise<void> {
  const expired = await prisma.presence.findMany({
    where: {
      status: PRESENCE_STATUS.pending_accept,
      matchExpiresAt: { lt: now },
    },
    select: { id: true, matchPartnerId: true, matchLanguage: true, matchGenderPref: true, matchMode: true },
  });
  for (const row of expired) {
    await resetPairToSearching(row.id, row.matchPartnerId);
  }
}

async function resetPairToSearching(
  id: string,
  partnerId: string | null,
): Promise<void> {
  await prisma.presence.updateMany({
    where: { id, status: PRESENCE_STATUS.pending_accept },
    data: {
      status: PRESENCE_STATUS.searching,
      matchId: null,
      matchPartnerId: null,
      matchExpiresAt: null,
      matchAccepted: false,
    },
  });
  if (partnerId) {
    await prisma.presence.updateMany({
      where: { id: partnerId, status: PRESENCE_STATUS.pending_accept },
      data: {
        status: PRESENCE_STATUS.searching,
        matchId: null,
        matchPartnerId: null,
        matchExpiresAt: null,
        matchAccepted: false,
      },
    });
  }
}

export async function tryPairSearchers(now: Date): Promise<void> {
  const staleCutoff = new Date(now.getTime() - STALE_MS);
  const searchers = (await prisma.presence.findMany({
    where: {
      status: PRESENCE_STATUS.searching,
      lastSeen: { gte: staleCutoff },
    },
    orderBy: { lastSeen: "asc" },
  })).filter((row) => hasSpokenLanguages(row.spokenLanguages));

  const paired = new Set<string>();

  for (const a of searchers) {
    if (paired.has(a.id)) continue;
    for (const b of searchers) {
      if (b.id === a.id || paired.has(b.id)) continue;
      if (!usersCanMatch(a, b)) continue;
      const shared = sharedSpokenLanguages(a.spokenLanguages, b.spokenLanguages);
      if (shared.length === 0) continue;
      const sharedLang = shared[0];

      const matchId = randomUUID();
      const expiresAt = new Date(now.getTime() + MATCH_ACCEPT_MS);
      const ok = await prisma.$transaction(async (tx) => {
        const u1 = await tx.presence.updateMany({
          where: { id: a.id, status: PRESENCE_STATUS.searching },
          data: pendingData(matchId, b.id, expiresAt, sharedLang),
        });
        const u2 = await tx.presence.updateMany({
          where: { id: b.id, status: PRESENCE_STATUS.searching },
          data: pendingData(matchId, a.id, expiresAt, sharedLang),
        });
        return u1.count === 1 && u2.count === 1;
      });

      if (ok) {
        paired.add(a.id);
        paired.add(b.id);
        break;
      }
    }
  }
}

function pendingData(
  matchId: string,
  partnerId: string,
  expiresAt: Date,
  sharedLanguage: string,
) {
  return {
    status: PRESENCE_STATUS.pending_accept,
    matchId,
    matchPartnerId: partnerId,
    matchExpiresAt: expiresAt,
    matchAccepted: false,
    matchMode: null,
    matchLanguage: sharedLanguage,
  };
}

export async function releaseMatchPartner(
  departedIds: string[],
): Promise<void> {
  if (departedIds.length === 0) return;

  const rows = await prisma.presence.findMany({
    where: { id: { in: departedIds } },
    select: { id: true, matchPartnerId: true, status: true },
  });

  for (const row of rows) {
    if (!row.matchPartnerId) continue;
    const partnerId = row.matchPartnerId;
    const partner = await prisma.presence.findUnique({
      where: { id: partnerId },
      select: { status: true },
    });
    if (!partner) continue;

    if (
      partner.status === PRESENCE_STATUS.pending_accept ||
      partner.status === PRESENCE_STATUS.searching
    ) {
      await prisma.presence.update({
        where: { id: partnerId },
        data: {
          status: PRESENCE_STATUS.searching,
          matchId: null,
          matchPartnerId: null,
          matchExpiresAt: null,
          matchAccepted: false,
        },
      });
    } else if (
      partner.status === PRESENCE_STATUS.busy ||
      partner.status === PRESENCE_STATUS.on_call
    ) {
      await prisma.presence.update({
        where: { id: partnerId },
        data: { status: PRESENCE_STATUS.available, peerId: null, matchMode: null },
      });
      await prisma.signal.create({
        data: {
          fromId: row.id,
          toId: partnerId,
          type: "end",
          payload: null,
        },
      });
    }
  }
}

export interface MatchSnapshot {
  phase: "idle" | "searching" | "pending" | "ready";
  language: string | null;
  mode: ConnectionMode | null;
  youAccepted: boolean;
  acceptedCount: number;
  expiresAt: string | null;
  peerId: string | null;
  expired?: boolean;
}

export function buildMatchSnapshot(row: PresenceRow | null): MatchSnapshot {
  if (!row) {
    return {
      phase: "idle",
      language: null,
      mode: null,
      youAccepted: false,
      acceptedCount: 0,
      expiresAt: null,
      peerId: null,
    };
  }

  if (row.status === PRESENCE_STATUS.searching) {
    return {
      phase: "searching",
      language: row.matchLanguage,
      mode: row.matchMode as ConnectionMode | null,
      youAccepted: false,
      acceptedCount: 0,
      expiresAt: null,
      peerId: null,
    };
  }

  if (row.status === PRESENCE_STATUS.pending_accept) {
    return {
      phase: "pending",
      language: row.matchLanguage,
      mode: row.matchMode as ConnectionMode | null,
      youAccepted: row.matchAccepted,
      acceptedCount: row.matchAccepted ? 1 : 0,
      expiresAt: row.matchExpiresAt?.toISOString() ?? null,
      peerId: null,
    };
  }

  if (
    row.status === PRESENCE_STATUS.busy ||
    row.status === PRESENCE_STATUS.on_call
  ) {
    return {
      phase: "ready",
      language: row.matchLanguage,
      mode: row.matchMode as ConnectionMode | null,
      youAccepted: true,
      acceptedCount: 2,
      expiresAt: null,
      peerId: row.peerId,
    };
  }

  return {
    phase: "idle",
    language: null,
    mode: null,
    youAccepted: false,
    acceptedCount: 0,
    expiresAt: null,
    peerId: null,
  };
}

export async function enrichMatchSnapshot(
  row: PresenceRow,
): Promise<MatchSnapshot> {
  const base = buildMatchSnapshot(row);
  if (
    row.status !== PRESENCE_STATUS.pending_accept ||
    !row.matchPartnerId
  ) {
    return base;
  }
  const partner = await prisma.presence.findUnique({
    where: { id: row.matchPartnerId },
    select: { matchAccepted: true, status: true, peerId: true },
  });
  if (!partner) return base;

  const acceptedCount =
    (row.matchAccepted ? 1 : 0) + (partner.matchAccepted ? 1 : 0);

  return {
    ...base,
    acceptedCount,
    youAccepted: row.matchAccepted,
    peerId: null,
  };
}

export async function handleMatchAccept(id: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const me = await tx.presence.findUnique({ where: { id } });
    if (!me || me.status !== PRESENCE_STATUS.pending_accept || !me.matchPartnerId) {
      return false;
    }
    await tx.presence.update({
      where: { id },
      data: { matchAccepted: true },
    });
    const partner = await tx.presence.findUnique({
      where: { id: me.matchPartnerId },
    });
    if (!partner || partner.status !== PRESENCE_STATUS.pending_accept) return true;

    if (partner.matchAccepted) {
      const u = await tx.presence.updateMany({
        where: {
          id: { in: [id, me.matchPartnerId] },
          status: PRESENCE_STATUS.pending_accept,
        },
        data: {
          status: PRESENCE_STATUS.busy,
          matchId: null,
          matchPartnerId: null,
          matchExpiresAt: null,
          matchAccepted: false,
        },
      });
      if (u.count !== 2) return false;
      await tx.presence.update({ where: { id }, data: { peerId: me.matchPartnerId } });
      await tx.presence.update({
        where: { id: me.matchPartnerId },
        data: { peerId: id },
      });
      return true;
    }
    return true;
  });
}

export async function handleMatchDecline(id: string): Promise<void> {
  const me = await prisma.presence.findUnique({ where: { id } });
  if (!me || me.status !== PRESENCE_STATUS.pending_accept) return;
  const partnerId = me.matchPartnerId;

  await prisma.presence.update({
    where: { id },
    data: clearMatchFields(PRESENCE_STATUS.available),
  });

  if (partnerId) {
    await prisma.presence.updateMany({
      where: { id: partnerId, status: PRESENCE_STATUS.pending_accept },
      data: {
        status: PRESENCE_STATUS.searching,
        matchId: null,
        matchPartnerId: null,
        matchExpiresAt: null,
        matchAccepted: false,
      },
    });
  }
}

export async function handleMatchCancel(id: string): Promise<void> {
  const me = await prisma.presence.findUnique({ where: { id } });
  if (!me) return;
  const partnerId = me.matchPartnerId;

  if (me.status === PRESENCE_STATUS.searching) {
    await prisma.presence.update({
      where: { id },
      data: clearMatchFields(PRESENCE_STATUS.available),
    });
    return;
  }

  if (me.status === PRESENCE_STATUS.pending_accept) {
    await prisma.presence.update({
      where: { id },
      data: clearMatchFields(PRESENCE_STATUS.available),
    });
    if (partnerId) {
      await prisma.presence.updateMany({
        where: { id: partnerId },
        data: {
          status: PRESENCE_STATUS.searching,
          matchId: null,
          matchPartnerId: null,
          matchExpiresAt: null,
          matchAccepted: false,
        },
      });
    }
  }
}

function clearMatchFields(status: typeof PRESENCE_STATUS.available) {
  return {
    status,
    matchLanguage: null,
    matchGenderPref: null,
    matchMode: null,
    matchId: null,
    matchPartnerId: null,
    matchExpiresAt: null,
    matchAccepted: false,
  };
}

export async function joinMatchQueue(
  id: string,
  genderPref: GenderPref,
  opts?: {
    spokenLanguages?: string[];
    gender?: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const now = new Date();
  let row = await prisma.presence.findUnique({ where: { id } });
  if (!row) {
    return { ok: false, error: "not available" };
  }

  if (opts?.spokenLanguages !== undefined) {
    await prisma.presence.update({
      where: { id },
      data: {
        spokenLanguages: serializeLanguageList(opts.spokenLanguages),
        ...(opts.gender !== undefined
          ? {
              gender:
                opts.gender && isGenderValue(opts.gender) ? opts.gender : null,
            }
          : {}),
      },
    });
    row = await prisma.presence.findUnique({ where: { id } });
    if (!row) return { ok: false, error: "not available" };
  }

  if (row.status === PRESENCE_STATUS.pending_accept) {
    return { ok: false, error: "pending match" };
  }

  if (
    row.status === PRESENCE_STATUS.busy ||
    row.status === PRESENCE_STATUS.on_call
  ) {
    return { ok: false, error: "in a connection" };
  }

  if (row.matchCooldownUntil && row.matchCooldownUntil > now) {
    return { ok: false, error: "cooldown" };
  }

  if (!hasSpokenLanguages(row.spokenLanguages)) {
    return { ok: false, error: "spoken languages required" };
  }

  const queueData = {
    status: PRESENCE_STATUS.searching,
    matchLanguage: null,
    matchGenderPref: genderPref,
    matchMode: null,
    matchId: null,
    matchPartnerId: null,
    matchExpiresAt: null,
    matchAccepted: false,
  };

  if (row.status === PRESENCE_STATUS.searching) {
    await prisma.presence.update({ where: { id }, data: queueData });
    return { ok: true };
  }

  if (row.status !== PRESENCE_STATUS.available) {
    return { ok: false, error: "not available" };
  }

  await prisma.presence.update({ where: { id }, data: queueData });

  return { ok: true };
}