"use client";

import { useEffect, useRef, useState } from "react";
import EntryGate from "./components/EntryGate";
import WorldMap from "./components/WorldMap";
import ActivityBar from "./components/ActivityBar";
import RandomConnect from "./components/RandomConnect";
import ConnectionPrompt from "./components/ConnectionPrompt";
import ChatPanel, { type ChatMessage } from "./components/ChatPanel";
import VideoPanel from "./components/VideoPanel";
import { join, leave, matchAction, poll, savePreferences, sendSignal } from "@/lib/api";
import { generateSessionSecret } from "@/lib/generate-session-secret";
import {
  forgetLiveSession,
  leaveOrphanedLiveSessionFromStorage,
  rememberLiveSession,
} from "@/lib/session-lifecycle";
import { PeerSession, type DescType, type PeerControl } from "@/lib/webrtc";
import { POLL_INTERVAL_MS } from "@/lib/presence";
import {
  type ActivityCounts,
  type MatchSnapshot,
  type PeerDot,
  type SessionPreferences,
  type SignalMsg,
} from "@/lib/types";

type Conn =
  | { kind: "idle" }
  | { kind: "requesting"; peerId: string }
  | { kind: "incoming"; peerId: string }
  | { kind: "connecting"; peerId: string }
  | { kind: "connected"; peerId: string };

type VideoState = "none" | "requesting" | "incoming" | "active";

const REQUEST_TIMEOUT_MS = 30_000;

const IDLE_MATCH: MatchSnapshot = {
  phase: "idle",
  language: null,
  mode: null,
  youAccepted: false,
  acceptedCount: 0,
  expiresAt: null,
  peerId: null,
};

const DEFAULT_ACTIVITY: ActivityCounts = {
  online: 0,
  available: 0,
  accepting: 0,
};

