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
Status: **not audited**. Do not deploy to mainnet without a professional audit.
