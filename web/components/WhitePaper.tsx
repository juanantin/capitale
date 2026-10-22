export default function WhitePaper() {
  return (
    <article className="tab paper">
      <h2>Capitale — White Paper</h2>
      <p className="muted small">Version 0.1 · draft for review</p>

      <h3>1. What is Capitale?</h3>
      <p>
        Capitale is a city-building game on Base. You burn $CAPITALE to build a palazzo on a toy map of Italy. Every
        palazzo is an NFT that receives a share of the city&apos;s weekly purchases of four tokens: STOCKIFY, STONKEX,
        DGUY and TEMU. Each token has its own district: Milano, Roma, Napoli and Venezia.
      </p>

      <h3>2. $CAPITALE and the city tax</h3>
      <ul>
        <li>$CAPITALE trades on Stonks Exchange, paired with ETH, in the 1% fee tier.</li>
        <li>The creator&apos;s share of that fee is sent to the CapitaleVault, in ETH. This is the city tax.</li>
        <li>70% of the tax buys this week&apos;s token for residents, 15% buys it for the weekly street pool, and 15% stays in ETH for operations (paid to a 2-of-3 multisig).</li>
      </ul>

      <h3>3. How purchases work</h3>
      <ul>
        <li>A keeper checks the vault every hour. Once 0.1 ETH or more is waiting, it buys, at most 0.6 ETH per order, one order at a time, at least 10 minutes apart. Anything left waits for the next hour.</li>
        <li>Every order is checked against the 30-minute Uniswap average price. If the fill is more than 4% worse, the order is rejected, the ETH stays in the vault and buying pauses for 6 hours.</li>
        <li>If nothing is bought for 24 hours, the keeper rests. Anyone can restart it by calling requestBuy().</li>
        <li>Tax that is not spent in a week rolls over to the next.</li>
      </ul>

      <h3>4. Buildings</h3>
      <ul>
        <li>3,000 palazzi in total. The Mayor&apos;s palazzo, #0, is minted at launch; it earns nothing and has no vote.</li>
        <li>To build: choose a district (Milano, Roma, Napoli, Venezia) and one of 3 styles. Both are permanent. Optionally enter the number of the building that invited you.</li>
        <li>Numbers are sequential across the city. Within a district, earlier buildings get the plots nearest the centre.</li>
        <li>Palazzi are normal NFTs: you can sell or transfer them. Unclaimed rewards and height move with the building.</li>
        <li>Invites are decorations only (flags, neon signs, fireworks). There is no referral income.</li>
        <li>When all 3,000 are built, the city is complete and building closes.</li>
      </ul>

      <h3>5. Price</h3>
      <ul>
        <li>Early bird: the first 300 palazzi cost $40, for 6 hours from launch. If they sell out early, the next phase opens when the 6 hours end.</li>
        <li>Then: #1–800 $52 · #801–1,500 $68 · #1,501–2,300 $88 · #2,301–3,000 $120.</li>
        <li>You pay by burning $CAPITALE: tokens burned = USD price ÷ $CAPITALE price. Burned tokens go to the dead address forever.</li>
        <li>During early bird the price used follows drops at once and follows rises only after they hold for 60 seconds. Afterwards it is the lower of the spot price and the 30-minute average, so pumping the price never makes building cheaper.</li>
        <li>You set a maximum burn. If the price moves above it, the build is cancelled.</li>
      </ul>

      <h3>6. Rewards</h3>
      <ul>
        <li>The residents&apos; 70% of each purchase is split equally among all palazzi that exist at that moment.</li>
        <li>Purchases during the early-bird window go to an early-bird pool, shared among the early-bird palazzi when the window ends.</li>
        <li>claim / claimMany pays all four tokens in one transaction. There is no cooldown and rewards never expire. If one token can&apos;t be transferred, it is skipped and stays claimable.</li>
      </ul>

      <h3>7. Height</h3>
      <p>
        A palazzo grows with the total value it has claimed (valued at purchase time): L1 $0 · L2 $5 · L3 $20 · L4 $50
        · L5 $100, then one more floor for every extra $50, with no limit. Height is cosmetic.
      </p>

      <h3>8. Weekly vote</h3>
      <ul>
        <li>Each palazzo has one vote per week for the token the city buys next week.</li>
        <li>Voting closes every Sunday at 20:00 Rome time. Most votes wins; a tie or no votes keeps the current token.</li>
        <li>A palazzo that already voted keeps that vote for the week even if it is sold.</li>
      </ul>

      <h3>9. Street competition</h3>
      <ul>
        <li>The district with the most new palazzi in the week wins the 15% street pool, shared equally by all its palazzi. Tied districts share.</li>
        <li>If nobody built that week, every district that has buildings shares the pool.</li>
        <li>After all 3,000 are built, the competition ends and the street pool is shared across the whole city.</li>
      </ul>

      <h3>10. Settlement</h3>
      <p>
        Weeks close automatically: the first vote, build, buy or claim after the Sunday deadline settles the past week
        (vote result and street pool). Anyone can also call settle().
      </p>

      <h3>11. Permissions and safety</h3>
      <ul>
        <li>Anyone: trigger buys, settle the week, pay out the ops share, restart the keeper.</li>
        <li>Residents: vote and claim for their own palazzi.</li>
        <li>Ops multisig (2-of-3): receives the 15% ops share, nothing else.</li>
        <li>No contract has a withdrawal function. Oracle, swap route and buy-rule changes go through a public 48-hour timelock. The NFT and the vault cannot be upgraded.</li>
      </ul>

      <h3>12. Risks</h3>
      <p className="muted">
        Reward tokens can fall in value or become illiquid. Smart contracts can have bugs; Capitale will be audited
        before mainnet, but audits do not remove all risk. Prices come from on-chain averages that can be wrong in
        extreme markets. Only use money you can afford to lose.
      </p>
    </article>
  );
}
