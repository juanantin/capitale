// Procedural, toy-like cel-shaded art drawn with PixiJS Graphics. Used for every building
// until the real sprites (assets/manifest.json) are processed into /public/sprites; height
// floors stay procedural either way so levels have no cap.

import { Graphics } from "pixi.js";
import { DISTRICTS } from "./config";

export const INK = 0x5b4636;
const OUTLINE = { width: 1.4, color: INK, join: "round" as const };

const hex = (c: string) => parseInt(c.slice(1), 16);

function mix(a: number, b: number, t: number): number {
  const ar = a >> 16, ag = (a >> 8) & 255, ab = a & 255;
  const br = b >> 16, bg = (b >> 8) & 255, bb = b & 255;
  return (
    (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t)
  );
}

export interface Palette {
  wall: number;
  lit: number;
  shade: number;
  top: number;
  roof: number;
  roofShade: number;
  window: number;
}

export function districtPalette(d: number): Palette {
  const D = DISTRICTS[d];
  const wall = hex(D.colour);
  return {
    wall: mix(wall, 0xffffff, 0.25),
    lit: mix(wall, 0xffffff, 0.45),
    shade: mix(wall, hex(D.dark), 0.75),
    top: hex(D.light),
    roof: 0xe07a5f,
    roofShade: 0xb85a43,
    window: 0xfff6d8,
  };
}

export const MAYOR_PALETTE: Palette = {
  wall: 0xf6b8c6,
  lit: 0xfbd3dc,
  shade: 0xdb8ea0,
  top: 0xfde4ea,
  roof: 0xf2c94c,
  roofShade: 0xc99a1f,
  window: 0xffffff,
};

const FLOOR_H = 5;
const GROUND_H = 9;

/** Isometric box: footprint half-width `a`, ground at y = -base, `h` tall. */
function box(g: Graphics, a: number, base: number, h: number, p: Palette, windows: boolean) {
  const b = -base;
  // left (lit) face
  g.poly([-a, b, 0, b + a / 2, 0, b + a / 2 - h, -a, b - h]).fill(p.lit).stroke(OUTLINE);
  // right (shade) face
  g.poly([0, b + a / 2, a, b, a, b - h, 0, b + a / 2 - h]).fill(p.shade).stroke(OUTLINE);
  if (!windows) return;
  const floors = Math.max(1, Math.floor((h - GROUND_H) / FLOOR_H) + 1);
  for (let k = 0; k < floors; k++) {
    const v0 = k === 0 ? 2.5 : GROUND_H + (k - 1) * FLOOR_H + 1.3;
    const v1 = v0 + (k === 0 ? 4 : 2.6);
    for (const [u0, u1] of [
      [0.22, 0.42],
      [0.58, 0.78],
    ]) {
      // left face window
      g.poly([
        -a + u0 * a, b + (u0 * a) / 2 - v0,
        -a + u1 * a, b + (u1 * a) / 2 - v0,
        -a + u1 * a, b + (u1 * a) / 2 - v1,
        -a + u0 * a, b + (u0 * a) / 2 - v1,
      ]).fill(p.window);
      // right face window (dimmer)
      g.poly([
        u0 * a, b + a / 2 - (u0 * a) / 2 - v0,
        u1 * a, b + a / 2 - (u1 * a) / 2 - v0,
        u1 * a, b + a / 2 - (u1 * a) / 2 - v1,
        u0 * a, b + a / 2 - (u0 * a) / 2 - v1,
      ]).fill({ color: p.window, alpha: 0.7 });
    }
  }
}

function topDiamond(g: Graphics, a: number, y: number, color: number) {
  g.poly([-a, y, 0, y + a / 2, a, y, 0, y - a / 2]).fill(color).stroke(OUTLINE);
}

function shadow(g: Graphics, a: number) {
  g.ellipse(3, 2, a + 4, a / 2 + 3).fill({ color: 0x2f5d3a, alpha: 0.18 });
}

/** Ground floor plus one floor per level above 1 (no cap). */
export function floorsForLevel(level: number) {
  return level;
}

export function heightForLevel(level: number) {
  return GROUND_H + (level - 1) * FLOOR_H;
}

