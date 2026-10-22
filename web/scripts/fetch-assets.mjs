// Downloads Juan's art (lib/assets-manifest.json) and turns it into web-ready sprites in
// public/sprites: white backgrounds removed, trimmed, resized, WebP. Runs before every
// `next build` (e.g. on Vercel). Never fails the build: anything that can't be fetched is
// skipped and the map falls back to the drawn-in-code buildings.

import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import sharp from "sharp";

const OUT = new URL("../public/sprites/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("../lib/assets-manifest.json", import.meta.url), "utf8"));

const jobs = [];
manifest.districts_active.forEach((d, i) => jobs.push({ key: `landmark_${i}`, url: d.url, whiteBg: true }));
const styleGroups = ["STOCKIFY_Milano", "STONKEX_Roma", "DGUY_Napoli", "TEMU_Venezia"];
styleGroups.forEach((g, d) =>
  (manifest.building_styles[g] ?? []).forEach((s) => jobs.push({ key: `style_${d}_${s.style}`, url: s.url, whiteBg: true })),
);
if (manifest.mayor_building) jobs.push({ key: "mayor", url: manifest.mayor_building.url, whiteBg: true });

/** Makes near-white pixels connected to the image border transparent (keeps white details inside). */
export function removeWhiteBackground(data, width, height, channels = 4, tol = 28) {
  const isBg = (i) => {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    return a < 10 || (255 - r < tol && 255 - g < tol && 255 - b < tol);
  };
  const seen = new Uint8Array(width * height);
  const stack = [];
  for (let x = 0; x < width; x++) stack.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) stack.push(y * width, y * width + width - 1);
  while (stack.length) {
    const p = stack.pop();
    if (seen[p]) continue;
    seen[p] = 1;
    if (!isBg(p * channels)) continue;
    data[p * channels + 3] = 0;
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) stack.push(p - 1);
    if (x < width - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - width);
    if (y < height - 1) stack.push(p + width);
  }
  // Soften the edge: semi-transparent fringe on light pixels next to removed ones.
  for (let p = 0; p < width * height; p++) {
    const i = p * channels;
    if (data[i + 3] === 0) continue;
    const x = p % width;
    const near = (x > 0 && data[i - channels + 3] === 0) || (x < width - 1 && data[i + channels + 3] === 0);
    if (near) {
      const light = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (light > 200) data[i + 3] = Math.round(255 * (1 - (light - 200) / 55) * 0.8);
    }
  }
  return data;
}

async function processJob(job) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(job.url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const input = Buffer.from(await res.arrayBuffer());
    let img = sharp(input).ensureAlpha();
    if (job.whiteBg) {
      const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
      removeWhiteBackground(data, info.width, info.height, info.channels);
      img = sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });
    }
    const trimmed = await img.png().toBuffer();
    const out = await sharp(trimmed).trim({ threshold: 1 }).resize({ width: 384, withoutEnlargement: true }).webp({ quality: 90, alphaQuality: 95 }).toBuffer();
    await writeFile(new URL(`${job.key}.webp`, OUT), out);
    return [job.key, `/sprites/${job.key}.webp`];
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const ok = {};
  const failed = [];
  await Promise.all(
    jobs.map(async (j) => {
      try {
        const [k, v] = await processJob(j);
        ok[k] = v;
      } catch (e) {
        failed.push(`${j.key}: ${e.message ?? e}`);
      }
    }),
  );
  await writeFile(new URL("manifest.json", OUT), JSON.stringify(ok, null, 2));
  console.log(`[assets] ${Object.keys(ok).length}/${jobs.length} sprites ready`);
  if (failed.length) console.log(`[assets] skipped (map uses drawn art instead):\n  ${failed.join("\n  ")}`);
}

if (process.env.SKIP_ASSETS) {
  console.log("[assets] SKIP_ASSETS set, using drawn art");
} else {
  main().catch((e) => console.log("[assets] failed, using drawn art:", e.message));
}
