# CAPITALE — project brief for Claude Code

Capitale is an exact replica of **Stockopolis ("Stock City")** on Base, with a toy map of
Italy and four crypto tokens instead of four US stocks. The owner, Juan, is an animation
director with little Solidity experience: work autonomously, explain decisions in plain
language, and ask only when a decision is genuinely his.

**The spec is `docs/stockopolis-reference.md`. Copy every mechanic in it.** This brief
only lists what changes for Capitale. When in doubt, do what Stockopolis does.

## What changes vs Stockopolis
| Stockopolis (BNB Chain) | Capitale (Base) |
|---|---|
| BNB | ETH |
| Flap tax token, 1% buy + 1% sell | $CAPITALE on Stonks Exchange at the 1% fee tier (decided by Juan); the creator's share of that fee is redirected to the vault after launch |
| Flap VaultEx + Flap scheduled service | Whitelisted DEX router + keeper bot with the same rules |
| 4 stock tokens: NVDAB, SPCXB, TSLAB, AAPLB | 4 tokens: STOCKIFY, STONKEX, DGUY, TEMU |
| 4 Chinese-named streets | 4 Italian cities (table below) |
| Chainlink / DEX average reference price | DEX TWAP on Base for all four tokens (no Chainlink feeds for them) |
| Beijing time weekly deadline | Sunday 20:00 Rome time (Europe/Rome: CET in winter, CEST in summer) |

## Districts (locked)
| Banner (big) | City (small) | Colour | Landmark |
|---|---|---|---|
| STOCKIFY | Milano | gold | Duomo spires |
| STONKEX | Roma | orange | Colosseum |
| DGUY | Napoli | green | Vesuvius + pizzeria |
| TEMU | Venezia | blue | Campanile + gondola |

Token name BIG on each banner, city name small underneath. The token currently being
bought (this week's vote winner) gets a "THIS WEEK" tag. Torino, Firenze and Sicilia art
exists for possible later districts, but Stockopolis has exactly 4: keep 4.

## Mechanics to implement (from the reference, with Capitale values)
- **Tax:** 100% of the vault's fee income: 70% buys the week's token for residents, 15%
  buys it for the weekly street pool, 15% stays in ETH for operations (2-of-3 multisig).
- **Buying:** accumulate, buy at a minimum order size, cap per order, one order at a time,
  minimum interval, price check against the reference with a max deviation (Stockopolis:
  0.5 BNB / 3 BNB / 10 min / 4% / 6h pause / 24h idle pause). Scale the ETH thresholds to
  similar USD values and keep them as constructor parameters. Anyone can call requestBuy().
- **Buildings (CityNFT → CapitaleNFT):** 3,000 + Mayor #0 at deploy; mint(district, style,
  inviter, maxPrice); 4 districts × 3 styles, permanent; burn to dead address; sequential
  numbers; plots per district nearest-to-farthest from the centre; freely transferable;
  rewards and height follow the NFT; vote lock after transfer within the week; invite
  decorations only. Non-upgradeable. Name "Capitale", symbol "PALAZZO", no royalties.
  tokenURI returns name, image and attributes (district, style, level, invites).
- **Pricing (CityPricing → CapitalePricing):** early bird 300 units at 40 USD for 6h,
  then tiers 52 / 68 / 88 / 120 USD at #800 / #1500 / #2300 / #3000; tokens to burn =
  USD target / price; early-bird reference price (drops follow instantly, rises after 60s);
  afterwards the lower of spot and a 30-60 min TWAP; revert above the builder's max.
- **Dividends (CityVault → CapitaleVault):** residents' share split equally across
  buildings existing at purchase time; early-bird pool shared among early-bird buildings
  when that period ends; claim / claimMany pay all four tokens at once, skipping any that
  fail to transfer; pendingUsd(id).
- **Height:** cumulative claimed USD at purchase-time value; L1 $0, L2 $5, L3 $20, L4 $50,
  L5 $100, then +1 level per extra $50, no cap. Cosmetic only.
- **Weekly vote:** one vote per building per week (not Mayor); vote(ids, token) /
  voteAll(token); most votes picks next week's token; no votes or tie = unchanged.
- **Street competition:** the district with the most new buildings this week wins the 15%
  street pool, split among its buildings; ties share; nobody built = all built districts
  share; after 3,000 buildings, shared city-wide.
- **Settlement:** lazy settle() on the next vote/build/buy/claim after the deadline;
  anyone may call it; unspent tax rolls over.