export function drawBuilding(g: Graphics, district: number, style: number, level: number) {
  const p = districtPalette(district);
  const a = 10;
  const h = heightForLevel(level);
  shadow(g, a);
  box(g, a, 0, h, p, true);
  const y = -h;
  if (style === 0) {
    // modern tower: flat roof, parapet, antenna
    topDiamond(g, a, y, p.top);
    topDiamond(g, a * 0.62, y - 1, mix(p.top, 0xffffff, 0.4));
    g.moveTo(2, y - 2).lineTo(2, y - 9).stroke({ width: 1.2, color: INK });
    g.circle(2, y - 10, 1.6).fill(0xff6b6b);
  } else if (style === 1) {
    // pitched terracotta roof
    const apex = y - 10;
    g.poly([-a - 1, y, 0, y + a / 2 + 1, 0, apex]).fill(p.roof).stroke(OUTLINE);
    g.poly([0, y + a / 2 + 1, a + 1, y, 0, apex]).fill(p.roofShade).stroke(OUTLINE);
  } else {
    // dome
    topDiamond(g, a, y, p.top);
    g.ellipse(0, y - 1, a * 0.72, a * 0.72).fill(mix(p.top, 0xffffff, 0.3)).stroke(OUTLINE);
    g.ellipse(-2.5, y - 4, 2, 1.5).fill({ color: 0xffffff, alpha: 0.8 });
    g.moveTo(0, y - a * 0.72 - 1).lineTo(0, y - a * 0.72 - 5).stroke({ width: 1.2, color: INK });
  }
}

export function drawMayor(g: Graphics) {
  const p = MAYOR_PALETTE;
  const a = 24;
  shadow(g, a);
  // podium
  box(g, a + 4, 0, 5, { ...p, lit: 0xfff3d6, shade: 0xe8d5a8 }, false);
  topDiamond(g, a + 4, -5, 0xfff8e6);
  box(g, a, 5, 30, p, true);
  // columns on the lit face
  for (let i = 0; i < 4; i++) {
    const u = 0.15 + i * 0.22;
    const x = -a + u * a;
    const yb = -5 + (u * a) / 2;
    g.rect(x - 1.2, yb - 26, 2.4, 26).fill(0xffffff).stroke({ width: 0.8, color: INK });
  }
  topDiamond(g, a, -35, p.top);
  g.ellipse(0, -38, 13, 13).fill(p.roof).stroke(OUTLINE);
  g.ellipse(-4, -43, 3.5, 2.5).fill({ color: 0xffffff, alpha: 0.7 });
  g.moveTo(0, -51).lineTo(0, -66).stroke({ width: 1.6, color: INK });
  // tricolore flag
  g.rect(0, -66, 5, 6).fill(0x3fae5b);
  g.rect(5, -66, 5, 6).fill(0xffffff);
  g.rect(10, -66, 5, 6).fill(0xe0524f);
  g.rect(0, -66, 15, 6).stroke({ width: 0.8, color: INK });
}

export function drawDuomo(g: Graphics) {
  const p: Palette = { ...districtPalette(0), lit: 0xfff6e0, shade: 0xead9b0, top: 0xfffaf0 };
  const a = 34;
  shadow(g, a);
  box(g, a, 0, 16, p, false);
  topDiamond(g, a, -16, p.top);
  // spires along the two visible top edges
  const spire = (x: number, y: number, hgt: number) => {
    g.poly([x - 2.2, y, x + 2.2, y, x, y - hgt]).fill(0xfff6e0).stroke({ width: 1, color: INK });
    g.circle(x, y - hgt, 1.4).fill(0xf2c94c);
  };
  for (let i = 0; i <= 6; i++) {
    const u = i / 6;
    spire(-a + u * a, -16 + (u * a) / 2, 10 + (i % 2) * 5);
    spire(u * a, -16 + a / 2 - (u * a) / 2, 10 + ((i + 1) % 2) * 5);
  }
  // tall central spire with the golden Madonnina
  g.poly([-4, -16, 4, -16, 0, -58]).fill(0xfff6e0).stroke(OUTLINE);
  g.circle(0, -60, 3).fill(0xf2c94c).stroke({ width: 1, color: INK });
  // rose window
  g.circle(-a / 2, -8 + a / 4 - 4, 4).fill(0xf2c94c).stroke({ width: 1, color: INK });
}

