"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import type { PeerDot } from "@/lib/types";
import {
  canReceiveRequest,
  PRESENCE_LABEL,
  presenceMarkerClass,
  presenceSwatchClass,
} from "@/lib/presence-state";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "pk.eyJ1IjoicHVsc2UtbWFwIiwiYSI6ImNrMDBkZW1vMDAwMDAwMDAifQ.AAAAAAAAAAAAAAAAAAAAAA";

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

export default function WorldMap({
  peers,
  me,
  onPeerConnect,
  canConnect,
}: {
  peers: PeerDot[];
  me: { lat: number; lng: number } | null;
  onPeerConnect: (id: string) => void;
  canConnect: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const meMarkerRef = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<PeerDot | null>(null);

  const onPeerConnectRef = useRef(onPeerConnect);
  const canConnectRef = useRef(canConnect);
  const selectPeerRef = useRef<(peer: PeerDot) => void>(() => {});

  useEffect(() => {
    onPeerConnectRef.current = onPeerConnect;
    canConnectRef.current = canConnect;
  });

  useEffect(() => {
    selectPeerRef.current = (peer: PeerDot) => {
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
        attributionControl: true,
      });
      map.on("load", () => {
        if (!cancelled) setReady(true);
      });
      map.on("click", () => setSelected(null));
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
        el.className = "pulse-me";
        el.title = "You are here";
        el.innerHTML = `<span class="pulse-me-label">Me</span>📍`;
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

  const selectedAvailable =
    selected && canReceiveRequest(selected.status) && canConnect;

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full bg-zinc-900" />

      {!TOKEN && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <p className="max-w-md rounded-lg bg-zinc-800 p-4 text-sm text-zinc-200">
            Set{" "}
            <code className="text-emerald-400">NEXT_PUBLIC_MAPBOX_TOKEN</code> in{" "}
            <code>.env</code> to load the map.
          </p>
        </div>
      )}

      {selected && (
        <div className="absolute left-1/2 top-20 z-30 w-full max-w-sm -translate-x-1/2 px-4">
          <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/95 p-4 text-zinc-100 shadow-xl backdrop-blur">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Stranger
            </p>
            <p className="mt-1 font-mono text-sm text-zinc-300">
              {shortId(selected.id)}
            </p>
            <p className="mt-2 flex items-start gap-2 text-sm leading-snug">
              <span
                className={`mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${presenceSwatchClass(selected.status)}`}
                aria-hidden
              />
              <span>{PRESENCE_LABEL[selected.status]}</span>
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="flex-1 rounded-full border border-zinc-600 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-500"
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
                className="flex-1 rounded-full bg-emerald-400 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-zinc-600 disabled:text-zinc-400"
              >
                Request
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="absolute bottom-4 left-4 rounded-full bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-300 backdrop-blur">
        {peers.length} online
      </div>
    </div>
  );
}