// Shared types across client + API.

import type { PresenceStatus } from "@/lib/presence-state";

// Signal mailbox message types.
export type SignalType =
  | "request" // connection request (tap a dot)
  | "accept" // recipient accepted
  | "decline" // recipient declined (or auto-declined while unavailable)
  | "offer" // WebRTC SDP offer
  | "answer" // WebRTC SDP answer
  | "ice" // WebRTC ICE candidate
  | "call-start" // video connected — both go on_call
  | "call-end" // video ended — both return to busy (chat continues)
  | "end"; // hang up / leave the connection

export interface PeerDot {
  id: string;
  lat: number;
  lng: number;
  status: PresenceStatus;
}

export interface SignalMsg {
  id: string;
  fromId: string;
  toId: string;
  type: SignalType;
  payload: string | null;
  createdAt: string;
}

export interface ActivityCounts {
  online: number;
  available: number;
  accepting: number;
}

export type MatchPhase = "idle" | "searching" | "pending" | "ready";

export interface MatchSnapshot {
  phase: MatchPhase;
  language: string | null;
  mode: "text" | "text_video" | null;
  youAccepted: boolean;
  acceptedCount: number;
  expiresAt: string | null;
  peerId: string | null;
  expired?: boolean;
}

export interface SessionPreferences {
  spokenLanguages: string[];
  preferredLanguage: string | null;
  gender: "man" | "woman" | "unspecified" | null;
}

export interface PollResponse {
  peers: PeerDot[];
  signals: SignalMsg[];
  activity: ActivityCounts;
  match: MatchSnapshot;
  preferences: SessionPreferences;
}