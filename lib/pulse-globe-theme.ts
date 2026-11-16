import type { FogSpecification } from "mapbox-gl";

export type PulseGlobeTheme = {
  arc: string;
  arcCore: string;
  comet: string;
  cometTrail: string;
  endpoint: string;
  globeDot: string;
  fog: FogSpecification;
};

/** Nocturnal emerald / cyan globe, aligned with the Pulse surface palette. */
export const PULSE_GLOBE_THEME: PulseGlobeTheme = {
  arc: "#4cd7f6",
  arcCore: "#acedff",
  comet: "#e0f2fe",
  cometTrail: "#4edea3",
  endpoint: "#4edea3",
  globeDot: "rgba(187, 202, 191, 0.28)",
  fog: {
    color: "rgb(16, 20, 25)",
    "high-color": "#0e3d32",
    "horizon-blend": 0.08,
    "space-color": "#0a0e13",
    "star-intensity": 0.55,
  },
};