"use client";

import { useEffect, useMemo, useState } from "react";
import { DISTRICTS, DistrictId, EARLY_BIRD_UNITS, MAX_BUILDINGS, TIERS, levelForUsd, usdForNextLevel } from "../lib/config";
import { formatCountdown } from "../lib/romeTime";
import { approve, buildMine, claim, focus, getCity, quoteBuild, useCity, vote } from "../lib/store";
import { describeError, testActions } from "../lib/chain";

const fmt = (n: number, d = 0) => n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
const usd = (n: number) => `$${fmt(n, n < 100 ? 2 : 0)}`;

export function useNow(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function romeTime(unix: number) {
  return new Date(unix * 1000).toLocaleString("en-GB", {
    timeZone: "Europe/Rome",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Runs an action: a real wallet transaction on testnet, a short fake delay in preview. */
function useTx(): [string | null, (label: string, fn: () => unknown) => void, string | null] {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = (label: string, fn: () => unknown) => {
    setPending(label);
    setError(null);
    const preview = getCity().mode === "preview";
    (async () => {
      if (preview) await new Promise((r) => setTimeout(r, 1100));
      await fn();
    })()
      .catch((e) => setError(describeError(e)))
      .finally(() => setPending(null));
  };
  return [pending, run, error];
}

function TxError({ error }: { error: string | null }) {
  return error ? <p className="err-box">{error}</p> : null;
}

// ─────────── Build ───────────

export function BuildTab() {
  const city = useCity();
  const [district, setDistrict] = useState<DistrictId | null>(null);
  const [style, setStyle] = useState<0 | 1 | 2 | null>(null);
  const [inviter, setInviter] = useState("");
  const [pending, run, error] = useTx();
  const [done, setDone] = useState<number | null>(null);
  const q = quoteBuild();
  const maxBurn = Math.ceil(q.tokens * 1.02);
  const testnet = city.mode === "testnet";
  const maxBurnWei = testnet && city.chain?.quote ? (city.chain.quote.tokensWei * 102n) / 100n : BigInt(maxBurn) * 10n ** 18n;
  const unavailable = testnet ? (!city.chain ? "Load a test city in the Test lab first." : city.chain.quoteError) : null;
  const short = testnet && !!city.chain?.quote && city.chain.capitaleWei < city.chain.quote.tokensWei;
  const full = city.buildings.length >= MAX_BUILDINGS;
  const invNum = parseInt(inviter, 10);
  const invOk = !inviter || (invNum > 0 && invNum < q.id);

  if (done) {
    return (
      <div className="tab">
        <div className="success">
          <div className="big">🎉 Palazzo #{done} is up!</div>
          <p>It earns a share of every purchase from now on. Claim to make it grow.</p>
          <div className="row">
            <button className="btn" onClick={() => focus(done)}>Show on map</button>
            <button className="btn ghost" onClick={() => { setDone(null); setDistrict(null); setStyle(null); setInviter(""); }}>Build another</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tab">
      <div className="price-card">
        <div>
          <div className="muted">Next building</div>
          <div className="big">#{fmt(q.id)}</div>
        </div>
        <div>
          <div className="muted">Price</div>
          <div className="big">{usd(q.usd)}</div>
        </div>
        <div>
          <div className="muted">Burn</div>
          <div className="big">{fmt(q.tokens)}</div>
          <div className="muted small">$CAPITALE</div>
        </div>
      </div>

      <h3><span className="step">1</span> Choose a district</h3>
      <div className="district-grid">
        {DISTRICTS.map((d) => (
          <button key={d.id} className={`district-btn ${district === d.id ? "on" : ""}`} style={{ ["--c" as string]: d.colour, ["--cl" as string]: d.light }} onClick={() => { setDistrict(d.id); setStyle(null); }}>
            <span className="dt">{d.token}</span>
            <span className="dc">{d.city}</span>
            <span className="dn">{fmt(city.districtCount[d.id])} built</span>
            {city.currentToken === d.id && <span className="tag">THIS WEEK</span>}
          </button>
        ))}
      </div>

      {district !== null && (
        <>
          <h3><span className="step">2</span> Choose a style <span className="muted small">(permanent)</span></h3>
          <div className="style-grid">
            {DISTRICTS[district].styles.map((name, i) => (
              <button key={name} className={`style-btn ${style === i ? "on" : ""}`} style={{ ["--c" as string]: DISTRICTS[district].colour }} onClick={() => setStyle(i as 0 | 1 | 2)}>
                <StyleIcon district={district} style={i} />
                <span>{name}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {style !== null && district !== null && (
        <>
          <h3><span className="step">3</span> Invited by <span className="muted small">(optional building number)</span></h3>
          <input className="input" inputMode="numeric" placeholder="e.g. 42" value={inviter} onChange={(e) => setInviter(e.target.value.replace(/\D/g, ""))} />
          <p className="muted small">Invites are decorations only: flags, neon signs and fireworks on the inviter's building. Nobody earns from invites.</p>
          {!invOk && <p className="warn small">That building doesn't exist yet.</p>}

          <h3><span className="step">4</span> Build</h3>
          <div className="row">
            <button className="btn" disabled={city.approved || !!pending} onClick={() => run("approve", approve)}>
              {city.approved ? "✓ Approved" : pending === "approve" ? "Confirm in wallet…" : "Approve $CAPITALE"}
            </button>
            <button className="btn primary" disabled={!city.approved || !invOk || full || !!pending || !!unavailable || short} onClick={() => run("build", async () => {
              const id = await buildMine(district, style, invNum || 0, maxBurnWei);
              if (id) {
                setDone(id);
                setTimeout(() => focus(id), 600);
              }
            })}>
              {pending === "build" ? "Building…" : `Build (max ${fmt(maxBurn)})`}
            </button>
          </div>
          <p className="muted small">Approve once. The build reverts if the burn would be above your max (quote + 2%). Tokens go to the burn address.</p>
          {unavailable && <p className="warn small">{unavailable}</p>}
          {short && <p className="warn small">Not enough test $CAPITALE: get some in the 🧪 Test lab.</p>}
          <TxError error={error} />
        </>
      )}
      {!testnet && <p className="preview-note">Preview mode: no wallet, nothing is sent on-chain.</p>}
    </div>
  );
}

function StyleIcon({ district, style }: { district: number; style: number }) {
  const D = DISTRICTS[district];
  const roof = style === 1 ? <path d="M6 20 L20 8 L34 20 Z" fill="#e07a5f" stroke="#5b4636" strokeWidth="1.5" /> : style === 2 ? <ellipse cx="20" cy="18" rx="9" ry="8" fill={D.light} stroke="#5b4636" strokeWidth="1.5" /> : <path d="M20 4 V14" stroke="#5b4636" strokeWidth="1.5" />;
  return (
    <svg viewBox="0 0 40 44" width="44" height="48" aria-hidden>
      <rect x="8" y={style === 0 ? 10 : 20} width="24" height={style === 0 ? 30 : 20} rx="2" fill={D.colour} stroke="#5b4636" strokeWidth="1.5" />
      {roof}
      <rect x="13" y="28" width="5" height="5" fill="#fff6d8" />
      <rect x="22" y="28" width="5" height="5" fill="#fff6d8" />
    </svg>
  );
}

// ─────────── My Palazzo ───────────

export function MyPalazzoTab() {
  const city = useCity();
  const mine = useMemo(() => city.buildings.filter((b) => b.owner === city.me), [city.buildings, city.me]);
  const [pending, run, error] = useTx();
  const totalPending = mine.reduce((s, b) => s + b.pendingUsd, 0);
  const unvoted = mine.filter((b) => b.votedWeek !== city.week).length;

  if (mine.length === 0) {
    return (
      <div className="tab">
        <p>You don&apos;t own a palazzo yet. Head to <b>Build</b> to put one on the map.</p>
      </div>
    );
  }
  return (
    <div className="tab">
      <div className="price-card">
        <div>
          <div className="muted">Buildings</div>
          <div className="big">{mine.length}</div>
        </div>
        <div>
          <div className="muted">Pending</div>
          <div className="big">{usd(totalPending)}</div>
        </div>
        <div>
          <div className="muted">Votes left</div>
          <div className="big">{unvoted}</div>
        </div>
      </div>
      <button className="btn primary wide" disabled={totalPending <= 0 || !!pending} onClick={() => run("all", () => claim(mine.map((b) => b.id)))}>
        {pending === "all" ? "Claiming…" : `Claim all (${usd(totalPending)})`}
      </button>
      {city.chain && ((!city.chain.isEarlyBird && !city.chain.earlyBirdFinalized) || city.chain.blockTime >= city.weekEnd) && (
        <div className="ok-box">
          Rewards are waiting to be paid out (early bird ended or the week closed).{" "}
          <button className="btn small" disabled={!!pending} onClick={() => run("settle", () => testActions.settle())}>
            {pending === "settle" ? "…" : "Settle now"}
          </button>
        </div>
      )}
      <p className="muted small">One claim pays all four tokens. Claiming is what makes your building taller.</p>
      <TxError error={error} />
      <div className="list">
        {mine.map((b) => {
          const D = DISTRICTS[b.district];
          const lvl = levelForUsd(b.claimedUsd);
          const lo = usdForNextLevel(lvl - 1);
          const hi = usdForNextLevel(lvl);
          const pct = Math.min(100, ((b.claimedUsd - lo) / (hi - lo)) * 100);
          return (
            <div key={b.id} className="pal-card" style={{ ["--c" as string]: D.colour }}>
              <button className="pal-head" onClick={() => focus(b.id)}>
                <span className="lvl">L{lvl}</span>
                <span>
                  <b>#{b.id}</b> {D.city} · {D.styles[b.style]}
                  <span className="muted small block">{D.token} district · plot {b.plot + 1}</span>
                </span>
              </button>
              <div className="bar"><i style={{ width: `${pct}%` }} /></div>
              <div className="muted small">{usd(b.claimedUsd)} claimed · next floor at {usd(hi)}</div>
              <div className="pal-foot">
                <span>Pending <b>{usd(b.pendingUsd)}</b></span>
                <span className={b.votedWeek === city.week ? "ok" : "warn"}>{b.votedWeek === city.week ? "✓ Voted" : "Not voted"}</span>
                <button className="btn small" disabled={b.pendingUsd <= 0 || !!pending} onClick={() => run(`c${b.id}`, () => claim([b.id]))}>
                  {pending === `c${b.id}` ? "…" : "Claim"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────── Town Hall ───────────

export function TownHallTab() {
  const city = useCity();
  const now = useNow();
  const [pending, run, error] = useTx();
  const total = city.votes.reduce((a, b) => a + b, 0);
  const max = Math.max(...city.votes);
  const leaders = city.votes.filter((v) => v === max && v > 0).length;
  const mineUnvoted = city.buildings.filter((b) => b.owner === city.me && b.votedWeek !== city.week).map((b) => b.id);
  return (
    <div className="tab">
      <div className="countdown">
        <div className="muted">Vote closes in</div>
        <div className="big mono">{formatCountdown(city.weekEnd - now)}</div>
        <div className="muted small">Sunday 20:00 Rome time · {romeTime(city.weekEnd)}</div>
      </div>
      <p>Each building has one vote per week. The token with the most votes is bought all next week. A tie or no votes keeps the current token.</p>
      <div className="votes">
        {DISTRICTS.map((d) => {
          const v = city.votes[d.id];
          const pct = total ? (v / total) * 100 : 0;
          return (
            <div key={d.id} className="vote-row" style={{ ["--c" as string]: d.colour }}>
              <div className="vote-label">
                <b>{d.token}</b> <span className="muted small">{d.city}</span>
                {city.currentToken === d.id && <span className="tag">THIS WEEK</span>}
                {v === max && v > 0 && leaders === 1 && <span className="tag lead">LEADING</span>}
              </div>
              <div className="bar big"><i style={{ width: `${pct}%` }} /><span>{fmt(v)} · {pct.toFixed(0)}%</span></div>
              <button className="btn small" disabled={!mineUnvoted.length || !!pending} onClick={() => run(`v${d.id}`, () => vote(mineUnvoted, d.id))}>
                {pending === `v${d.id}` ? "…" : `Vote all (${mineUnvoted.length})`}
              </button>
            </div>
          );
        })}
      </div>
      <TxError error={error} />
      <p className="muted small">The Mayor&apos;s building does not vote. A building that already voted this week can&apos;t vote again after being sold, until next week.</p>
    </div>
  );
}

// ─────────── Rankings ───────────

export function RankingsTab() {
  const city = useCity();
  const now = useNow();
  const max = Math.max(1, ...city.newBuilds);
  const tallest = useMemo(() => [...city.buildings].sort((a, b) => b.claimedUsd - a.claimedUsd).slice(0, 10), [city.buildings]);
  const inviters = useMemo(() => [...city.buildings].filter((b) => b.invites > 0).sort((a, b) => b.invites - a.invites).slice(0, 5), [city.buildings]);
  return (
    <div className="tab">
      <h3>Street competition · this week</h3>
      <p className="muted small">The district with the most new buildings wins this week&apos;s 15% street pool, shared by all its buildings. Ends in {formatCountdown(city.weekEnd - now)}.</p>
      <div className="votes">
        {DISTRICTS.map((d) => (
          <div key={d.id} className="vote-row" style={{ ["--c" as string]: d.colour }}>
            <div className="vote-label">
              <b>{d.city}</b> <span className="muted small">{d.token}</span>
              {city.newBuilds[d.id] === max && <span className="tag lead">👑 LEADING</span>}
            </div>
            <div className="bar big"><i style={{ width: `${(city.newBuilds[d.id] / max) * 100}%` }} /><span>{city.newBuilds[d.id]} new</span></div>
          </div>
        ))}
      </div>
      <h3>Tallest buildings</h3>
      <ol className="rank">
        {tallest.map((b, i) => (
          <li key={b.id} onClick={() => focus(b.id)}>
            <span className="pos">{i + 1}</span>
            <span className="dot" style={{ background: DISTRICTS[b.district].colour }} />
            <span>#{b.id} · {DISTRICTS[b.district].city}</span>
            <b>L{levelForUsd(b.claimedUsd)}</b>
            <span className="muted small">{usd(b.claimedUsd)}</span>
          </li>
        ))}
      </ol>
      <h3>Most invites 🎆</h3>
      <ol className="rank">
        {inviters.map((b, i) => (
          <li key={b.id} onClick={() => focus(b.id)}>
            <span className="pos">{i + 1}</span>
            <span className="dot" style={{ background: DISTRICTS[b.district].colour }} />
            <span>#{b.id} · {DISTRICTS[b.district].city}</span>
            <b>{b.invites}</b>
            <span className="muted small">invites</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─────────── Treasury ───────────

export function TreasuryTab() {
  const city = useCity();
  const now = useNow();
  return (
    <div className="tab">
      <div className="stat-grid">
        <div><span className="muted">Total city tax</span><b>{fmt(city.totalTaxEth, 2)} ETH</b></div>
        <div><span className="muted">Purchases</span><b>{fmt(city.totalPurchases)}</b></div>
        <div><span className="muted">Bought for residents</span><b>{usd(city.totalBoughtUsd)}</b></div>
        <div><span className="muted">Paid to ops</span><b>{fmt(city.opsPaidEth, 2)} ETH</b></div>
      </div>
      <h3>Where the tax goes</h3>
      <div className="split">
        <i style={{ flex: 70, background: "#6fcf97" }}>70% residents</i>
        <i style={{ flex: 15, background: "#f2c94c" }}>15% street</i>
        <i style={{ flex: 15, background: "#c9c2ea" }}>15% ops</i>
      </div>
      <p className="muted small">The 1% Stonks Exchange fee on $CAPITALE (creator share) flows to the vault in ETH. 85% buys this week&apos;s token; 15% stays in ETH for operations (2-of-3 multisig).</p>
      <h3>Waiting to buy</h3>
      <div className="stat-grid">
        <div><span className="muted">Residents</span><b>{fmt(city.residentsEth, 3)} ETH</b></div>
        <div><span className="muted">Street pool</span><b>{fmt(city.streetEth, 3)} ETH</b></div>
        <div><span className="muted">Ops</span><b>{fmt(city.opsEth, 3)} ETH</b></div>
      </div>
      <h3>Buy rules</h3>
      <ul className="rules">
        <li>Buys once at least <b>0.1 ETH</b> is waiting, at most <b>0.6 ETH</b> per order.</li>
        <li>One order at a time, at least <b>10 minutes</b> apart; the keeper checks every hour.</li>
        <li>Price checked against the 30-minute Uniswap average. More than <b>4%</b> off: order rejected, ETH stays, buying pauses <b>6 hours</b>.</li>
        <li>Nothing bought for 24h: the keeper rests. <b>Anyone</b> can restart it with requestBuy().</li>
      </ul>
      <h3>Holdings</h3>
      <table className="table">
        <tbody>
          {DISTRICTS.map((d) => (
            <tr key={d.id}>
              <td><span className="dot" style={{ background: d.colour }} /> {d.token}</td>
              <td className="num">{fmt(city.holdings[d.id], city.holdings[d.id] < 10_000 ? 2 : 0)}</td>
              <td className="num muted">{usd(city.holdings[d.id] * city.tokenUsd[d.id])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Recent purchases</h3>
      <table className="table">
        <tbody>
          {city.purchases.slice(0, 10).map((p, i) => (
            <tr key={i}>
              <td className="muted small">{Math.max(1, Math.round((now - p.at) / 60))} min ago</td>
              <td>{DISTRICTS[p.token].token}</td>
              <td className="num">{fmt(p.eth, 3)} ETH</td>
              <td className="num muted">{usd(p.usd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Contracts</h3>
      <ul className="rules">
        <li>CapitaleVault, CapitaleNFT, CapitalePricing: addresses after deploy.</li>
        <li>No withdrawal function. Settings change only through a public <b>48-hour</b> timelock.</li>
      </ul>
    </div>
  );
}

// ─────────── Il Sindaco ───────────

export function SindacoTab() {
  const city = useCity();
  return (
    <div className="tab">
      <div className="sindaco-hero">
        <svg viewBox="0 0 80 80" width="72" height="72" aria-hidden>
          <circle cx="40" cy="40" r="38" fill="#fde4ea" stroke="#5b4636" strokeWidth="3" />
          <circle cx="40" cy="34" r="14" fill="#f6d2b8" stroke="#5b4636" strokeWidth="2.5" />
          <path d="M22 70 Q40 46 58 70" fill="#56ccf2" stroke="#5b4636" strokeWidth="2.5" />
          <path d="M28 66 L40 52 L52 66" fill="none" stroke="#3fae5b" strokeWidth="4" />
          <path d="M26 26 Q40 8 54 26 Z" fill="#5b4636" />
          <path d="M33 42 Q40 46 47 42" stroke="#5b4636" strokeWidth="2" fill="none" />
        </svg>
        <div>
          <div className="big">Il Sindaco</div>
          <div className="muted">Palazzo del Sindaco · building #0</div>
        </div>
      </div>
      <p>Benvenuti a Capitale! The Mayor&apos;s palazzo stands at the centre of Italy. Every district grows outward from its city, and the city fills up from the centre to the coast.</p>
      <ul className="rules">
        <li>Building #0 is minted at launch. It earns <b>no</b> rewards and has <b>no</b> vote.</li>
        <li>The team runs the keeper and receives only the 15% ops share. It cannot touch the vault.</li>
        <li>{fmt(city.buildings.length)} of {fmt(MAX_BUILDINGS)} palazzi built. When the city is full, building closes forever.</li>
      </ul>
      <h3>Prices</h3>
      <table className="table">
        <tbody>
          <tr><td>Early bird · first {EARLY_BIRD_UNITS}, 6 hours</td><td className="num">$40</td></tr>
          {TIERS.map((t, i) => (
            <tr key={t.upTo}><td>#{i === 0 ? 1 : TIERS[i - 1].upTo + 1} – #{fmt(t.upTo)}</td><td className="num">${t.usd}</td></tr>
          ))}
        </tbody>
      </table>
      <h3>Links</h3>
      <ul className="rules">
        <li>X / Telegram: announced at launch.</li>
        <li>Contracts are open source and verified on Basescan at launch.</li>
      </ul>
      <p className="muted small">Capitale is an experimental game. Reward tokens can lose value. Contracts are not yet audited. Nothing here is financial advice.</p>
    </div>
  );
}
