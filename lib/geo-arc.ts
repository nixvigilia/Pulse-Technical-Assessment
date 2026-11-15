export type LngLat = { lng: number; lat: number };

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Sample a great-circle path between two WGS84 points. */
export function greatCircleCoordinates(
  from: LngLat,
  to: LngLat,
  segments = 96,
): [number, number][] {
  const lat1 = toRad(from.lat);
  const lon1 = toRad(from.lng);
  const lat2 = toRad(to.lat);
  const lon2 = toRad(to.lng);

  const chord =
    Math.sin((lat1 - lat2) / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon1 - lon2) / 2) ** 2;
  const angular = 2 * Math.asin(Math.min(1, Math.sqrt(chord)));

  if (!Number.isFinite(angular) || angular < 1e-7) {
    return [
      [from.lng, from.lat],
      [to.lng, to.lat],
    ];
  }

  const out: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const f = i / segments;
    const a = Math.sin((1 - f) * angular) / Math.sin(angular);
    const b = Math.sin(f * angular) / Math.sin(angular);
    const x =
      a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
    const y =
      a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
    const z = a * Math.sin(lat1) + b * Math.sin(lat2);
    const lat = Math.atan2(z, Math.hypot(x, y));
    const lon = Math.atan2(y, x);
    out.push([toDeg(lon), toDeg(lat)]);
  }
  return out;
}

export function coordinateAlong(
  coords: [number, number][],
  phase: number,
): [number, number] {
  if (coords.length === 0) return [0, 0];
  if (coords.length === 1) return coords[0];
  const t = Math.max(0, Math.min(1, phase));
  const idx = t * (coords.length - 1);
  const i = Math.floor(idx);
  const f = idx - i;
  if (i >= coords.length - 1) return coords[coords.length - 1];
  const [lng0, lat0] = coords[i];
  const [lng1, lat1] = coords[i + 1];
  return [lng0 + (lng1 - lng0) * f, lat0 + (lat1 - lat0) * f];
}