- **Permissions:** no withdrawal backdoor; multisig only receives the 15% ops share;
  pricing/protection changes behind a 48h timelock; NFT not upgradeable. Prefer a
  non-upgradeable vault too (we have no Flap guardian); if upgradeable, timelock it.

## Visual style (locked)
Minimal, toy-like, cel-shaded isometric mobile-game art (Townscaper / Monument Valley /
Clash of Clans): pastel-bright flat colours, rounded chunky shapes, pastel-green island with
a sandy rim on a flat turquoise sea. "CAPITALE" logo top right, built as SVG/HTML. Juan is
an animation director: motion and polish matter (smoke puffs, boats, build pop-in,
buildings growing a floor when they level up, fireworks on invited buildings).

## Assets
`assets/manifest.json` lists the generated art: base map, landmark sprites, a house sheet
and two final mockups as the style reference. Download into `assets/raw/`, remove white
backgrounds, slice the house sheet, export WebP.
Now also included: 3 building styles per district (12 sprites, transparent backgrounds),
the Mayor's building (#0) and a 3-piece floor kit. Build height procedurally (ground
floor + N middle floors + roof, tinted per district) so levels have no cap. Decide in
the frontend how a level shows on a styled building (e.g. extra floors stacked under the
style's top, or the floor kit for L2+). Check transparency edges and stacking alignment;
list any sprite that needs regenerating for Juan.
If the base map's outline of Italy is inaccurate, rebuild the island from real geodata
(Natural Earth via d3-geo) styled to match.

## Frontend
Copy the Stockopolis screens: token header (name, CA, "via Stonks Exchange"); city stats
(residents x/3000, total city tax, total purchases, this week's token); the map with
pan/zoom; tabs Build, My Palazzo, Town Hall (vote), Rankings (street competition and
tallest buildings), Treasury, White Paper, Il Sindaco; build flow (district → style →
inviter number → approve once → build with max burn); My Palazzo (pending USD, claim,
level, vote status). All text is HTML/SVG overlay. Next.js + wagmi/viem + PixiJS. Must
run smoothly on phones. Write Capitale's own white paper page mirroring Stockopolis's.

## Existing code
`contracts/Capitale.sol` is an older single-contract draft. Reuse its dividend
accounting, burn-to-build and invite logic, but rebuild as CapitaleNFT, CapitalePricing and
CapitaleVault per the reference. Its fixed-weight split is obsolete: Capitale uses the
weekly vote.

## Build order
1. Foundry project; the three contracts; full tests (minting, numbering and plots, tiers
   and early bird, price rules, tax split, buy rules and rejection/pause, dividends and
   early-bird pool, claims with a failing token, height levels, votes and transfer lock,
   street competition incl. ties, settle and rollover, permissions); fuzz + invariants.
2. TWAP price reading for $CAPITALE and the four reward tokens on Base.
3. Mocks + Base Sepolia deploy + end-to-end demo.
4. Keeper bot (hourly check, requestBuy, settle).
5. Asset pipeline and missing art list.
6. Frontend against Base Sepolia.
7. Slither/Aderyn + an auditor checklist.

## Open questions to verify (do not assume)
- Base addresses for STOCKIFY (STFY), DGUY and TEMU; STONKEX reported at
  0x5ab000ff9b9ffe0349ce5ffa5fd86f217c3680f5 (verify on Basescan).
- Liquidity of each token on Base: enough for the buys without moving price past the
  deviation limit?
- Fee tier is decided: 1%. Verify what share of that 1% reaches the creator address (and so
  the vault) versus the protocol, and size the buy thresholds to that real income.
- What $CAPITALE is paired with on Stonks Exchange and in what asset the fee is paid.
- Router to whitelist.
- Weekly deadline is fixed by Juan: Sunday 20:00 Rome time. The contract works in UTC, so
  handle daylight saving (18:00 UTC in summer, 19:00 UTC in winter) via a keeper-updated
  or precomputed schedule, and show the countdown in Rome time on the frontend.
- "TEMU" is a real company's brand: remind Juan of the trademark risk before launch.

## Rules
- Never ask for, print or store private keys or seed phrases. Use a gitignored `.env` or a
  browser/hardware wallet.
- Never deploy to mainnet or send real funds without Juan's explicit confirmation.
- Recommend a professional audit before mainnet; tests do not replace it.
- Invites stay cosmetic. Never add profit-sharing referrals.
