import { PRESENCE_STATUS, type PresenceStatus } from "@/lib/presence-state";

export interface ActivityCounts {
  online: number;
  available: number;
  accepting: number;
}

export function computeActivityCounts(
  statuses: PresenceStatus[],
): ActivityCounts {
  let online = 0;
  let available = 0;
  let accepting = 0;
  for (const status of statuses) {
    online += 1;
    if (status === PRESENCE_STATUS.available) available += 1;
    if (status === PRESENCE_STATUS.pending_accept) accepting += 1;
  }
  return { online, available, accepting };
}