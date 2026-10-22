# Stockopolis ("Stock City") — reference spec, summarised from its white paper

Source: the Stockopolis white paper (English machine translation of the Chinese original),
supplied by Juan. Token on BNB Chain: 0xaacbc156435dbab7815a61bccba1c827e52a7777
(Flap tax token). Contracts named in it: StockCity Token, CityNFT, CityPricing, CityVault.
All functions are said to be verified on BscScan; read them there for exact behaviour.

## Tax
- 1% buy tax + 1% sell tax, fixed at launch, 100% to CityVault (paid in BNB).
- Of the tax: 70% bought into stock for residents, 15% bought into stock for the weekly
  "street supply" pool, 15% kept as BNB for operations (sent to a 2-of-3 multisig).

## Buying the reward asset
- Scheduled service checks hourly; buys once >= 0.5 BNB has accumulated, max 3 BNB per
  order, one order at a time, >= 10 min between orders, remainder next hour.
- On arrival, price checked against a reference (Chainlink, or 30-min DEX average if no
  feed). If off by more than 4%, order rejected, BNB returned (minus fee), buying paused 6h.
- If nothing is bought for 24h the scheduler pauses; anyone can call requestBuy() to restart.

## Buildings (CityNFT)
- 3,000 residential buildings max; then the city is "locked" (no more building).
- Building #0 = Mayor's building, minted at deploy, gets no dividends and no vote.
- mint(district, style, inviter, maxPrice): choose 1 of 4 districts and 1 of 3 styles,
  both permanent. Tokens paid are sent to the burn address.
- Numbered sequentially city-wide; within a district, plots are assigned nearest-to-farthest
  from the Mayor (earlier = closer to the centre).
- Freely transferable NFTs. Unclaimed dividends and building height stay with the building.
  A building that already voted this week cannot vote again for the new owner until next week.
- Inviter (building number): decorations only — flag, neon sign, fireworks. No profit share.

## Price (USD target, paid by burning the token)
- Early bird: 300 units at 40 USD, open 6 hours; when sold out, next phase opens 6h later.
- Tier 1 (#<=800) 52 USD · Tier 2 (#801-1500) 68 · Tier 3 (#1501-2300) 88 · Tier 4 (#2301-3000) 120.
- Tokens to burn = target USD / token price. Early bird: reference price, follows drops
  immediately, rises only after holding 60s. Afterwards: the LOWER of spot and a 30-60 min
  average price (pool's built-in TWAP once on the DEX). Builder sets a max; if exceeded, revert.

## Dividends
- Residents' 70% of each purchase is split equally among buildings existing at purchase time.
- Early-bird-period purchases go to an early-bird pool, shared among early-bird buildings
  when that period ends.
- claim(id) / claimMany(ids): pays all reward assets at once, no cooldown, no expiry; a paused
  asset is skipped and stays claimable. pendingUsd(id) shows value in USD.

## Building height (cosmetic)
- Height = cumulative USD value claimed, valued at purchase-time price.
- L1 $0 · L2 >= $5 · L3 >= $20 · L4 >= $50 · L5 >= $100 · then +1 level per extra $50, no cap.

## Weekly vote and street competition
- One vote per building per week: vote(ids, asset) / voteAll(asset). Picks next week's asset.
- Deadline Sunday 20:00 (Beijing time). Most votes wins; no votes or a tie = unchanged.
- Street win: the district with the most NEW buildings this week gets the 15% street pool,
  split equally among its buildings; ties share; if nobody built, all built districts share.
- After all 3,000 are built, the street competition stops; the pool is shared city-wide.
- settle() runs lazily on the next vote/build/buy/claim after the deadline; anyone may call it.
  Unspent tax rolls over to next week.

## Permissions
- Anyone: trigger buys, settlement, ops payout, restart scheduler (rule-bound).
- Residents: vote and claim for their own buildings.
- Multisig 2/3: receives the 15% ops fee, nothing else.
- Vault upgradeable only by the platform guardian; pricing/protection changes need a 48h
  public notice. NFT contract not upgradeable. No withdrawal backdoor.
