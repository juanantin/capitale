// Static facts about Capitale. Contract addresses are filled in after the testnet deploy.

export type DistrictId = 0 | 1 | 2 | 3;

export interface District {
  id: DistrictId;
  token: string;
  symbol: string;
  city: string;
  place: "milano" | "roma" | "napoli" | "venezia";
  landmark: string;
  colour: string; // main colour
  light: string;
  dark: string;
  tokenAddress: `0x${string}`;
  styles: [string, string, string];
}

export const DISTRICTS: District[] = [
  {
    id: 0,
    token: "STOCKIFY",
    symbol: "STFY",
    city: "Milano",
    place: "milano",
    landmark: "Duomo",
    colour: "#f2c94c",
    light: "#fbe9a6",
    dark: "#c99a1f",
    tokenAddress: "0xC6405D7a226e1C18E559Be2F335F74C01Ad07bF5",
    styles: ["Torre della Borsa", "Atelier", "Bosco Verticale"],
  },
  {
    id: 1,
    token: "STONKEX",
    symbol: "STONKEX",
    city: "Roma",
    place: "roma",
    landmark: "Colosseo",
    colour: "#f2994a",
    light: "#fbcfa6",
    dark: "#c96a1f",
    tokenAddress: "0x5ab000ff9B9FfE0349CE5ffA5fD86f217C3680F5",
    styles: ["Tempietto", "Villa Romana", "Fontana"],
  },
  {
    id: 2,
    token: "DGUY",
    symbol: "DGUY",
    city: "Napoli",
    place: "napoli",
    landmark: "Vesuvio",
    colour: "#6fcf97",
    light: "#bdeccf",
    dark: "#3a9c63",
    tokenAddress: "0xe34356dcd3d7bb991248f322e4ec31b5d60bc54e",
    styles: ["Pizzeria", "Palazzo dei Quartieri", "Teatro"],
  },
  {
    id: 3,
    token: "TEMU",
    symbol: "TEMU",
    city: "Venezia",
    place: "venezia",
    landmark: "Campanile",
    colour: "#56ccf2",
    light: "#b5e9fa",
    dark: "#2a93bd",
    tokenAddress: "0x3c573bdd88008c94f025e5023212f28e5f39744c",
    styles: ["Palazzo sul Canale", "Fornace di Murano", "Bottega delle Maschere"],
  },
];

export const MAX_BUILDINGS = 3000;
export const EARLY_BIRD_UNITS = 300;
export const EARLY_BIRD_USD = 40;
export const TIERS = [
  { upTo: 800, usd: 52 },
  { upTo: 1500, usd: 68 },
  { upTo: 2300, usd: 88 },
  { upTo: 3000, usd: 120 },
];

export const CAPITALE_ADDRESS: string | null = null; // set at launch
export const STONKS_URL = "https://stonks.exchange";

export function usdForBuilding(id: number, earlyBird: boolean): number {
  if (earlyBird && id <= EARLY_BIRD_UNITS) return EARLY_BIRD_USD;
  return (TIERS.find((t) => id <= t.upTo) ?? TIERS[TIERS.length - 1]).usd;
}

/** L1 $0, L2 $5, L3 $20, L4 $50, L5 $100, then +1 per extra $50 (same rule as the vault). */
export function levelForUsd(usd: number): number {
  if (usd < 5) return 1;
  if (usd < 20) return 2;
  if (usd < 50) return 3;
  if (usd < 100) return 4;
  return 5 + Math.floor((usd - 100) / 50);
}

export function usdForNextLevel(level: number): number {
  return [0, 5, 20, 50, 100][level] ?? 100 + (level - 4) * 50;
}
