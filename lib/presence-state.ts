// Authoritative presence values stored on Presence.status (also returned on the map).

export const PRESENCE_STATUS = {
  available: "available",
  busy: "busy",
  on_call: "on_call",
} as const;

export type PresenceStatus =
  (typeof PRESENCE_STATUS)[keyof typeof PRESENCE_STATUS];

const UNAVAILABLE_LABEL =
  "Unavailable – Already in a conversation or video call.";

export const PRESENCE_LABEL: Record<PresenceStatus, string> = {
  available: "Available",
  busy: UNAVAILABLE_LABEL,
  on_call: UNAVAILABLE_LABEL,
};

export function isValidPresenceStatus(value: unknown): value is PresenceStatus {
  return (
    value === PRESENCE_STATUS.available ||
    value === PRESENCE_STATUS.busy ||
    value === PRESENCE_STATUS.on_call
  );
}

/** Only available peers can receive a new connection request. */
export function canReceiveRequest(status: PresenceStatus): boolean {
  return status === PRESENCE_STATUS.available;
}

/** Map marker / preview styling key. Chat and video both render as amber. */
export function presenceSwatchClass(status: PresenceStatus): string {
  return canReceiveRequest(status)
    ? "bg-emerald-400 pulse-status-swatch--available"
    : "bg-amber-400";
}

export function presenceMarkerClass(status: PresenceStatus): string {
  return canReceiveRequest(status)
    ? "pulse-dot pulse-dot--available"
    : "pulse-dot pulse-dot--unavailable";
}

/**
 * Whether both rows are eligible for a successful accept transition.
 */
export function canAcceptConnection(
  fromStatus: PresenceStatus,
  toStatus: PresenceStatus,
): boolean {
  return (
    fromStatus === PRESENCE_STATUS.available &&
    toStatus === PRESENCE_STATUS.available
  );
}

export function canStartCall(fromStatus: PresenceStatus, toStatus: PresenceStatus): boolean {
  return fromStatus === PRESENCE_STATUS.busy && toStatus === PRESENCE_STATUS.busy;
}

export function canEndCall(fromStatus: PresenceStatus, toStatus: PresenceStatus): boolean {
  return fromStatus === PRESENCE_STATUS.on_call && toStatus === PRESENCE_STATUS.on_call;
}