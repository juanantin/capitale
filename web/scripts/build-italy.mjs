// Builds lib/italy.json from Natural Earth (world-atlas 50m): Italy's outline projected
// to map pixels, plus the projected positions of the cities. Run: node scripts/build-italy.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";

const require = createRequire(import.meta.url);
const topo = JSON.parse(readFileSync(require.resolve("world-atlas/countries-50m.json"), "utf8"));
const italy = feature(topo, topo.objects.countries).features.find((f) => f.properties.name === "Italy");
if (!italy) throw new Error("Italy not found");

const WIDTH = 2000;
const projection = geoMercator().fitWidth(WIDTH, italy);
const [[, y0], [, y1]] = geoPath(projection).bounds(italy);
const HEIGHT = Math.ceil(y1 - y0);
projection.translate([projection.translate()[0], projection.translate()[1] - y0]);

const area = (r) => Math.abs(r.reduce((s, p, i) => s + p[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * p[1], 0) / 2);
const polys = italy.geometry.type === "MultiPolygon" ? italy.geometry.coordinates : [italy.geometry.coordinates];
const rings = polys
  .map((poly) => poly[0].map((c) => projection(c).map((v) => Math.round(v * 10) / 10)))
  .filter((r) => area(r) > 900) // drop islets too small to build on
  .sort((a, b) => area(b) - area(a));

const city = (lon, lat) => projection([lon, lat]).map((v) => Math.round(v));
const out = {
  width: WIDTH,
  height: HEIGHT,
  rings,
  places: {
    mayor: city(12.45, 42.85),
    milano: city(9.19, 45.46),
    roma: city(12.5, 41.9),
    napoli: city(14.27, 40.85),
    venezia: city(12.33, 45.44),
    torino: city(7.68, 45.07),
    firenze: city(11.25, 43.77),
    palermo: city(13.36, 38.12),
  },
};
writeFileSync(new URL("../lib/italy.json", import.meta.url), JSON.stringify(out));
console.log(`italy.json: ${WIDTH}x${HEIGHT}, ${rings.length} rings, ${rings.reduce((s, r) => s + r.length, 0)} points`);
