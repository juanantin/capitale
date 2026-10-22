// Building plots on the map. Land is the real Italy outline; each district owns the land
// closest to its city (Milano, Roma, Napoli, Venezia). Inside a district, plot 0 is the one
// closest to the city centre and later plots spiral outwards, matching the NFT's plot number.

import italy from "./italy.json";

export const TILT = 0.78; // vertical squash that gives the map its isometric look
export const PLOT_SPACING = 40;
/** How much bigger than their drawn size buildings appear on the map. */
export const BUILDING_SCALE = 5.1;
export const LANDMARK_SCALE = 4.2;

export type Pt = [number, number];
export const WORLD = { width: italy.width, height: italy.height * TILT };
export const RINGS: Pt[][] = (italy.rings as unknown as Pt[][]).map((r) => r.map(([x, y]) => [x, y * TILT] as Pt));

const P = italy.places as unknown as Record<string, Pt>;
export const PLACES: Record<string, Pt> = Object.fromEntries(
  Object.entries(P).map(([k, [x, y]]) => [k, [x, y * TILT] as Pt]),
);
export const DISTRICT_PLACES = ["milano", "roma", "napoli", "venezia"] as const;

function inRing(x: number, y: number, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function onLand(x: number, y: number): boolean {
  return RINGS.some((r) => inRing(x, y, r));
}

function wellInland(x: number, y: number, m: number): boolean {
  return (
    onLand(x, y) && onLand(x + m, y) && onLand(x - m, y) && onLand(x, y + m * TILT) && onLand(x, y - m * TILT)
  );
}

let cache: Pt[][] | null = null;

/** plots[district][plotIndex] = map position (ground point of the building). */
export function getPlots(): Pt[][] {
  if (cache) return cache;
  const cities = DISTRICT_PLACES.map((k) => PLACES[k]);
  const reserved: [Pt, number][] = [
    [PLACES.mayor, 165],
    ...cities.map((c) => [c, 160] as [Pt, number]),
  ];
  const sx = PLOT_SPACING;
  const sy = PLOT_SPACING * TILT * 0.87;
  // Layer 0: roomy grid. Layer 1 (used once a district's roomy plots are taken): the gaps
  // between them, so a late, crowded district gets denser instead of spilling into the sea.
  const layer = (ox: number, oy: number) => {
  const lists: { p: Pt; d: number }[][] = [[], [], [], []];
  let row = 0;
  for (let y = sy + oy; y < WORLD.height; y += sy, row++) {
    for (let x = (row % 2) * (sx / 2) + ox; x < WORLD.width; x += sx) {
      if (!wellInland(x, y, 22)) continue;
      if (reserved.some(([c, r]) => Math.hypot(x - c[0], (y - c[1]) / TILT) < r)) continue;
      let best = 0;
      let bestD = Infinity;
      cities.forEach((c, i) => {
        const d = Math.hypot(x - c[0], (y - c[1]) / TILT);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      lists[best].push({ p: [x, y], d: bestD });
    }
  }
  return lists.map((l) => l.sort((a, b) => a.d - b.d).map((e) => e.p));
  };
  const a = layer(0, 0);
  const b = layer(sx / 4, sy / 2);
  cache = a.map((l, i) => [...l, ...b[i]]);
  return cache;
}

/** Position for a plot; if a district ever outgrows its land, extra plots double up nearby. */
export function plotPosition(district: number, plot: number): Pt {
  const list = getPlots()[district];
  const p = list[plot % list.length];
  const layer = Math.floor(plot / list.length);
  return layer === 0 ? p : [p[0] + layer * 6, p[1] + layer * 4];
}
