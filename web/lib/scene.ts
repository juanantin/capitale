// The animated city map (PixiJS). Owns everything drawn on the canvas; React only passes it
// the building list and listens for taps and camera moves (for the HTML banners on top).

import { Application, Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import {
  drawBoat,
  drawBuilding,
  drawCampanile,
  drawCloud,
  drawColosseum,
  drawDuomo,
  drawEmptyPlot,
  drawGondola,
  drawMayor,
  drawTree,
  drawVesuvius,
  floorsForLevel,
  districtPalette,
} from "./art";
import { DISTRICTS, levelForUsd } from "./config";
import { DISTRICT_PLACES, PLACES, PLOT_SPACING, Pt, RINGS, TILT, WORLD, onLand, plotPosition } from "./plots";
import { ui, type Building } from "./store";

const SEA = 0x7fd6d0;
const SAND = 0xf3dfa2;
const CLIFF = 0xd9b97a;
const GRASS = 0xa8dd8f;

interface Baked {
  texture: Texture;
  ax: number;
  ay: number;
}

interface Tween {
  t: number;
  dur: number;
  step: (p: number) => void;
  done?: () => void;
}

interface Particle {
  s: Sprite;
  vx: number;
  vy: number;
  g: number;
  life: number;
  max: number;
  grow: number;
}

const easeOutBack = (p: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2;
};
const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

type SpriteKeys = Record<string, string>;

export interface SceneCallbacks {
  onSelect: (id: number | null) => void;
  onCamera: () => void;
}

export class CityScene {
  app = new Application();
  world = new Container();
  private objects = new Container();
  private ground = new Container();
  private fx = new Container();
  private clouds = new Container();
  private baked = new Map<string, Baked>();
  private sprites = new Map<number, Sprite>();
  private levels = new Map<number, number>();
  private trees: { s: Sprite; p: Pt }[] = [];
  private treeGrid = new Map<string, number[]>();
  private tweens: Tween[] = [];
  private particles: Particle[] = [];
  private pool: Sprite[] = [];
  private dot!: Texture;
  private star!: Texture;
  private boats: { s: Sprite; c: Pt; r: number; a: number; speed: number; sq: number }[] = [];
  private waves: { s: Sprite; t: number; period: number }[] = [];
  private cloudList: { s: Container; speed: number }[] = [];
  private emitters: { p: Pt; rate: number; acc: number; big: boolean }[] = [];
  private markers: Sprite[] = [];
  private ring = new Graphics();
  private inviters: number[] = [];
  private fireworkAcc = 0;
  private sprites404: SpriteKeys = {};
  private destroyed = false;
  private pointers = new Map<number, { x: number; y: number }>();
  private dragStart: { x: number; y: number; t: number; moved: boolean } | null = null;
  private pinch: { d: number; scale: number; cx: number; cy: number } | null = null;
  private camTween: Tween | null = null;
  private cb: SceneCallbacks;
  private el!: HTMLElement;
  private buildingsById = new Map<number, Building>();
  private reducedMotion = false;

  constructor(cb: SceneCallbacks) {
    this.cb = cb;
  }

  async init(el: HTMLElement) {
    this.el = el;
    this.reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    await this.app.init({
      resizeTo: el,
      background: SEA,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      preference: "webgl",
    });
    if (this.destroyed) return;
    el.appendChild(this.app.canvas);
    this.app.canvas.style.touchAction = "none";

    this.dot = this.bakeTexture((g) => g.circle(0, 0, 8).fill(0xffffff));
    this.star = this.bakeTexture((g) =>
      g.poly([0, -6, 1.6, -1.6, 6, 0, 1.6, 1.6, 0, 6, -1.6, 1.6, -6, 0, -1.6, -1.6]).fill(0xffffff),
    );
    await this.loadRealSprites();

    this.app.stage.addChild(this.world);
    const sea = new Container();
    this.world.addChild(sea, this.drawIsland(), this.ground, this.objects, this.fx, this.clouds);
    this.objects.sortableChildren = true;
    this.ring.ellipse(0, 0, 17, 8.5).stroke({ width: 3, color: 0xffffff }).ellipse(0, 0, 13, 6.5).fill({ color: 0xffffff, alpha: 0.35 });
    this.ring.visible = false;
    this.ground.addChild(this.ring);
    this.makeWaves(sea);
    this.makeBoats(sea);
    this.makeLandmarks();
    this.makeTrees();
    this.makeClouds();
    this.fit();
    this.bindInput();
    this.app.ticker.add((t) => this.update(t.deltaMS / 1000));
  }

  destroy() {
    this.destroyed = true;
    try {
      this.app.destroy(true, { children: true, texture: true });
    } catch {
      /* not initialised yet */
    }
  }

  // ─────────── real sprites (optional) ───────────

  private async loadRealSprites() {
    try {
      const res = await fetch("/sprites/manifest.json", { cache: "no-store" });
      if (!res.ok) return;
      const m = (await res.json()) as SpriteKeys;
      const entries = Object.entries(m);
      await Promise.all(entries.map(([, url]) => Assets.load(url)));
      this.sprites404 = m;
    } catch {
      this.sprites404 = {};
    }
  }

  private realTexture(key: string): Texture | null {
    const url = this.sprites404[key];
    return url ? (Assets.get(url) as Texture) : null;
  }

  // ─────────── texture baking ───────────

  private bakeTexture(draw: (g: Graphics) => void): Texture {
    const g = new Graphics();
    draw(g);
    const t = this.app.renderer.generateTexture({ target: g, resolution: 2, antialias: true });
    g.destroy();
    return t;
  }

  private bake(key: string, draw: (c: Container) => void): Baked {
    const hit = this.baked.get(key);
    if (hit) return hit;
    const c = new Container();
    draw(c);
    const b = c.getLocalBounds();
    const texture = this.app.renderer.generateTexture({ target: c, resolution: 2, antialias: true });
    c.destroy({ children: true });
    const baked = { texture, ax: -b.x / b.width, ay: -b.y / b.height };
    this.baked.set(key, baked);
    return baked;
  }

  private buildingTexture(d: number, style: number, level: number): Baked {
    const real = this.realTexture(`style_${d}_${style}`);
    if (!real) {
      return this.bake(`b${d}_${style}_${level}`, (c) => {
        const g = new Graphics();
        drawBuilding(g, d, style, level);
        c.addChild(g);
      });
    }
    // Real sprite on top, procedural floors underneath: one extra floor per level above 1.
    return this.bake(`r${d}_${style}_${level}`, (c) => {
      const extra = floorsForLevel(level) - 1;
      const g = new Graphics();
      const p = districtPalette(d);
      const a = 12;
      g.ellipse(3, 2, a + 4, a / 2 + 3).fill({ color: 0x2f5d3a, alpha: 0.18 });
      for (let k = 0; k < extra; k++) {
        const b = -k * 5;
        g.poly([-a, b, 0, b + a / 2, 0, b + a / 2 - 5, -a, b - 5]).fill(p.lit).stroke({ width: 1.2, color: 0x5b4636 });
        g.poly([0, b + a / 2, a, b, a, b - 5, 0, b + a / 2 - 5]).fill(p.shade).stroke({ width: 1.2, color: 0x5b4636 });
      }
      c.addChild(g);
      const s = new Sprite(real);
      s.anchor.set(0.5, 0.92);
      s.scale.set(30 / real.width);
      s.y = -Math.max(0, extra) * 5;
      c.addChild(s);
    });
  }

  private place(baked: Baked, p: Pt): Sprite {
    const s = new Sprite(baked.texture);
    s.anchor.set(baked.ax, baked.ay);
    s.scale.set(0.5); // textures are baked at 2x resolution
    s.position.set(p[0], p[1]);
    s.zIndex = p[1];
    this.objects.addChild(s);
    return s;
  }

  // ─────────── static world ───────────

  private drawIsland(): Container {
    const c = new Container();
    const foam = new Graphics();
    const cliff = new Graphics();
    const sand = new Graphics();
    const grass = new Graphics();
    for (const ring of RINGS) {
      const flat = ring.flat();
      const shifted = ring.flatMap(([x, y]) => [x, y + 14]);
      foam.poly(flat).stroke({ width: 44, color: 0xffffff, alpha: 0.28, join: "round" });
      cliff.poly(shifted).fill(CLIFF).stroke({ width: 22, color: CLIFF, join: "round" });
      sand.poly(flat).fill(SAND).stroke({ width: 22, color: SAND, join: "round" });
      grass.poly(flat).fill(GRASS).stroke({ width: 4, color: 0x96cf7d, join: "round" });
    }
    c.addChild(foam, cliff, sand, grass);
    // soft piazza under each landmark and the Mayor
    const plaza = new Graphics();
    DISTRICT_PLACES.forEach((k, i) => {
      const [x, y] = PLACES[k];
      plaza.ellipse(x, y, 60, 60 * TILT).fill({ color: parseInt(DISTRICTS[i].light.slice(1), 16), alpha: 0.75 });
      plaza.ellipse(x, y, 60, 60 * TILT).stroke({ width: 3, color: 0xffffff, alpha: 0.7 });
    });
    const [mx, my] = PLACES.mayor;
    plaza.ellipse(mx, my, 66, 66 * TILT).fill({ color: 0xfde4ea, alpha: 0.85 }).stroke({ width: 3, color: 0xffffff });
    c.addChild(plaza);
    return c;
  }

  private makeLandmarks() {
    const mk = (key: string, draw: (g: Graphics) => void, p: Pt, realKey: string, width: number) => {
      const real = this.realTexture(realKey);
      const baked = real
        ? this.bake(`real_${realKey}`, (c) => {
            const s = new Sprite(real);
            s.anchor.set(0.5, 0.85);
            s.scale.set(width / real.width);
            c.addChild(s);
          })
        : this.bake(key, (c) => {
            const g = new Graphics();
            draw(g);
            c.addChild(g);
          });
      this.place(baked, p);
    };
    mk("duomo", drawDuomo, PLACES.milano, "landmark_0", 110);
    mk("colosseum", drawColosseum, PLACES.roma, "landmark_1", 110);
    const [vx, vy] = PLACES.napoli;
    mk("vesuvius", drawVesuvius, [vx + 10, vy + 4], "landmark_2", 150);
    mk("campanile", drawCampanile, PLACES.venezia, "landmark_3", 90);
    mk("mayor", drawMayor, PLACES.mayor, "mayor", 80);
    if (!this.realTexture("landmark_2")) this.emitters.push({ p: [vx + 10, vy - 74], rate: 2.2, acc: 0, big: true });
  }

  private makeTrees() {
    const kinds = [0, 1, 2].map((k) => this.bake(`tree${k}`, (c) => {
      const g = new Graphics();
      drawTree(g, k);
      c.addChild(g);
    }));
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const step = PLOT_SPACING * 1.6;
    for (let y = 10; y < WORLD.height; y += step * TILT) {
      for (let x = 10; x < WORLD.width; x += step) {
        const p: Pt = [x + (rnd() - 0.5) * step * 0.8, y + (rnd() - 0.5) * step * 0.5];
        if (!onLand(p[0], p[1]) || !onLand(p[0] + 10, p[1]) || !onLand(p[0] - 10, p[1])) continue;
        if (rnd() < 0.35) continue;
        const near = [PLACES.mayor, ...DISTRICT_PLACES.map((k) => PLACES[k])].some(
          (c) => Math.hypot(p[0] - c[0], (p[1] - c[1]) / TILT) < 75,
        );
        if (near) continue;
        const s = this.place(kinds[Math.floor(rnd() * 3)], p);
        const idx = this.trees.push({ s, p }) - 1;
        const key = `${Math.floor(p[0] / 40)},${Math.floor(p[1] / 40)}`;
        (this.treeGrid.get(key) ?? this.treeGrid.set(key, []).get(key)!).push(idx);
      }
    }
  }

  private clearTreesAround(p: Pt) {
    const gx = Math.floor(p[0] / 40);
    const gy = Math.floor(p[1] / 40);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const i of this.treeGrid.get(`${gx + dx},${gy + dy}`) ?? []) {
          const t = this.trees[i];
          if (t.s.visible && Math.hypot(t.p[0] - p[0], (t.p[1] - p[1]) / TILT) < 15) t.s.visible = false;
        }
      }
    }
  }

  private seaPoint(p: Pt, margin: number): boolean {
    for (const [dx, dy] of [
      [0, 0],
      [margin, 0],
      [-margin, 0],
      [0, margin],
      [0, -margin],
    ]) {
      if (onLand(p[0] + dx, p[1] + dy)) return false;
    }
    return true;
  }

  private makeWaves(layer: Container) {
    const tex = this.bakeTexture((g) =>
      g.moveTo(-8, 0).quadraticCurveTo(-4, -3, 0, 0).quadraticCurveTo(4, -3, 8, 0).stroke({ width: 2, color: 0xffffff, cap: "round" }),
    );
    let tries = 0;
    while (this.waves.length < 140 && tries++ < 3000) {
      const p: Pt = [Math.random() * (WORLD.width + 400) - 200, Math.random() * (WORLD.height + 300) - 150];
      if (!this.seaPoint(p, 28)) continue;
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      s.scale.set(0.5);
      s.position.set(p[0], p[1]);
      s.alpha = 0;
      layer.addChild(s);
      this.waves.push({ s, t: Math.random() * 6, period: 4 + Math.random() * 4 });
    }
  }

  private makeBoats(layer: Container) {
    const sails = [0xffffff, 0xf2c94c, 0xf2994a, 0x56ccf2, 0xe0524f];
    const orbitOk = (c: Pt, r: number) => {
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        if (!this.seaPoint([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r * TILT], 30)) return false;
      }
      return true;
    };
    let tries = 0;
    while (this.boats.length < 8 && tries++ < 4000) {
      const c: Pt = [Math.random() * WORLD.width, Math.random() * WORLD.height];
      const r = 60 + Math.random() * 140;
      if (!orbitOk(c, r)) continue;
      const tex = this.bake(`boat${this.boats.length % sails.length}`, (cc) => {
        const g = new Graphics();
        drawBoat(g, sails[this.boats.length % sails.length]);
        cc.addChild(g);
      });
      const s = new Sprite(tex.texture);
      s.anchor.set(tex.ax, tex.ay);
      s.scale.set(0.5);
      layer.addChild(s);
      this.boats.push({ s, c, r, a: Math.random() * Math.PI * 2, speed: (0.04 + Math.random() * 0.05) * (Math.random() < 0.5 ? -1 : 1), sq: TILT });
    }
    // gondola in the Venetian lagoon
    const v = PLACES.venezia;
    for (let k = 0; k < 400; k++) {
      const c: Pt = [v[0] + 20 + Math.random() * 90, v[1] - 40 + Math.random() * 90];
      if (!orbitOk(c, 22)) continue;
      const tex = this.bake("gondola", (cc) => {
        const g = new Graphics();
        drawGondola(g);
        cc.addChild(g);
      });
      const s = new Sprite(tex.texture);
      s.anchor.set(tex.ax, tex.ay);
      s.scale.set(0.5);
      layer.addChild(s);
      this.boats.push({ s, c, r: 22, a: 0, speed: 0.12, sq: TILT });
      break;
    }
  }

  private makeClouds() {
    for (let i = 0; i < 7; i++) {
      const c = new Container();
      const shadow = new Graphics();
      shadow.ellipse(0, 90, 46, 18).fill({ color: 0x1f4d40, alpha: 0.07 });
      const g = new Graphics();
      drawCloud(g);
      g.alpha = 0.92;
      c.addChild(shadow, g);
      c.position.set(Math.random() * WORLD.width, Math.random() * WORLD.height);
      c.scale.set(0.8 + Math.random() * 0.9);
      this.clouds.addChild(c);
      this.cloudList.push({ s: c, speed: 6 + Math.random() * 8 });
    }
  }

  // ─────────── buildings ───────────

  /** Bring the map in line with the building list. New ids pop in when `animate` is true. */
  sync(buildings: Building[], animate: boolean) {
    this.inviters = [];
    for (const b of buildings) {
      this.buildingsById.set(b.id, b);
      if (b.invites >= 2) this.inviters.push(b.id);
      const level = levelForUsd(b.claimedUsd);
      const s = this.sprites.get(b.id);
      if (!s) {
        this.addBuilding(b, animate);
      } else if (this.levels.get(b.id) !== level) {
        this.setLevel(b, level, animate);
      }
    }
    this.updateMarkers(buildings);
  }

  private addBuilding(b: Building, animate: boolean) {
    const level = levelForUsd(b.claimedUsd);
    const p = plotPosition(b.district, b.plot);
    const s = this.place(this.buildingTexture(b.district, b.style, level), p);
    this.sprites.set(b.id, s);
    this.levels.set(b.id, level);
    this.clearTreesAround(p);
    if (b.district === 2 && b.style === 0 && this.emitters.length < 40) this.emitters.push({ p: [p[0] + 3, p[1] - 22], rate: 0.6, acc: Math.random(), big: false });
    if (!animate || this.reducedMotion) return;
    s.scale.set(0);
    this.tween(650, (t) => s.scale.set(0.5 * Math.max(0, easeOutBack(t))));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      this.spawn(p[0], p[1], Math.cos(a) * 30, Math.sin(a) * 12 - 6, 0, 0.7, 0xf3e7c9, 0.35, 0.6);
    }
  }

  private setLevel(b: Building, level: number, animate: boolean) {
    const s = this.sprites.get(b.id)!;
    this.levels.set(b.id, level);
    const baked = this.buildingTexture(b.district, b.style, level);
    s.texture = baked.texture;
    s.anchor.set(baked.ax, baked.ay);
    if (!animate || this.reducedMotion) return;
    this.tween(700, (t) => {
      s.scale.set(0.5 * (1 + 0.12 * Math.sin(t * Math.PI) * (1 - t)), 0.5 * (0.75 + 0.25 * easeOutBack(t)));
    });
    for (let k = 0; k < 10; k++) {
      this.spawn(s.x + (Math.random() - 0.5) * 22, s.y - 10 - Math.random() * 30, (Math.random() - 0.5) * 20, -30 - Math.random() * 30, 0, 1, 0xfff07a, 0.25, 0, this.star);
    }
  }

  private updateMarkers(buildings: Building[]) {
    const counts = [0, 0, 0, 0];
    for (const b of buildings) counts[b.district] = Math.max(counts[b.district], b.plot + 1);
    if (this.markers.length === 0) {
      for (let d = 0; d < 4; d++) {
        const baked = this.bake(`plot${d}`, (c) => {
          const g = new Graphics();
          drawEmptyPlot(g, parseInt(DISTRICTS[d].colour.slice(1), 16));
          c.addChild(g);
        });
        const s = this.place(baked, [0, 0]);
        s.zIndex = -1;
        this.markers.push(s);
      }
    }
    this.markers.forEach((m, d) => {
      const p = plotPosition(d, counts[d]);
      m.position.set(p[0], p[1]);
    });
  }

  burstAt(id: number) {
    const s = this.sprites.get(id);
    if (!s) return;
    const colours = [0xf2c94c, 0xf2994a, 0x6fcf97, 0x56ccf2, 0xff7eb6, 0xffffff];
    const top = s.y - s.height - 20;
    for (let k = 0; k < 22; k++) {
      const a = (k / 22) * Math.PI * 2;
      const v = 40 + Math.random() * 20;
      this.spawn(s.x, top, Math.cos(a) * v, Math.sin(a) * v, 30, 1.1, colours[k % colours.length], 0.22, 0);
    }
  }

  // ─────────── particles & tweens ───────────

  private spawn(x: number, y: number, vx: number, vy: number, g: number, life: number, color: number, scale: number, grow: number, tex?: Texture) {
    const s = this.pool.pop() ?? new Sprite();
    s.texture = tex ?? this.dot;
    s.anchor.set(0.5);
    s.tint = color;
    s.position.set(x, y);
    s.scale.set(scale);
    s.alpha = 1;
    s.visible = true;
    this.fx.addChild(s);
    this.particles.push({ s, vx, vy, g, life, max: life, grow });
  }

  private tween(ms: number, step: (p: number) => void, done?: () => void): Tween {
    const t = { t: 0, dur: ms / 1000, step, done };
    this.tweens.push(t);
    step(0);
    return t;
  }

  private update(dt: number) {
    dt = Math.min(dt, 0.05);
    const motion = !this.reducedMotion;
    this.tweens = this.tweens.filter((tw) => {
      tw.t += dt;
      const p = Math.min(1, tw.t / tw.dur);
      tw.step(p);
      if (p >= 1) tw.done?.();
      return p < 1;
    });
    if (this.camTween && !this.tweens.includes(this.camTween)) this.camTween = null;

    this.particles = this.particles.filter((pt) => {
      pt.life -= dt;
      pt.vy += pt.g * dt;
      pt.s.x += pt.vx * dt;
      pt.s.y += pt.vy * dt;
      pt.s.scale.set(pt.s.scale.x + pt.grow * dt);
      pt.s.alpha = Math.max(0, pt.life / pt.max);
      if (pt.life > 0) return true;
      pt.s.visible = false;
      this.fx.removeChild(pt.s);
      this.pool.push(pt.s);
      return false;
    });

    if (!motion) return;
    const time = performance.now() / 1000;
    for (const w of this.waves) {
      w.t += dt;
      const ph = (w.t % w.period) / w.period;
      w.s.alpha = Math.sin(ph * Math.PI) * 0.7;
      w.s.x += dt * 2;
    }
    for (const b of this.boats) {
      b.a += b.speed * dt;
      const x = b.c[0] + Math.cos(b.a) * b.r;
      const y = b.c[1] + Math.sin(b.a) * b.r * b.sq;
      const dir = -Math.sin(b.a) * b.speed;
      b.s.scale.x = dir >= 0 ? 0.5 : -0.5;
      b.s.position.set(x, y + Math.sin(time * 2 + b.r) * 1.2);
      b.s.rotation = Math.sin(time * 1.6 + b.r) * 0.04;
    }
    for (const c of this.cloudList) {
      c.s.x += c.speed * dt;
      if (c.s.x > WORLD.width + 200) c.s.x = -200;
    }
    this.clouds.alpha = Math.max(0, Math.min(1, 1.6 - this.world.scale.x));
    for (const e of this.emitters) {
      e.acc += dt * e.rate;
      while (e.acc >= 1) {
        e.acc -= 1;
        this.spawn(e.p[0] + (Math.random() - 0.5) * 4, e.p[1], (Math.random() - 0.2) * 6, e.big ? -14 : -9, 0, e.big ? 4 : 2.2, e.big ? 0xe9e4df : 0xf4f1ee, e.big ? 0.7 : 0.25, e.big ? 0.35 : 0.18);
      }
    }
    this.fireworkAcc += dt;
    if (this.fireworkAcc > 2.4 && this.inviters.length) {
      this.fireworkAcc = 0;
      this.burstAt(this.inviters[Math.floor(Math.random() * this.inviters.length)]);
    }
    for (const m of this.markers) m.alpha = 0.6 + 0.4 * Math.sin(time * 3);
    if (this.ring.visible) this.ring.scale.set(1 + 0.12 * Math.sin(time * 5));
  }

  // ─────────── camera ───────────

  /** Screen area not covered by the header/stats (top) and tab bar (bottom). */
  private viewport() {
    const w = this.el.clientWidth;
    const h = this.el.clientHeight;
    const top = w < 420 ? 165 : 175;
    const bottom = w >= 900 ? 100 : 80;
    return { w, h, top, bottom, cx: w >= 900 && ui.panelOpen ? (w - 450) / 2 : w / 2 };
  }


  fit() {
    const { w, h, top, bottom } = this.viewport();
    const portrait = h > w;
    const s = Math.min(w / (WORLD.width * (portrait ? 0.94 : 1.05)), (h - top - bottom) / (WORLD.height * 1.02));
    this.world.scale.set(s);
    // On portrait screens crop a little of Sardinia's west coast rather than shrinking Italy.
    const x = (w - WORLD.width * s) / 2 + (portrait ? WORLD.width * s * 0.03 : 0);
    this.world.position.set(x, top + (h - top - bottom - WORLD.height * s) / 2);
    this.cb.onCamera();
  }

  worldToScreen(p: Pt): Pt {
    return [p[0] * this.world.scale.x + this.world.x, p[1] * this.world.scale.y + this.world.y];
  }

  get scale() {
    return this.world.scale.x;
  }

  private zoomAt(sx: number, sy: number, next: number) {
    const s = Math.max(0.12, Math.min(4, next));
    const k = s / this.world.scale.x;
    this.world.position.set(sx - (sx - this.world.x) * k, sy - (sy - this.world.y) * k);
    this.world.scale.set(s);
    this.clamp();
  }

  private clamp() {
    const w = this.el.clientWidth;
    const h = this.el.clientHeight;
    const s = this.world.scale.x;
    const minX = w * 0.5 - WORLD.width * s;
    const maxX = w * 0.5;
    const minY = h * 0.5 - WORLD.height * s;
    const maxY = h * 0.5;
    this.world.x = Math.max(minX, Math.min(maxX, this.world.x));
    this.world.y = Math.max(minY, Math.min(maxY, this.world.y));
    this.cb.onCamera();
  }

  select(id: number | null) {
    const s = id === null ? undefined : this.sprites.get(id);
    this.ring.visible = !!s;
    if (s) this.ring.position.set(s.x, s.y);
  }

  flyTo(id: number, scale = 2.2) {
    const s = this.sprites.get(id);
    if (!s) return;
    const { h, top, bottom, cx } = this.viewport();
    const from = { x: this.world.x, y: this.world.y, s: this.world.scale.x };
    const to = { s: scale, x: cx - s.x * scale, y: top + (h - top - bottom) * 0.55 - (s.y - 10) * scale };
    if (this.camTween) this.tweens = this.tweens.filter((t) => t !== this.camTween);
    this.camTween = this.tween(this.reducedMotion ? 1 : 900, (p) => {
      const e = easeInOut(p);
      this.world.scale.set(from.s + (to.s - from.s) * e);
      this.world.position.set(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
      this.cb.onCamera();
    });
  }

  private bindInput() {
    const c = this.app.canvas;
    const local = (e: PointerEvent | WheelEvent) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    c.addEventListener("wheel", (e) => {
      e.preventDefault();
      const p = local(e);
      this.zoomAt(p.x, p.y, this.world.scale.x * Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
    c.addEventListener("pointerdown", (e) => {
      c.setPointerCapture(e.pointerId);
      const p = local(e);
      this.pointers.set(e.pointerId, p);
      if (this.camTween) {
        this.tweens = this.tweens.filter((t) => t !== this.camTween);
        this.camTween = null;
      }
      if (this.pointers.size === 1) this.dragStart = { ...p, t: performance.now(), moved: false };
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), scale: this.world.scale.x, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
        if (this.dragStart) this.dragStart.moved = true;
      }
    });
    c.addEventListener("pointermove", (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) return;
      const p = local(e);
      this.pointers.set(e.pointerId, p);
      if (this.pointers.size === 2 && this.pinch) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        this.world.x += cx - this.pinch.cx;
        this.world.y += cy - this.pinch.cy;
        this.pinch.cx = cx;
        this.pinch.cy = cy;
        this.zoomAt(cx, cy, this.pinch.scale * (d / this.pinch.d));
        return;
      }
      if (this.dragStart && Math.hypot(p.x - this.dragStart.x, p.y - this.dragStart.y) > 6) this.dragStart.moved = true;
      this.world.x += p.x - prev.x;
      this.world.y += p.y - prev.y;
      this.clamp();
    });
    const end = (e: PointerEvent) => {
      const p = local(e);
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (this.pointers.size === 0 && this.dragStart) {
        if (!this.dragStart.moved && performance.now() - this.dragStart.t < 500) this.tap(p.x, p.y);
        this.dragStart = null;
      }
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
  }

  private tap(sx: number, sy: number) {
    const wx = (sx - this.world.x) / this.world.scale.x;
    const wy = (sy - this.world.y) / this.world.scale.y;
    let best: number | null = null;
    let bestZ = -Infinity;
    for (const [id, s] of this.sprites) {
      const b = s.getLocalBounds();
      const x0 = s.x + b.x * s.scale.x;
      const y0 = s.y + b.y * s.scale.y;
      if (wx >= x0 && wx <= x0 + b.width * s.scale.x && wy >= y0 && wy <= y0 + b.height * s.scale.y && s.zIndex > bestZ) {
        best = id;
        bestZ = s.zIndex;
      }
    }
    this.select(best);
    this.cb.onSelect(best);
  }
}
