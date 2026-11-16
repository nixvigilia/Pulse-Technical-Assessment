import { PRESENCE_STATUS, type PresenceStatus } from "@/lib/presence-state";

export interface ActivityCounts {
  online: number;
  available: number;
}

/** Everyone online who is not in an active chat or video call. */
function countsAsAvailable(status: PresenceStatus): boolean {
  return (
    status !== PRESENCE_STATUS.busy &&
    status !== PRESENCE_STATUS.on_call
  );
}

export function computeActivityCounts(
  statuses: PresenceStatus[],
): ActivityCounts {
  let online = 0;
  let available = 0;
  for (const status of statuses) {
    online += 1;
    if (countsAsAvailable(status)) available += 1;
  }
  return { online, available };
}