"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import type { GenderPref } from "@/lib/match";
import {
  connectWithDisplayLabel,
  genderDisplayLabel,
  hasPublicPreferences,
  spokenLanguageLabels,
} from "@/lib/preference-labels";
import type { PeerDot, SessionPreferences } from "@/lib/types";
import { greatCircleCoordinates } from "@/lib/geo-arc";
import { setConnectionGlobeMode } from "@/lib/mapbox-route-layers";
import { PULSE_GLOBE_THEME } from "@/lib/pulse-globe-theme";
import {
  canReceiveRequest,
  PRESENCE_LABEL,
  presenceMarkerClass,
  presenceSwatchClass,
} from "@/lib/presence-state";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "pk.eyJ1IjoicHVsc2UtbWFwIiwiYSI6ImNrMDBkZW1vMDAwMDAwMDAifQ.AAAAAAAAAAAAAAAAAAAAAA";

const ARC_STEPS = 48;
const COMET_CYCLE_MS = 3600;
const ARC = "#4cd7f6";

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function PreferencesDetails({
  spokenLanguages,
  gender,
  matchGenderPref,
}: {
  spokenLanguages: string[];
  gender: SessionPreferences["gender"];
  matchGenderPref: GenderPref | null;
}) {
  if (
    !hasPublicPreferences({
      spokenLanguages,
      gender,
      matchGenderPref,
    })
  ) {
    return null;
  }

  const langs = spokenLanguageLabels(spokenLanguages);
  const genderLabel = genderDisplayLabel(gender);
  const connectLabel = connectWithDisplayLabel(matchGenderPref);

  return (
    <dl className="mt-3 space-y-2 border-t border-outline-variant/40 pt-3 text-xs">
      {langs.length > 0 && (
        <div>
          <dt className="font-sans font-medium tracking-wide text-outline">
            Speaks
          </dt>
          <dd className="mt-0.5 text-on-surface">{langs.join(", ")}</dd>
        </div>
      )}
      {genderLabel && (
        <div>
          <dt className="font-sans font-medium tracking-wide text-outline">
            Gender
          </dt>
          <dd className="mt-0.5 text-on-surface">{genderLabel}</dd>
        </div>
      )}
      {connectLabel && (
        <div>
          <dt className="font-sans font-medium tracking-wide text-outline">
            Connect with
          </dt>
          <dd className="mt-0.5 text-on-surface">{connectLabel}</dd>
        </div>
      )}
    </dl>
  );
}

