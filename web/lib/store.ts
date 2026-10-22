// Preview ("unplugged") city state. Everything here is made-up sample data that behaves like
// the real contracts, so the screens and the map can be designed before the testnet deploy.
// When the contracts are live, this file is replaced by reads from Base via wagmi/viem.

import { useSyncExternalStore } from "react";
import { DISTRICTS, DistrictId, MAX_BUILDINGS, levelForUsd, usdForBuilding } from "./config";
import { nextDeadline } from "./romeTime";

export const YOU = "you";

/** Plain UI flags shared with the map (no re-render needed). */
export const ui = { panelOpen: false };

export interface Building {
  id: number;
  district: DistrictId;
  style: 0 | 1 | 2;
  plot: number;
  owner: string;
  inviter: number;
  invites: number;
  earlyBird: boolean;
  claimedUsd: number;
  pendingUsd: number;
  votedWeek: number; // week number it last voted in, -1 never
  builtAt: number;
}

export interface Purchase {
  at: number;
  token: DistrictId;
  eth: number;
  tokens: number;
  usd: number;
}

export interface CityState {
  buildings: Building[];
  districtCount: [number, number, number, number];
  week: number;
  weekEnd: number;
  currentToken: DistrictId;
  votes: [number, number, number, number];
  newBuilds: [number, number, number, number];
  totalTaxEth: number;
  totalPurchases: number;
  totalBoughtUsd: number;
  purchases: Purchase[];
  residentsEth: number;
  streetEth: number;
  opsEth: number;
  opsPaidEth: number;
  holdings: [number, number, number, number];
  ethUsd: number;
  capitaleUsd: number;
  tokenUsd: [number, number, number, number];
  approved: boolean;
  capitaleBalance: number;
  live: boolean;
}

export type CityEvent =
  | { type: "built"; building: Building }
  | { type: "levelUp"; building: Building; from: number }
  | { type: "invited"; building: Building }
  | { type: "focus"; id: number };

// ─────────── deterministic sample data ───────────

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = ["0x7a3…91c", "0x1fe…b20", "0xc04…7d1", "0x9bb…e03", "0x44d…a8f", "0x02c…5e7", "0xd1a…0c4"];

function makeInitial(): CityState {
  const r = rng(20261022);
  const now = Math.floor(Date.now() / 1000);
  const weekEnd = nextDeadline(now);
  const buildings: Building[] = [];
  const districtCount: [number, number, number, number] = [0, 0, 0, 0];
  const weights = [0.3, 0.32, 0.2, 0.18];
  const total = 1247;
  for (let id = 1; id <= total; id++) {
    let x = r();
    let d = 0 as DistrictId;
    for (let k = 0; k < 4; k++) {
      if (x < weights[k]) {
        d = k as DistrictId;
        break;
      }
      x -= weights[k];
    }
    const age = (total - id) / total; // 1 = oldest
    const roll = r();
    const claimed = roll < 0.55 ? r() * 6 * (0.3 + age) : roll < 0.85 ? 5 + r() * 45 * age : roll < 0.97 ? 50 + r() * 150 * age : 150 + r() * 600;
    const owner = id % 97 === 5 || id === 1203 ? YOU : NAMES[Math.floor(r() * NAMES.length)];
    buildings.push({
      id,
      district: d,
      style: Math.floor(r() * 3) as 0 | 1 | 2,
      plot: districtCount[d]++,
      owner,
      inviter: 0,
      invites: 0,
      earlyBird: id <= 300,
      claimedUsd: Math.round(claimed * 100) / 100,
      pendingUsd: Math.round(r() * 12 * (0.3 + age) * 100) / 100,
      votedWeek: r() < 0.35 ? 0 : -1,
      builtAt: now - Math.floor(age * 30 * 86400),
    });
  }
  // A few well-connected inviters (fireworks).
  for (let k = 0; k < 160; k++) {
    const invitee = buildings[Math.floor(r() * total)];
    const inviter = buildings[Math.floor(r() * Math.min(invitee.id - 1, 400))];
    if (!inviter || inviter.id >= invitee.id) continue;
    invitee.inviter = inviter.id;
    inviter.invites += 1;
  }
  const votes: [number, number, number, number] = [0, 0, 0, 0];
  for (const b of buildings) if (b.votedWeek === 0) votes[(b.id * 7 + b.district) % 4 === 1 || r() < 0.4 ? 1 : b.district]++;
  const purchases: Purchase[] = [];
  for (let k = 0; k < 12; k++) {
    const eth = 0.1 + r() * 0.5;
    purchases.push({ at: now - k * 3600 - Math.floor(r() * 1800), token: 1, eth, tokens: 0, usd: eth * 3000 });
  }
  return {
    buildings,
    districtCount,
    week: 0,
    weekEnd,
    currentToken: 1,
    votes,
    newBuilds: [41, 38, 22, 29],
    totalTaxEth: 38.42,
    totalPurchases: 212,
    totalBoughtUsd: 97_960,
    purchases,
    residentsEth: 0.212,
    streetEth: 0.045,
    opsEth: 0.054,
    opsPaidEth: 5.71,
    holdings: [1_204_331, 2_418.6, 9_880_120, 812.4],
    ethUsd: 3000,
    capitaleUsd: 0.00108,
    tokenUsd: [0.42, 3.1, 0.0061, 1.02],
    approved: false,
    capitaleBalance: 250_000,
    live: true,
  };
}

