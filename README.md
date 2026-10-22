# Capitale

A toy city of Italy on Base: burn $CAPITALE to build a palazzo, earn a share of the
weekly token purchases, vote for next week's token, grow your building by claiming.
Replica of Stockopolis — see `CLAUDE.md` (brief), `docs/stockopolis-reference.md` (spec)
and `docs/DECISIONS.md` (how ambiguities were resolved).

## Contracts (`src/`)
| Contract | What it does |
|---|---|
| `CapitaleNFT` | Buildings (ERC-721 "PALAZZO"), 3,000 + Mayor #0, burn-to-build |
| `CapitalePricing` | Early bird / tier USD prices, $CAPITALE price rules |
| `CapitaleVault` | Tax split, buys, dividends, height, weekly vote, street race |
| `libraries/RomeTime` | Sunday 20:00 Rome deadline with daylight saving |

## Develop
```sh
forge build
forge test            # unit + fuzz + invariant tests
```
## Website preview (`web/`)
Next.js + PixiJS, unplugged (sample data, no wallet yet).
```sh
cd web && npm install && npm run dev
```
On Vercel it deploys as-is: `vercel.json` builds `web/` and serves the static export (`web/out`).
No Root Directory setting needed (setting it to `web` also works).

Status: **not audited**. Do not deploy to mainnet without a professional audit.