export function drawColosseum(g: Graphics) {
  const rx = 40;
  const ry = 21;
  const h = 26;
  g.ellipse(4, 3, rx + 4, ry + 3).fill({ color: 0x2f5d3a, alpha: 0.18 });
  // cylinder silhouette = bottom ellipse + wall band, then the outline of its front
  g.ellipse(0, 0, rx, ry).fill(0xf2a65e);
  g.rect(-rx, -h, rx * 2, h).fill(0xf2a65e);
  g.moveTo(-rx, -h).lineTo(-rx, 0).stroke(OUTLINE);
  g.moveTo(rx, -h).lineTo(rx, 0).stroke(OUTLINE);
  g.arc(0, 0, rx, 0, Math.PI).stroke(OUTLINE);
  // arches, three rows
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 9; i++) {
      const t = (i + 0.5) / 9;
      const x = -rx + t * rx * 2;
      const dy = Math.sqrt(Math.max(0, 1 - (x / rx) ** 2)) * ry;
      const yb = dy - row * 8.5 - 2;
      g.roundRect(x - 2.4, yb - 6, 4.8, 6, 2).fill(0x9c4f22);
    }
  }
  // top rim and arena
  g.ellipse(0, -h, rx, ry).fill(0xf7c08a).stroke(OUTLINE);
  g.ellipse(0, -h + 2, rx - 9, ry - 6).fill(0xc9763c).stroke({ width: 1, color: INK });
  g.ellipse(0, -h + 4, rx - 18, ry - 12).fill(0xe8c78f);
}

export function drawVesuvius(g: Graphics) {
  g.ellipse(6, 4, 82, 26).fill({ color: 0x2f5d3a, alpha: 0.18 });
  g.poly([-78, 0, -18, -78, 18, -78, 78, 0, 0, 22]).fill(0x9bb07e).stroke(OUTLINE);
  g.poly([0, 22, 78, 0, 18, -78, 4, -78]).fill(0x7d9463);
  g.poly([-78, 0, -18, -78, 18, -78, 78, 0, 0, 22]).stroke(OUTLINE);
  // crater
  g.ellipse(0, -78, 18, 6).fill(0x5d4a3d).stroke(OUTLINE);
  g.ellipse(0, -77, 10, 3).fill(0xe0524f);
  // lighter slope streaks
  g.poly([-40, -38, -22, -70, -16, -70, -30, -36]).fill({ color: 0xffffff, alpha: 0.18 });
  // little pizzeria at the foot
  const p = districtPalette(2);
  g.position.set(0, 0);
  const px = 46;
  const py = 10;
  g.ellipse(px + 2, py + 2, 12, 5).fill({ color: 0x2f5d3a, alpha: 0.2 });
  g.poly([px - 9, py, px, py + 4.5, px, py - 9.5, px - 9, py - 14]).fill(0xfff3d6).stroke(OUTLINE);
  g.poly([px, py + 4.5, px + 9, py, px + 9, py - 14, px, py - 9.5]).fill(0xead9b0).stroke(OUTLINE);
  g.poly([px - 10, py - 14, px, py - 9, px, py - 22]).fill(p.roof).stroke(OUTLINE);
  g.poly([px, py - 9, px + 10, py - 14, px, py - 22]).fill(p.roofShade).stroke(OUTLINE);
  // striped awning
  for (let i = 0; i < 4; i++) {
    g.poly([px - 9 + i * 2.25, py - 6 + i * 1.1, px - 6.75 + i * 2.25, py - 4.9 + i * 1.1, px - 6.75 + i * 2.25, py - 2.4 + i * 1.1, px - 9 + i * 2.25, py - 3.5 + i * 1.1]).fill(
      i % 2 ? 0xffffff : 0xe0524f,
    );
  }
  g.rect(px + 4, py - 24, 3, 7).fill(0xb0a49a).stroke({ width: 1, color: INK }); // oven chimney
}