// ─────────── tiny external store ───────────

let state: CityState | null = null;
const listeners = new Set<() => void>();
const eventListeners = new Set<(e: CityEvent) => void>();

function get(): CityState {
  if (!state) state = makeInitial();
  return state;
}

function set(patch: Partial<CityState>) {
  state = { ...get(), ...patch };
  listeners.forEach((l) => l());
}

function emit(e: CityEvent) {
  eventListeners.forEach((l) => l(e));
}

export function useCity(): CityState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    get,
    get,
  );
}

export function getCity(): CityState {
  return get();
}

export function onCityEvent(l: (e: CityEvent) => void): () => void {
  eventListeners.add(l);
  return () => eventListeners.delete(l);
}

// ─────────── actions (simulated transactions) ───────────

export function quoteBuild(): { id: number; usd: number; tokens: number } {
  const s = get();
  const id = s.buildings.length + 1;
  const usd = usdForBuilding(id, false);
  return { id, usd, tokens: Math.ceil(usd / s.capitaleUsd) };
}

export function approve() {
  set({ approved: true });
}

export function build(owner: string, district: DistrictId, style: 0 | 1 | 2, inviter: number): Building | null {
  const s = get();
  if (s.buildings.length >= MAX_BUILDINGS) return null;
  const q = quoteBuild();
  const districtCount = [...s.districtCount] as CityState["districtCount"];
  const buildings = [...s.buildings];
  const b: Building = {
    id: q.id,
    district,
    style,
    plot: districtCount[district]++,
    owner,
    inviter: 0,
    invites: 0,
    earlyBird: false,
    claimedUsd: 0,
    pendingUsd: 0,
    votedWeek: -1,
    builtAt: Math.floor(Date.now() / 1000),
  };
  let inviterB: Building | undefined;
  if (inviter > 0 && inviter < b.id) {
    const i = buildings[inviter - 1];
    if (i && i.owner !== owner) {
      b.inviter = inviter;
      inviterB = { ...i, invites: i.invites + 1 };
      buildings[inviter - 1] = inviterB;
    }
  }
  buildings.push(b);
  const newBuilds = [...s.newBuilds] as CityState["newBuilds"];
  newBuilds[district]++;
  set({
    buildings,
    districtCount,
    newBuilds,
    capitaleBalance: owner === YOU ? s.capitaleBalance - q.tokens : s.capitaleBalance,
  });
  emit({ type: "built", building: b });
  if (inviterB) emit({ type: "invited", building: inviterB });
  return b;
}

