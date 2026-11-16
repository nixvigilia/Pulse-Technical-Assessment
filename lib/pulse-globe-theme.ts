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

/** Dark cyan “route globe” palette aligned with Pulse. */
export const PULSE_GLOBE_THEME: PulseGlobeTheme = {
  arc: "#06b6d4",
  arcCore: "#67e8f9",
  comet: "#f0fdfa",
  cometTrail: "#22d3ee",
  endpoint: "#a5f3fc",
  globeDot: "rgba(148, 163, 184, 0.28)",
  fog: {
    color: "rgb(9, 9, 12)",
    "high-color": "#155e75",
    "horizon-blend": 0.05,
    "space-color": "#000000",
    "star-intensity": 0.65,
  },
};