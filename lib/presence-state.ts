// Authoritative presence values stored on Presence.status (also returned on the map).

export const PRESENCE_STATUS = {
  available: "available",
  busy: "busy",
  on_call: "on_call",
  searching: "searching",
  pending_accept: "pending_accept",
} as const;

export type PresenceStatus =
  (typeof PRESENCE_STATUS)[keyof typeof PRESENCE_STATUS];

export const PRESENCE_LABEL: Record<PresenceStatus, string> = {
  available: "Available",
  busy: "Busy",
  on_call: "On a call",
  searching: "Unavailable",
  pending_accept: "Unavailable",
};

export function isValidPresenceStatus(value: unknown): value is PresenceStatus {
  return (
    value === PRESENCE_STATUS.available ||
    value === PRESENCE_STATUS.busy ||
    value === PRESENCE_STATUS.on_call ||
    value === PRESENCE_STATUS.searching ||
    value === PRESENCE_STATUS.pending_accept
  );
}

/** Only available peers can receive a new connection request. */
export function canReceiveRequest(status: PresenceStatus): boolean {
  return status === PRESENCE_STATUS.available;
}

/** Map marker / preview styling key. */
export function presenceSwatchClass(status: PresenceStatus): string {
  switch (status) {
    case PRESENCE_STATUS.available:
      return "bg-emerald-400 pulse-status-swatch--available";
    case PRESENCE_STATUS.busy:
    case PRESENCE_STATUS.searching:
    case PRESENCE_STATUS.pending_accept:
      return "bg-amber-400";
    case PRESENCE_STATUS.on_call:
      return "bg-sky-400 pulse-status-swatch--on-call";
  }
}

export function presenceMarkerClass(status: PresenceStatus): string {
  switch (status) {
    case PRESENCE_STATUS.available:
      return "pulse-dot pulse-dot--available";
    case PRESENCE_STATUS.busy:
    case PRESENCE_STATUS.searching:
    case PRESENCE_STATUS.pending_accept:
      return "pulse-dot pulse-dot--busy";
    case PRESENCE_STATUS.on_call:
      return "pulse-dot pulse-dot--on-call";
  }
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