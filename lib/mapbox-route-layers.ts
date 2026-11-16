import type { GeoJSONSource, Map as MapboxMap } from "mapbox-gl";
import type { PulseGlobeTheme } from "@/lib/pulse-globe-theme";

const GLOBE_DOTS = "pulse-globe-dots";
const GLOBE_DOTS_SRC = "pulse-globe-dots-src";
const ROUTE_SRC = "pulse-route-src";
const ROUTE_GLOW = "pulse-route-glow";
const ROUTE_CORE = "pulse-route-core";
const ENDPOINTS_SRC = "pulse-route-endpoints-src";
const ENDPOINTS = "pulse-route-endpoints";
const COMET_A_SRC = "pulse-comet-a-src";
const COMET_B_SRC = "pulse-comet-b-src";
const COMET_A = "pulse-comet-a";
const COMET_B = "pulse-comet-b";

function globeDotGrid(stepDeg = 18): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (let lat = -78; lat <= 78; lat += stepDeg) {
    for (let lng = -180; lng < 180; lng += stepDeg) {
      features.push({
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: [lng, lat] },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

const emptyLine: GeoJSON.Feature = {
  type: "Feature",
  properties: {},
  geometry: { type: "LineString", coordinates: [] },
};

const emptyPoints: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

const offComet: GeoJSON.Feature = {
  type: "Feature",
  properties: {},
  geometry: { type: "Point", coordinates: [0, 0] },
};

export function installPulseGlobe(map: MapboxMap, theme: PulseGlobeTheme): void {
  if (!map.getSource(GLOBE_DOTS_SRC)) {
    map.addSource(GLOBE_DOTS_SRC, {
      type: "geojson",
      data: globeDotGrid(),
    });
    map.addLayer({
      id: GLOBE_DOTS,
      type: "circle",
      source: GLOBE_DOTS_SRC,
      minzoom: 0,
      maxzoom: 6,
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          0,
          1.1,
          4,
          1.8,
          6,
          0.6,
        ],
        "circle-color": theme.globeDot,
        "circle-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          0,
          0.55,
          5,
          0.15,
        ],
      },
    });
  }

  if (!map.getSource(ROUTE_SRC)) {
    map.addSource(ROUTE_SRC, { type: "geojson", data: emptyLine });
    map.addLayer({
      id: ROUTE_GLOW,
      type: "line",
      source: ROUTE_SRC,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": theme.arc,
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          0,
          4,
          3,
          7,
          8,
          12,
        ],
        "line-opacity": 0,
        "line-blur": 2,
      },
    });
    map.addLayer({
      id: ROUTE_CORE,
      type: "line",
      source: ROUTE_SRC,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": theme.arcCore,
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          0,
          1.8,
          3,
          2.8,
          8,
          4,
        ],
        "line-opacity": 0,
      },
    });
  }

  if (!map.getSource(ENDPOINTS_SRC)) {
    map.addSource(ENDPOINTS_SRC, { type: "geojson", data: emptyPoints });
    map.addLayer({
      id: ENDPOINTS,
      type: "circle",
      source: ENDPOINTS_SRC,
      paint: {
        "circle-radius": 10,
        "circle-color": theme.endpoint,
        "circle-opacity": 0,
        "circle-blur": 0.35,
        "circle-stroke-width": 2,
        "circle-stroke-color": theme.arcCore,
        "circle-stroke-opacity": 0,
      },
    });
  }

  if (!map.getSource(COMET_A_SRC)) {
    map.addSource(COMET_A_SRC, { type: "geojson", data: offComet });
    map.addLayer({
      id: COMET_A,
      type: "circle",
      source: COMET_A_SRC,
      paint: {
        "circle-radius": 7,
        "circle-color": theme.comet,
        "circle-opacity": 0,
        "circle-blur": 0.2,
      },
    });
  }

  if (!map.getSource(COMET_B_SRC)) {
    map.addSource(COMET_B_SRC, { type: "geojson", data: offComet });
    map.addLayer({
      id: COMET_B,
      type: "circle",
      source: COMET_B_SRC,
      paint: {
        "circle-radius": 4.5,
        "circle-color": theme.cometTrail,
        "circle-opacity": 0,
        "circle-blur": 0.55,
      },
    });
  }

}

function layerReady(map: MapboxMap, id: string): boolean {
  return Boolean(map.getLayer(id));
}

export function setRouteVisible(map: MapboxMap, visible: boolean): void {
  if (!layerReady(map, ROUTE_CORE)) return;
  const op = visible ? 1 : 0;
  const epFill = visible ? 0.45 : 0;
  const epStroke = visible ? 0.95 : 0;
  map.setPaintProperty(ROUTE_GLOW, "line-opacity", visible ? 0.42 : 0);
  map.setPaintProperty(ROUTE_CORE, "line-opacity", op);
  map.setPaintProperty(ENDPOINTS, "circle-opacity", epFill);
  map.setPaintProperty(ENDPOINTS, "circle-stroke-opacity", epStroke);
  map.setPaintProperty(COMET_A, "circle-opacity", op);
  map.setPaintProperty(COMET_B, "circle-opacity", visible ? 0.85 : 0);
}

export function updateRouteGeometry(
  map: MapboxMap,
  coords: [number, number][],
  endpoints: [number, number][],
): void {
  const line = map.getSource(ROUTE_SRC) as GeoJSONSource | undefined;
  line?.setData({
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: coords },
  });

  const ends = map.getSource(ENDPOINTS_SRC) as GeoJSONSource | undefined;
  ends?.setData({
    type: "FeatureCollection",
    features: endpoints.map((coordinates) => ({
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates },
    })),
  });
}

export function updateCometPositions(
  map: MapboxMap,
  lead: [number, number],
  trail: [number, number],
): void {
  const a = map.getSource(COMET_A_SRC) as GeoJSONSource | undefined;
  const b = map.getSource(COMET_B_SRC) as GeoJSONSource | undefined;
  const point = (c: [number, number]): GeoJSON.Feature => ({
    type: "Feature",
    properties: {},
    geometry: { type: "Point", coordinates: c },
  });
  a?.setData(point(lead));
  b?.setData(point(trail));
}

export function clearRouteGeometry(map: MapboxMap): void {
  updateRouteGeometry(map, [], []);
  const a = map.getSource(COMET_A_SRC) as GeoJSONSource | undefined;
  const b = map.getSource(COMET_B_SRC) as GeoJSONSource | undefined;
  a?.setData(offComet);
  b?.setData(offComet);
}

const FLAT_FOG: PulseGlobeTheme["fog"] = {
  color: "rgb(9, 9, 12)",
  "high-color": "rgb(9, 9, 12)",
  "horizon-blend": 0,
  "space-color": "rgb(9, 9, 12)",
  "star-intensity": 0,
};

/** Flat Mercator for browsing; globe + stars when a connection arc is active. */
export function setConnectionGlobeMode(
  map: MapboxMap,
  active: boolean,
  theme: PulseGlobeTheme,
): void {
  if (active) {
    installPulseGlobe(map, theme);
    map.setProjection("globe");
    map.setFog(theme.fog);
    if (map.getLayer(GLOBE_DOTS)) {
      map.setLayoutProperty(GLOBE_DOTS, "visibility", "visible");
    }
    return;
  }

  map.setProjection("mercator");
  map.setFog(FLAT_FOG);
  if (map.getLayer(GLOBE_DOTS)) {
    map.setLayoutProperty(GLOBE_DOTS, "visibility", "none");
  }
  setRouteVisible(map, false);
  clearRouteGeometry(map);
}