# Step 1 decisions (contracts + tests)

Where the Stockopolis white paper is ambiguous, this is how Capitale reads it.
Change any of these by asking Claude; none is hard to revisit before deployment.

## Contracts
- `CapitalePricing` — USD price per building and tokens to burn. Owner = 48h timelock.
- `CapitaleNFT` — the buildings ("Capitale" / PALAZZO). No owner powers, not upgradeable,
  no royalties. On-chain `tokenURI` (name, simple SVG, district, city, style, level,
  invites, plot, early bird). Enumerable, so wallets can list their buildings on-chain.
- `CapitaleVault` — tax split, buys, dividends, early-bird pool, height, weekly vote,
  street race, settlement. Not upgradeable. Owner = 48h timelock, limited to: oracle,
  swap adapters, buy parameters, ops address.
- `RomeTime` library — "Sunday 20:00 Rome" computed on-chain from the EU daylight-saving
  rule (18:00 UTC in summer, 19:00 UTC in winter). No keeper needed for the schedule.

## Interpretations
- **Early bird**: open 6h from `startTime`. If the 300 sell out sooner, building pauses
  until the 6h are over, then tier 1 opens. Unsold early-bird numbers are sold at tier 1.
- **Early-bird reference price**: drops are followed at once; a rise is adopted only after
  the price has stayed above the reference for 60s, and then at the lowest level seen
  during those 60s. The very first reading uses min(spot, TWAP).
- **Burn rounding**: tokens to burn are rounded up (never below the USD target).
- **Inviter 0 = no inviter** (so the Mayor cannot be named as inviter). Self-invites and
  unknown numbers are ignored, not rejected. Cosmetic only.
- **Buys are synchronous**: `requestBuy()` swaps in the same transaction through a
  whitelisted adapter, so "one order at a time" holds automatically. A fill below the
  oracle reference minus 4% is rejected: the ETH stays in the vault and buying pauses 6h.
  Only the downside is checked (getting more tokens than expected is not rejected).
- **`requestBuy()` never reverts on rules** (paused, too soon, below minimum); it returns
  false and emits `BuySkipped`. It always counts as "activity", which is how anyone
  restarts an idle keeper (`schedulerActive()` is false after 24h without a buy or request).
- **Purchase-time USD value** = ETH spent × ETH/USD at the moment of the buy. This drives
  `pendingUsd(id)` and the building height.
- **Early-bird pool**: residents' 70% of buys during the 6h window. When the window ends
  it is shared among early-bird buildings; if there are none, it goes to everyone.
  The street 15% keeps going to the weekly street pool during early bird.
- **Street ties**: the pool is split per building across all tied districts (a district
  with more buildings takes a larger total share).
- **Nobody to pay** (no buildings yet): residents' tokens wait in `carry`, street pools
  roll over to next week.
- **Settlement** catches up at most 52 missed weeks per call (call again for more).
- **WETH income** can be unwrapped by anyone with `unwrapWeth()`.
- **Ops address** can be changed through the timelock (so funds are not stuck if the
  multisig must be replaced). It only ever receives the 15% ops share.

## Default parameters (to be resized once the real fee income is known)
- Buy minimum 0.1 ETH, maximum 0.6 ETH per order, 10 min between orders,
  4% max deviation, 6h pause after a rejected order.

## Confirmed by Juan (22 Oct 2026)
- $CAPITALE is paired with **ETH** on Stonks Exchange (Stockopolis pairs with BNB); the
  creator fee reaches the vault in ETH.
- All four reward tokens trade on **Uniswap v4** on Base:
  - STOCKIFY (STFY) `0xC6405D7a226e1C18E559Be2F335F74C01Ad07bF5`
  - STONKEX `0x5ab000ff9B9FfE0349CE5ffA5fD86f217C3680F5`
  - DGUY `0xe34356dcd3d7bb991248f322e4ec31b5d60bc54e`
  - TEMU `0x3c573bdd88008c94f025e5023212f28e5f39744c`
  (still to verify on Basescan in step 2: pools, fee tiers, liquidity)

# Preview website (web/) decisions
- Unplugged preview: all numbers are sample data (`web/lib/store.ts`); swapped for live
  contract reads after the Base Sepolia deploy.
- Italy is rebuilt from Natural Earth geodata (`web/scripts/build-italy.mjs`), not the
  generated base map, so the coastline is exact.
- Districts own the land closest to their city. Inside a district, plot 1 is next to the
  city's landmark and plots grow outwards (the contract's plot number decides the spot).
- Height: ground floor + one floor per level above 1 + the style's roof. No cap.
- Art is drawn in code (vector shapes) until Juan's sprites are processed; Vercel runs
  `scripts/fetch-assets.mjs` before each build to download, clean and use them.