export function drawCampanile(g: Graphics) {
  const p: Palette = { ...districtPalette(3), lit: 0xe58a6e, shade: 0xc4664c, top: 0xf2b39e };
  const a = 10;
  shadow(g, a);
  box(g, a, 0, 64, p, false);
  // white stripes
  for (const v of [16, 32, 48]) {
    g.poly([-a, -v, 0, a / 2 - v, 0, a / 2 - v - 1.6, -a, -v - 1.6]).fill(0xfff3d6);
    g.poly([0, a / 2 - v, a, -v, a, -v - 1.6, 0, a / 2 - v - 1.6]).fill(0xead9b0);
  }
  // belfry
  box(g, a, 64, 12, { ...p, lit: 0xfff6e0, shade: 0xead9b0 }, false);
  g.poly([-a + 3, -66 + 1.5, -3, -66 + 3.5, -3, -74 + 3.5, -a + 3, -74 + 1.5]).fill(0x5b4636);
  topDiamond(g, a, -76, 0xfff6e0);
  // green pyramid roof with golden angel
  g.poly([-a, -76, 0, -76 + a / 2, 0, -100]).fill(0x6fcf97).stroke(OUTLINE);
  g.poly([0, -76 + a / 2, a, -76, 0, -100]).fill(0x3a9c63).stroke(OUTLINE);
  g.circle(0, -102, 2.4).fill(0xf2c94c).stroke({ width: 1, color: INK });
}

export function drawTree(g: Graphics, kind: number) {
  g.ellipse(2, 1, 6, 3).fill({ color: 0x2f5d3a, alpha: 0.18 });
  if (kind === 0) {
    // cypress
    g.ellipse(0, -10, 3.4, 10).fill(0x4f9e5f).stroke({ width: 1, color: INK });
    g.ellipse(-1, -12, 1.2, 5).fill({ color: 0xffffff, alpha: 0.15 });
  } else {
    // round pine / olive
    g.rect(-0.8, -5, 1.6, 5).fill(0x8a6a4f);
    g.circle(0, -8, 5.5).fill(kind === 1 ? 0x7cc576 : 0x9acb6a).stroke({ width: 1, color: INK });
    g.circle(-1.8, -10, 1.8).fill({ color: 0xffffff, alpha: 0.2 });
  }
}

export function drawBoat(g: Graphics, sail: number) {
  g.ellipse(0, 3, 11, 3).fill({ color: 0xffffff, alpha: 0.35 });
  g.poly([-10, 0, 10, 0, 7, 4, -7, 4]).fill(0xffffff).stroke({ width: 1, color: INK });
  g.rect(-7, 1.5, 14, 1.2).fill(0xe0524f);
  g.moveTo(0, 0).lineTo(0, -16).stroke({ width: 1, color: INK });
  g.poly([0.6, -15, 0.6, -2, 9, -2]).fill(sail).stroke({ width: 1, color: INK });
}

export function drawGondola(g: Graphics) {
  g.ellipse(0, 2, 14, 2.5).fill({ color: 0xffffff, alpha: 0.35 });
  g.moveTo(-13, -4).quadraticCurveTo(0, 4, 13, -5).quadraticCurveTo(0, 1, -13, -4).fill(0x2d2a32).stroke({ width: 1, color: INK });
  g.moveTo(6, -2).lineTo(9, -13).stroke({ width: 1.2, color: 0x8a6a4f });
  g.circle(6, -9, 1.8).fill(0x2d2a32); // gondolier
  g.rect(4.8, -7.5, 2.4, 5).fill(0xffffff);
  g.rect(4.8, -6.5, 2.4, 1).fill(0xe0524f);
}

export function drawCloud(g: Graphics) {
  for (const [x, y, r] of [
    [0, 0, 22],
    [24, 4, 17],
    [-22, 6, 15],
    [10, -10, 16],
  ]) {
    g.circle(x, y, r).fill(0xffffff);
  }
}

export function drawEmptyPlot(g: Graphics, color: number) {
  const a = 10;
  g.poly([-a, 0, 0, a / 2, a, 0, 0, -a / 2]).fill({ color, alpha: 0.35 }).stroke({ width: 1.5, color: 0xffffff });
  g.moveTo(-3, 0).lineTo(3, 0).stroke({ width: 1.6, color: 0xffffff });
  g.moveTo(0, -1.8).lineTo(0, 1.8).stroke({ width: 1.6, color: 0xffffff });
}