export function claim(ids: number[]) {
  const s = get();
  const buildings = [...s.buildings];
  for (const id of ids) {
    const b = buildings[id - 1];
    if (!b || b.pendingUsd <= 0) continue;
    const from = levelForUsd(b.claimedUsd);
    const nb = { ...b, claimedUsd: b.claimedUsd + b.pendingUsd, pendingUsd: 0 };
    buildings[id - 1] = nb;
    if (levelForUsd(nb.claimedUsd) > from) queueMicrotask(() => emit({ type: "levelUp", building: nb, from }));
  }
  set({ buildings });
}

export function vote(ids: number[], token: DistrictId) {
  const s = get();
  const buildings = [...s.buildings];
  const votes = [...s.votes] as CityState["votes"];
  for (const id of ids) {
    const b = buildings[id - 1];
    if (!b || b.votedWeek === s.week) continue;
    buildings[id - 1] = { ...b, votedWeek: s.week };
    votes[token]++;
  }
  set({ buildings, votes });
}

export function focus(id: number) {
  emit({ type: "focus", id });
}

export function setLive(live: boolean) {
  set({ live });
}

/** Settles the week in the preview when the countdown reaches zero. */
export function settleIfDue(now: number) {
  const s = get();
  if (now < s.weekEnd) return;
  let best = 0;
  let idx = s.currentToken;
  let tie = false;
  s.votes.forEach((v, i) => {
    if (v > best) {
      best = v;
      idx = i as DistrictId;
      tie = false;
    } else if (v === best && v > 0) tie = true;
  });
  set({
    week: s.week + 1,
    weekEnd: nextDeadline(now),
    currentToken: best > 0 && !tie ? idx : s.currentToken,
    votes: [0, 0, 0, 0],
    newBuilds: [0, 0, 0, 0],
  });
}

/** Preview life: other residents keep building, buys happen, rewards accrue, some level up. */
export function tick() {
  const s = get();
  if (!s.live) return;
  const r = Math.random();
  if (r < 0.45 && s.buildings.length < MAX_BUILDINGS) {
    const d = Math.floor(Math.random() * 4) as DistrictId;
    const inviter = Math.random() < 0.35 ? 1 + Math.floor(Math.random() * Math.min(400, s.buildings.length)) : 0;
    build(NAMES[Math.floor(Math.random() * NAMES.length)], d, Math.floor(Math.random() * 3) as 0 | 1 | 2, inviter);
  } else if (r < 0.75) {
    // Another owner claims and grows a floor.
    const pick = s.buildings[Math.floor(Math.random() * s.buildings.length)];
    if (pick && pick.owner !== YOU) {
      const buildings = [...s.buildings];
      const from = levelForUsd(pick.claimedUsd);
      const nb = { ...pick, claimedUsd: Math.max(pick.claimedUsd, [5, 20, 50, 100][from - 1] ?? pick.claimedUsd + 50) };
      buildings[pick.id - 1] = nb;
      set({ buildings });
      if (levelForUsd(nb.claimedUsd) > from) emit({ type: "levelUp", building: nb, from });
    }
  } else {
    // A purchase: rewards accrue to everyone.
    const eth = 0.1 + Math.random() * 0.4;
    const usd = eth * s.ethUsd;
    const per = (usd * (70 / 85)) / s.buildings.length;
    const buildings = s.buildings.map((b) => ({ ...b, pendingUsd: Math.round((b.pendingUsd + per) * 100) / 100 }));
    const purchases = [{ at: Math.floor(Date.now() / 1000), token: s.currentToken, eth, tokens: usd / s.tokenUsd[s.currentToken], usd }, ...s.purchases].slice(0, 30);
    const holdings = [...s.holdings] as CityState["holdings"];
    holdings[s.currentToken] += usd / s.tokenUsd[s.currentToken];
    set({
      buildings,
      purchases,
      holdings,
      totalPurchases: s.totalPurchases + 1,
      totalBoughtUsd: s.totalBoughtUsd + usd,
      totalTaxEth: s.totalTaxEth + eth / 0.85,
    });
  }
}

export function districtOf(id: DistrictId) {
  return DISTRICTS[id];
}