export default function WorldMap({
  peers,
  me,
  myPreferences,
  onPeerConnect,
  canConnect,
  focusPeerId = null,
  activePeerId = null,
  linkPeerId = null,
}: {
  peers: PeerDot[];
  me: { lat: number; lng: number } | null;
  myPreferences: SessionPreferences;
  onPeerConnect: (id: string) => void;
  canConnect: boolean;
  /** Fly map to this peer once (e.g. after random match). */
  focusPeerId?: string | null;
  /** Current chat partner — card shows match copy, not "Busy" / Request. */
  activePeerId?: string | null;
  /** Draw a great-circle-style link from you to this peer (match / chat). */
  linkPeerId?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const meMarkerRef = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<PeerDot | null>(null);
  const [selectedMe, setSelectedMe] = useState(false);

  const onPeerConnectRef = useRef(onPeerConnect);
  const canConnectRef = useRef(canConnect);
  const selectPeerRef = useRef<(peer: PeerDot) => void>(() => {});
  const lastFocusedPeerRef = useRef<string | null>(null);
  const hadActiveLinkRef = useRef(false);
  const linkCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    onPeerConnectRef.current = onPeerConnect;
    canConnectRef.current = canConnect;
  });

  useEffect(() => {
    if (!focusPeerId) {
      lastFocusedPeerRef.current = null;
      return;
    }
    const map = mapRef.current;
    if (!map || !ready || !me || focusPeerId === lastFocusedPeerRef.current) {
      return;
    }
    const peer = peers.find((p) => p.id === focusPeerId);
    if (!peer) return;

    lastFocusedPeerRef.current = focusPeerId;
    setSelected(null);

    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend([me.lng, me.lat]);
    bounds.extend([peer.lng, peer.lat]);
    map.fitBounds(bounds, {
      padding: { top: 100, bottom: 80, left: 60, right: 60 },
      maxZoom: 9,
      duration: 1400,
      essential: true,
    });
  }, [focusPeerId, peers, me, ready]);

  useEffect(() => {
    selectPeerRef.current = (peer: PeerDot) => {
      setSelectedMe(false);
      setSelected((prev) => (prev?.id === peer.id ? null : peer));
    };
  });

  // Drop selection if that peer went offline.
  useEffect(() => {
    if (!selected) return;
    const stillHere = peers.some((p) => p.id === selected.id);
    if (!stillHere) setSelected(null);
    else {
      const fresh = peers.find((p) => p.id === selected.id);
      if (fresh && fresh.status !== selected.status) setSelected(fresh);
    }
  }, [peers, selected]);

  useEffect(() => {
    if (!TOKEN || !containerRef.current) return;
    let cancelled = false;
    const markers = markersRef.current;

    (async () => {
      if (cancelled || !containerRef.current) return;
      mapboxgl.accessToken = TOKEN;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/dark-v11",
        center: me ? [me.lng, me.lat] : [0, 20],
        zoom: me ? 4 : 1.4,
        maxPitch: 85,
        attributionControl: true,
      });
      map.on("load", () => {
        if (cancelled) return;
        setConnectionGlobeMode(map, false, PULSE_GLOBE_THEME);
        setReady(true);
      });
      map.on("click", () => {
        setSelected(null);
        setSelectedMe(false);
      });
      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      markers.forEach((m) => m.remove());
      markers.clear();
      meMarkerRef.current?.remove();
      meMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !me) return;
    let cancelled = false;

    (async () => {
      if (cancelled) return;
      if (!meMarkerRef.current) {
        const el = document.createElement("div");
        el.className = "pulse-me cursor-pointer";
        el.title = "Your location — tap for your preferences";
        el.innerHTML = `<span class="pulse-me-label">You</span><span class="pulse-me-dot"></span>`;
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          setSelected(null);
          setSelectedMe((on) => !on);
        });
        meMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([me.lng, me.lat])
          .addTo(map);
      } else {
        meMarkerRef.current.setLngLat([me.lng, me.lat]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [me, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const markers = markersRef.current;
    const seen = new Set<string>();

    for (const peer of peers) {
      seen.add(peer.id);
      let marker = markers.get(peer.id);
      const root = marker?.getElement();
      const button = root?.querySelector("button.pulse-dot") as
        | HTMLButtonElement
        | null
        | undefined;

      if (!marker) {
        const anchor = document.createElement("div");
        anchor.className = "pulse-dot-anchor";
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = presenceMarkerClass(peer.status);
        dot.title = PRESENCE_LABEL[peer.status];
        dot.dataset.peerId = peer.id;
        dot.addEventListener("click", (e) => {
          e.stopPropagation();
          selectPeerRef.current(peer);
        });
        anchor.appendChild(dot);
        marker = new mapboxgl.Marker({ element: anchor, anchor: "center" })
          .setLngLat([peer.lng, peer.lat])
          .addTo(map);
        markers.set(peer.id, marker);
      } else if (button) {
        button.className = presenceMarkerClass(peer.status);
        button.title = PRESENCE_LABEL[peer.status];
      }

      const pos = marker.getLngLat();
      if (pos.lng !== peer.lng || pos.lat !== peer.lat) {
        marker.setLngLat([peer.lng, peer.lat]);
      }
    }

    for (const [id, marker] of markers) {
      if (!seen.has(id)) {
        marker.remove();
        markers.delete(id);
      }
    }
  }, [peers, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const linked = Boolean(linkPeerId);
    setConnectionGlobeMode(map, linked, PULSE_GLOBE_THEME);
    if (linked) {
      hadActiveLinkRef.current = true;
      map.easeTo({ pitch: 28, duration: 900 });
      return;
    }
    if (hadActiveLinkRef.current) {
      hadActiveLinkRef.current = false;
      lastFocusedPeerRef.current = null;
      if (me) {
        map.easeTo({
          center: [me.lng, me.lat],
          zoom: 4,
          pitch: 0,
          bearing: 0,
          duration: 900,
        });
      } else {
        map.easeTo({ pitch: 0, bearing: 0, duration: 700 });
      }
    }
  }, [linkPeerId, ready, me]);

  useEffect(() => {
    const map = mapRef.current;
    const canvas = linkCanvasRef.current;
    const host = containerRef.current;
    if (!map || !canvas || !host || !ready) return;

    const peer = linkPeerId
      ? peers.find((p) => p.id === linkPeerId)
      : undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx || !me || !peer) {
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const from = me;
    const to = peer;
    let frame = 0;

    const paint = () => {
      const now = performance.now();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const geo = greatCircleCoordinates(from, to, ARC_STEPS);
      const flat = geo.map(([lng, lat]) => map.project([lng, lat]));
      const chord = Math.hypot(
        flat[flat.length - 1].x - flat[0].x,
        flat[flat.length - 1].y - flat[0].y,
      );
      const lift = Math.min(170, 22 + chord * 0.28);
      const pts = flat.map((p, i) => {
        const u = i / ARC_STEPS;
        return {
          x: p.x,
          y: p.y - Math.sin(Math.PI * u) * lift,
        };
      });

      ctx.lineCap = "round";
      ctx.strokeStyle = ARC;
      ctx.lineWidth = 1.4;
      for (let k = 0; k < ARC_STEPS; k++) {
        ctx.globalAlpha = 0.42;
        ctx.beginPath();
        ctx.moveTo(pts[k].x, pts[k].y);
        ctx.lineTo(pts[k + 1].x, pts[k + 1].y);
        ctx.stroke();
      }

      const phase = (now % COMET_CYCLE_MS) / COMET_CYCLE_MS;
      const run = Math.min(1, phase / 0.7);
      const head = Math.floor(run * ARC_STEPS);
      for (let k = Math.max(0, head - 10); k < head; k++) {
        ctx.globalAlpha = (1 - (head - k) / 10) * 0.95;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(pts[k].x, pts[k].y);
        ctx.lineTo(pts[k + 1].x, pts[k + 1].y);
        ctx.stroke();
      }

      const end = pts[ARC_STEPS];
      const start = pts[0];
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#4edea3";
      ctx.beginPath();
      ctx.arc(end.x, end.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
      if (phase > 0.7) {
        const k = (phase - 0.7) / 0.3;
        ctx.globalAlpha = 1 - k;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(end.x, end.y, 3 + k * 16, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.45 + 0.45 * Math.sin(now / 280);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(start.x, start.y, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    const loop = () => {
      paint();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [me, peers, linkPeerId, ready]);

  const selectedAvailable =
    selected && canReceiveRequest(selected.status) && canConnect;
  const isActiveMatch =
    selected && activePeerId !== null && selected.id === activePeerId;

  return (
    <div className="absolute inset-x-0 bottom-0 top-16">
      <div ref={containerRef} className="h-full w-full bg-surface" />
      <canvas
        ref={linkCanvasRef}
        className="pointer-events-none absolute inset-0 z-[5] h-full w-full"
        aria-hidden
      />

      {!TOKEN && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <p className="max-w-md rounded-xl bg-surface-container p-4 text-sm text-on-surface">
            Set{" "}
            <code className="text-primary">NEXT_PUBLIC_MAPBOX_TOKEN</code> in{" "}
            <code>.env</code> to load the map.
          </p>
        </div>
      )}

      {selected && (
        <div className="absolute left-1/2 top-4 z-30 w-full max-w-sm -translate-x-1/2 px-4">
          <div className="rounded-xl bg-surface-container/95 p-4 text-on-surface shadow-[0_16px_40px_rgba(0,0,0,0.8)] backdrop-blur-xl">
            {isActiveMatch ? (
              <>
                <p className="font-sans text-[11px] font-medium uppercase tracking-wider text-outline">
                  Your match
                </p>
                <p className="mt-2 flex items-center gap-2 text-sm text-primary">
                  <span
                    className="inline-block size-2.5 rounded-full bg-primary shadow-[0_0_8px_#4edea3]"
                    aria-hidden
                  />
                  <span>In this chat</span>
                </p>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="mt-4 w-full rounded-lg bg-surface-container-high px-3 py-2 font-sans text-sm text-on-surface-variant transition hover:text-on-surface"
                >
                  Close
                </button>
              </>
            ) : (
              <>
                <p className="font-sans text-[11px] font-medium uppercase tracking-wider text-outline">
                  Stranger
                </p>
                <p className="mt-1 font-mono text-sm tracking-wide text-on-surface">
                  {shortId(selected.id)}
                </p>
                <p className="mt-2 flex items-start gap-2 text-sm leading-snug text-on-surface-variant">
                  <span
                    className={`mt-1 inline-block size-2.5 shrink-0 rounded-full ${presenceSwatchClass(selected.status)}`}
                    aria-hidden
                  />
                  <span>{PRESENCE_LABEL[selected.status]}</span>
                </p>
                <PreferencesDetails
                  spokenLanguages={selected.spokenLanguages}
                  gender={selected.gender}
                  matchGenderPref={selected.matchGenderPref}
                />
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="flex-1 rounded-lg bg-surface-container-high px-3 py-2 font-sans text-sm text-on-surface-variant transition hover:text-on-surface"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    disabled={!selectedAvailable}
                    title={
                      !canReceiveRequest(selected.status)
                        ? PRESENCE_LABEL[selected.status]
                        : !canConnect
                          ? "You are already in a connection"
                          : undefined
                    }
                    onClick={() => {
                      if (!selectedAvailable) return;
                      onPeerConnect(selected.id);
                      setSelected(null);
                    }}
                    className="flex-1 rounded-lg bg-primary-container px-3 py-2 font-sans text-sm font-medium text-on-primary shadow-[0_0_12px_rgba(16,185,129,0.3)] transition hover:bg-primary disabled:cursor-not-allowed disabled:bg-surface-container-highest disabled:text-outline disabled:shadow-none"
                  >
                    Request
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {selectedMe && (
        <div className="absolute left-1/2 top-4 z-30 w-full max-w-sm -translate-x-1/2 px-4">
          <div className="rounded-xl bg-surface-container/95 p-4 text-on-surface shadow-[0_16px_40px_rgba(0,0,0,0.8)] backdrop-blur-xl">
            <p className="font-sans text-[11px] font-medium uppercase tracking-wider text-outline">
              You
            </p>
            <p className="mt-1 text-sm text-on-surface-variant">
              Your saved preferences for this session
            </p>
            <PreferencesDetails
              spokenLanguages={myPreferences.spokenLanguages}
              gender={myPreferences.gender}
              matchGenderPref={null}
            />
            {myPreferences.spokenLanguages.length === 0 &&
              !genderDisplayLabel(myPreferences.gender) && (
                <p className="mt-3 text-xs text-on-surface-variant">
                  Nothing saved yet. Open <strong className="font-medium text-on-surface">Random</strong> to set languages and gender.
                </p>
              )}
            <button
              type="button"
              onClick={() => setSelectedMe(false)}
              className="mt-4 w-full rounded-lg bg-surface-container-high px-3 py-2 font-sans text-sm text-on-surface-variant transition hover:text-on-surface"
            >
              Close
            </button>
          </div>
        </div>
      )}

    </div>
  );
}