export default function Home() {
  const [phase, setPhase] = useState<"gate" | "live">("gate");
  const [sessionId] = useState(() => crypto.randomUUID());
  const [sessionSecret] = useState(() => generateSessionSecret());
  const [peers, setPeers] = useState<PeerDot[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [activity, setActivity] = useState<ActivityCounts>(DEFAULT_ACTIVITY);
  const [match, setMatch] = useState<MatchSnapshot>(IDLE_MATCH);
  const [preferences, setPreferences] = useState<SessionPreferences>({
    spokenLanguages: [],
    preferredLanguage: null,
    gender: null,
  });
  const [randomOpen, setRandomOpen] = useState(false);
  const [mapFocusPeerId, setMapFocusPeerId] = useState<string | null>(null);
  const [matchBusy, setMatchBusy] = useState(false);
  const prevMatchPhase = useRef<MatchSnapshot["phase"]>("idle");
  const matchPhaseRef = useRef<MatchSnapshot["phase"]>("idle");
  const [conn, _setConn] = useState<Conn>({ kind: "idle" });
  const connRef = useRef<Conn>(conn);
  const setConn = (c: Conn) => {
    connRef.current = c;
    _setConn(c);
  };

  const [video, _setVideo] = useState<VideoState>("none");
  const videoRef = useRef<VideoState>(video);
  const setVideo = (v: VideoState) => {
    videoRef.current = v;
    _setVideo(v);
  };

  const peerRef = useRef<PeerSession | null>(null);
  const msgId = useRef(0);
  const requestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerMissingPolls = useRef(0);

  const liveSessionRef = useRef({
    id: sessionId,
    secret: sessionSecret,
    phase: "gate" as "gate" | "live",
  });
  const connStateRef = useRef(conn);

  useEffect(() => {
    liveSessionRef.current = {
      id: sessionId,
      secret: sessionSecret,
      phase,
    };
    connStateRef.current = conn;
  }, [sessionId, sessionSecret, phase, conn]);

  useEffect(() => {
    leaveOrphanedLiveSessionFromStorage();
  }, []);

  function showNotice(text: string) {
    setNotice(text);
    window.setTimeout(() => setNotice(null), 3500);
  }

  function addMessage(mine: boolean, text: string) {
    setMessages((prev) => [...prev, { id: msgId.current++, mine, text }]);
  }

  function teardown(message?: string) {
    if (requestTimer.current) clearTimeout(requestTimer.current);
    peerRef.current?.close();
    peerRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setVideo("none");
    setMessages([]);
    setConn({ kind: "idle" });
    setMapFocusPeerId(null);
    if (message) showNotice(message);
  }

  function activePeerId(): string | null {
    const c = connRef.current;
    if (c.kind === "connecting" || c.kind === "connected") return c.peerId;
    return null;
  }

  function notifyVideoActive() {
    const peerId = activePeerId();
    if (peerId) {
      void sendSignal(sessionId, sessionSecret, peerId, "call-start");
    }
  }

  function notifyVideoEnded() {
    const peerId = activePeerId();
    if (peerId) {
      void sendSignal(sessionId, sessionSecret, peerId, "call-end");
    }
  }

  function startPeer(peerId: string, initiator: boolean) {
    const ps = new PeerSession(initiator, {
      onSignal: (type: DescType, payload: string) => {
        void sendSignal(sessionId, sessionSecret, peerId, type, payload);
      },
      onChat: (text) => addMessage(false, text),
      onControl: (ctrl) => handleControl(ctrl),
      onRemoteStream: (stream) => setRemoteStream(stream),
      onConnectionState: (state) => {
        if (
          state === "failed" ||
          state === "disconnected" ||
          state === "closed"
        ) {
          const c = connRef.current;
          if (c.kind === "connecting" || c.kind === "connected") {
            void sendSignal(sessionId, sessionSecret, c.peerId, "end");
          }
          teardown(
            state === "failed"
              ? "Connection failed (network)."
              : "Stranger disconnected.",
          );
        }
      },
      onChannelOpen: () => {
        setConn({ kind: "connected", peerId });
      },
    });
    peerRef.current = ps;
  }

  function handleControl(ctrl: PeerControl) {
    const ps = peerRef.current;
    switch (ctrl) {
      case "video-request":
        if (videoRef.current === "none") setVideo("incoming");
        break;
      case "video-accept":
        if (videoRef.current === "requesting" && ps) {
          ps.startVideo()
            .then((stream) => {
              setLocalStream(stream);
              setVideo("active");
              notifyVideoActive();
            })
            .catch(() => {
              setVideo("none");
              ps.sendControl("video-end");
              showNotice("Camera unavailable.");
            });
        }
        break;
      case "video-decline":
        if (videoRef.current === "requesting") {
          setVideo("none");
          showNotice("Video declined.");
        }
        break;
      case "video-end":
        ps?.stopVideo();
        setLocalStream(null);
        setRemoteStream(null);
        setVideo("none");
        notifyVideoEnded();
        break;
    }
  }

  function requestConnection(peerId: string) {
    if (connRef.current.kind !== "idle") return;
    if (matchPhaseRef.current !== "idle") return;
    setConn({ kind: "requesting", peerId });
    void sendSignal(sessionId, sessionSecret, peerId, "request");
    requestTimer.current = setTimeout(() => {
      if (
        connRef.current.kind === "requesting" &&
        connRef.current.peerId === peerId
      ) {
        void sendSignal(sessionId, sessionSecret, peerId, "end");
        teardown("No answer.");
      }
    }, REQUEST_TIMEOUT_MS);
  }

  function cancelRequest() {
    if (connRef.current.kind === "requesting") {
      void sendSignal(sessionId, sessionSecret, connRef.current.peerId, "end");
    }
    teardown();
  }

  function acceptIncoming() {
    if (connRef.current.kind !== "incoming") return;
    const peerId = connRef.current.peerId;
    startPeer(peerId, false);
    void sendSignal(sessionId, sessionSecret, peerId, "accept");
    setConn({ kind: "connecting", peerId });
  }

  function declineIncoming() {
    if (connRef.current.kind !== "incoming") return;
    void sendSignal(sessionId, sessionSecret, connRef.current.peerId, "decline");
    setConn({ kind: "idle" });
  }

  function endConnection() {
    const c = connRef.current;
    if (c.kind === "connecting" || c.kind === "connected") {
      void sendSignal(sessionId, sessionSecret, c.peerId, "end");
    }
    teardown();
  }

  function startVideoRequest() {
    if (videoRef.current !== "none" || !peerRef.current) return;
    setVideo("requesting");
    peerRef.current.sendControl("video-request");
  }

  function acceptVideo() {
    const ps = peerRef.current;
    if (!ps) return;
    ps.startVideo()
      .then((stream) => {
        setLocalStream(stream);
        ps.sendControl("video-accept");
        setVideo("active");
        notifyVideoActive();
      })
      .catch(() => {
        ps.sendControl("video-decline");
        setVideo("none");
        showNotice("Camera unavailable.");
      });
  }

  function declineVideo() {
    peerRef.current?.sendControl("video-decline");
    setVideo("none");
  }

  function endVideo() {
    const ps = peerRef.current;
    ps?.stopVideo();
    ps?.sendControl("video-end");
    notifyVideoEnded();
    setLocalStream(null);
    setRemoteStream(null);
    setVideo("none");
  }

  function processSignal(sig: SignalMsg) {
    switch (sig.type) {
      case "request": {
        if (connRef.current.kind === "idle") {
          setConn({ kind: "incoming", peerId: sig.fromId });
        } else {
          void sendSignal(sessionId, sessionSecret, sig.fromId, "decline");
        }
        break;
      }
      case "accept": {
        const c = connRef.current;
        if (c.kind === "requesting" && c.peerId === sig.fromId) {
          if (requestTimer.current) clearTimeout(requestTimer.current);
          startPeer(sig.fromId, true);
          setConn({ kind: "connecting", peerId: sig.fromId });
        }
        break;
      }
      case "decline": {
        const c = connRef.current;
        if (c.kind === "requesting" && c.peerId === sig.fromId) {
          if (requestTimer.current) clearTimeout(requestTimer.current);
          teardown("Request declined.");
        }
        break;
      }
      case "offer":
      case "answer":
      case "ice": {
        const c = connRef.current;
        const peerId =
          c.kind === "connecting" || c.kind === "connected" ? c.peerId : null;
        if (peerRef.current && peerId === sig.fromId) {
          void peerRef.current.handleSignal(
            sig.type as DescType,
            sig.payload ?? "",
          );
        }
        break;
      }
      case "end": {
        const c = connRef.current;
        if (
          (c.kind === "incoming" ||
            c.kind === "connecting" ||
            c.kind === "connected") &&
          c.peerId === sig.fromId
        ) {
          if (c.kind === "incoming") setConn({ kind: "idle" });
          else teardown("Stranger disconnected.");
        }
        break;
      }
    }
  }

  const processSignalRef = useRef(processSignal);
  useEffect(() => {
    processSignalRef.current = processSignal;
  });

  useEffect(() => {
    if (phase !== "live" || !sessionId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const data = await poll(sessionId, sessionSecret);
        if (!active) return;
        setPeers(data.peers ?? []);
        setActivity(data.activity ?? DEFAULT_ACTIVITY);
        setPreferences(
          data.preferences ?? {
            spokenLanguages: [],
            preferredLanguage: null,
            gender: null,
          },
        );

        const prev = prevMatchPhase.current;
        const next = data.match ?? IDLE_MATCH;
        if (
          prev === "pending" &&
          next.phase === "searching" &&
          connRef.current.kind === "idle"
        ) {
          showNotice("Match expired.");
        }
        if (
          next.phase === "pending" &&
          next.peerId &&
          prev !== "pending"
        ) {
          setMapFocusPeerId(next.peerId);
        }
        prevMatchPhase.current = next.phase;
        matchPhaseRef.current = next.phase;
        setMatch(next);

        if (
          next.phase === "ready" &&
          next.peerId &&
          connRef.current.kind === "idle"
        ) {
          const peerId = next.peerId;
          const initiator = sessionId.localeCompare(peerId) < 0;
          startPeer(peerId, initiator);
          setConn({ kind: "connecting", peerId });
          setMapFocusPeerId(peerId);
          setRandomOpen(false);
        }

        const c = connRef.current;
        if (c.kind === "connecting" || c.kind === "connected") {
          const stillOnMap = data.peers.some((p) => p.id === c.peerId);
          if (!stillOnMap) {
            peerMissingPolls.current += 1;
            if (peerMissingPolls.current >= 2) {
              peerMissingPolls.current = 0;
              teardown("Stranger left.");
            }
          } else {
            peerMissingPolls.current = 0;
          }
        } else {
          peerMissingPolls.current = 0;
        }

        for (const s of data.signals) processSignalRef.current(s);
      } catch {}
      if (active) timer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [phase, sessionId, sessionSecret]);

  useEffect(() => {
    const onPageHide = () => {
      const { id, secret, phase: p } = liveSessionRef.current;
      if (p !== "live") return;
      const c = connStateRef.current;
      if (c.kind === "connecting" || c.kind === "connected") {
        void sendSignal(id, secret, c.peerId, "end");
      }
      leave(id, secret);
      forgetLiveSession();
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  async function handleReady(lat: number, lng: number) {
    setMyLocation({ lat, lng });
    await join(sessionId, sessionSecret, lat, lng);
    rememberLiveSession(sessionId, sessionSecret);
    setPhase("live");
  }

  if (phase === "gate") {
    return <EntryGate onReady={handleReady} />;
  }

  const inChat = conn.kind === "connecting" || conn.kind === "connected";
  const connectedPeerId =
    conn.kind === "connecting" || conn.kind === "connected" ? conn.peerId : null;
  const mapConnectIdle =
    conn.kind === "idle" && match.phase === "idle";
  const mapLinkPeerId =
    connectedPeerId ??
    (conn.kind === "requesting" || conn.kind === "incoming"
      ? conn.peerId
      : null) ??
    (match.phase === "pending" && match.peerId ? match.peerId : null);
  return (
    <main className="fixed inset-0 overflow-hidden">
      <ActivityBar activity={activity} />

      <button
        type="button"
        onClick={() => setRandomOpen(true)}
        className="absolute right-4 top-4 z-20 rounded-full bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 shadow-lg hover:bg-emerald-300"
      >
        Random
      </button>

      <WorldMap
        peers={peers}
        me={myLocation}
        onPeerConnect={requestConnection}
        canConnect={mapConnectIdle}
        focusPeerId={mapFocusPeerId}
        activePeerId={connectedPeerId}
        linkPeerId={mapLinkPeerId}
      />

      <RandomConnect
        open={randomOpen}
        onClose={() => setRandomOpen(false)}
        preferences={preferences}
        match={match}
        busy={matchBusy}
        onSavePreferences={async (prefs) => {
          setMatchBusy(true);
          try {
            await savePreferences(sessionId, sessionSecret, {
              spokenLanguages: prefs.spokenLanguages,
              preferredLanguage: prefs.preferredLanguage,
              gender: prefs.gender,
            });
            setPreferences(prefs);
          } finally {
            setMatchBusy(false);
          }
        }}
        onJoin={async (opts) => {
          setMatchBusy(true);
          try {
            await matchAction(sessionId, sessionSecret, "join", opts);
            setPreferences({
              spokenLanguages: opts.spokenLanguages,
              preferredLanguage: null,
              gender: opts.gender,
            });
          } catch (e) {
            showNotice(e instanceof Error ? e.message : "Could not join queue.");
          } finally {
            setMatchBusy(false);
          }
        }}
        onCancel={async () => {
          setMatchBusy(true);
          try {
            await matchAction(sessionId, sessionSecret, "cancel");
            showNotice("Search cancelled.");
          } finally {
            setMatchBusy(false);
          }
        }}
        onAccept={async () => {
          setMatchBusy(true);
          try {
            await matchAction(sessionId, sessionSecret, "accept");
            setMatch((m) =>
              m.phase === "pending" && !m.youAccepted
                ? {
                    ...m,
                    youAccepted: true,
                    acceptedCount: Math.min(2, m.acceptedCount + 1),
                  }
                : m,
            );
          } finally {
            setMatchBusy(false);
          }
        }}
        onDecline={async () => {
          setMatchBusy(true);
          try {
            await matchAction(sessionId, sessionSecret, "decline");
            showNotice("Match declined.");
          } finally {
            setMatchBusy(false);
          }
        }}
      />

      {notice && (
        <div className="absolute left-1/2 top-20 z-30 -translate-x-1/2 rounded-full bg-zinc-800/90 px-4 py-2 text-sm text-zinc-100 shadow-lg backdrop-blur">
          {notice}
        </div>
      )}

      {conn.kind === "requesting" && (
        <div className="absolute left-1/2 top-20 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full bg-zinc-800/90 px-4 py-2 text-sm text-zinc-100 shadow-lg backdrop-blur">
          <span>Requesting connection…</span>
          <button
            onClick={cancelRequest}
            className="rounded-full bg-zinc-700 px-3 py-1 text-xs hover:bg-zinc-600"
          >
            Cancel
          </button>
        </div>
      )}

      {conn.kind === "incoming" && (
        <ConnectionPrompt
          title="A stranger wants to connect"
          acceptLabel="Accept"
          declineLabel="Decline"
          onAccept={acceptIncoming}
          onDecline={declineIncoming}
        />
      )}

      {inChat && video !== "active" && (
        <ChatPanel
          messages={messages}
          connected={conn.kind === "connected"}
          videoBusy={video !== "none"}
          onSend={(text) => {
            peerRef.current?.sendChat(text);
            addMessage(true, text);
          }}
          onStartVideo={startVideoRequest}
          onEnd={endConnection}
        />
      )}

      {video === "requesting" && (
        <div className="absolute bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-full bg-zinc-800/90 px-4 py-2 text-sm text-zinc-100 shadow-lg backdrop-blur">
          Waiting for stranger to accept video…
        </div>
      )}

      {video === "incoming" && (
        <ConnectionPrompt
          title="Start video call?"
          subtitle="The stranger wants to turn on video."
          acceptLabel="Accept"
          declineLabel="Decline"
          onAccept={acceptVideo}
          onDecline={declineVideo}
        />
      )}

      {video === "active" && (
        <VideoPanel
          localStream={localStream}
          remoteStream={remoteStream}
          onEnd={endVideo}
        />
      )}
    </main>
  );
}
