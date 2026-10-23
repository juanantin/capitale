"use client";

import { useState } from "react";
import { parseEther, type Address } from "viem";
import { useAccount, useChainId, useConnect, useSwitchChain } from "wagmi";
import { chainError, connectCity, describeError, rememberCity, savedCity, testActions } from "../lib/chain";
import { DEPLOY_STEPS, deployTestCity } from "../lib/deploy";
import { CHAIN, EXPLORER } from "../lib/wagmi";
import { DISTRICTS } from "../lib/config";
import { formatCountdown } from "../lib/romeTime";
import { setMode, useCity } from "../lib/store";
import { short } from "./WalletButton";
import { useNow } from "./Panels";

const FAUCETS = [
  ["Coinbase faucet", "https://portal.cdp.coinbase.com/products/faucet"],
  ["Alchemy faucet", "https://www.alchemy.com/faucets/base-sepolia"],
];

export default function TestLab() {
  const city = useCity();
  const now = useNow();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors } = useConnect();
  const { switchChain } = useSwitchChain();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [step, setStep] = useState(-1);
  const [eb, setEb] = useState(600);
  const [tax, setTax] = useState("0.003");
  const [price, setPrice] = useState("");
  const [other, setOther] = useState("");
  const c = city.chain;
  const vault = savedCity();

  const act = (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setMsg(null);
    fn()
      .then((r) => setMsg({ ok: true, text: typeof r === "string" ? r : "Done ✓" }))
      .catch((e) => setMsg({ ok: false, text: describeError(e) }))
      .finally(() => setBusy(null));
  };

  if (city.mode !== "testnet") {
    return (
      <div className="tab">
        <p>You&apos;re looking at <b>sample data</b>. The test lab runs the real contracts on <b>Base Sepolia</b>, Base&apos;s free test network, with test tokens that have no value.</p>
        <button className="btn primary wide" onClick={() => setMode("testnet")}>Switch to testnet</button>
      </div>
    );
  }

  const deploy = () =>
    act("deploy", async () => {
      setStep(0);
      const v = await deployTestCity({ earlyBird: eb }, setStep);
      rememberCity(v);
      await connectCity(v, address ?? null);
      return "Your test city is live! Grab test $CAPITALE below and build.";
    });

  const pendingEth = city.residentsEth + city.streetEth;
  const ebLeft = c ? c.earlyBirdEnd - now : 0;

  return (
    <div className="tab">
      <h3>1 · Wallet</h3>
      {!isConnected ? (
        <>
          <button className="btn primary wide" onClick={() => connectors[0] && connect({ connector: connectors[0] })}>Connect wallet</button>
          <p className="muted small">Use a wallet just for testing (MetaMask, Coinbase Wallet, Rabby). On a phone, open this page inside the wallet app&apos;s browser.</p>
        </>
      ) : chainId !== CHAIN.id ? (
        <button className="btn primary wide" onClick={() => switchChain({ chainId: CHAIN.id })}>Switch wallet to Base Sepolia</button>
      ) : (
        <div className="stat-grid">
          <div><span className="muted">Wallet</span><b>{short(address!)}</b></div>
          <div><span className="muted">Test ETH</span><b>{c ? c.ethBalance.toFixed(4) : "…"}</b></div>
        </div>
      )}
      <p className="muted small">
        Need test ETH for gas? Free from a faucet:{" "}
        {FAUCETS.map(([n, u], i) => (
          <span key={u}>{i > 0 && " · "}<a href={u} target="_blank" rel="noreferrer">{n}</a></span>
        ))}
        . About 0.05 test ETH is plenty.
      </p>

      <h3>2 · Test city</h3>
      {!vault ? (
        <>
          <p>Deploy your own copy of Capitale with test tokens. Your wallet asks you to confirm {DEPLOY_STEPS.length} times.</p>
          <label className="muted small">Early bird length for this test</label>
          <div className="row">
            {[[600, "10 min"], [3600, "1 hour"], [21600, "6 hours (real)"]].map(([s, l]) => (
              <button key={s} className={`btn small ${eb === s ? "primary" : ""}`} onClick={() => setEb(s as number)}>{l}</button>
            ))}
          </div>
          <button className="btn primary wide" disabled={!isConnected || chainId !== CHAIN.id || !!busy} onClick={deploy}>
            {busy === "deploy" ? "Deploying…" : "🚀 Deploy test city"}
          </button>
          {step >= 0 && (
            <ol className="steps">
              {DEPLOY_STEPS.map((s, i) => (
                <li key={s} className={i < step ? "done" : i === step ? "now" : ""}>{i < step ? "✓" : i === step ? "⏳" : "·"} {s}</li>
              ))}
            </ol>
          )}
          <p className="muted small">Already have one? Paste its vault address:</p>
          <div className="row">
            <input className="input" placeholder="0x…" value={other} onChange={(e) => setOther(e.target.value.trim())} />
            <button className="btn" disabled={!/^0x[0-9a-fA-F]{40}$/.test(other)} onClick={() => { rememberCity(other as Address); act("load", () => connectCity(other as Address, address ?? null)); }}>Load</button>
          </div>
        </>
      ) : (
        <>
          <div className="addr">
            Vault <a href={`${EXPLORER}/address/${vault}`} target="_blank" rel="noreferrer">{short(vault)}</a>
            {c && <> · NFT <a href={`${EXPLORER}/address/${c.nft}`} target="_blank" rel="noreferrer">{short(c.nft)}</a></>}
          </div>
          <div className="row">
            <button className="btn small" onClick={() => { navigator.clipboard?.writeText(window.location.href); setMsg({ ok: true, text: "Link copied: anyone with it opens this test city." }); }}>Copy share link</button>
            <button className="btn small ghost" onClick={() => { rememberCity(null); connectCity(null, null); setMode("preview"); setMode("testnet"); }}>Forget this city</button>
          </div>
          {!c && <p className="muted small">{chainError() ? `Can't read the city: ${chainError()}` : "Loading the city from Base Sepolia…"}</p>}
        </>
      )}

      {c && (
        <>
          <h3>3 · Try everything</h3>
          <div className="stat-grid">
            <div><span className="muted">Your test $CAPITALE</span><b>{Math.floor(city.capitaleBalance).toLocaleString()}</b></div>
            <div><span className="muted">Early bird</span><b>{c.isEarlyBird ? `ends in ${formatCountdown(ebLeft)}` : c.earlyBirdFinalized ? "over, paid out" : "over"}</b></div>
            <div><span className="muted">ETH waiting to buy</span><b>{pendingEth.toFixed(4)}</b></div>
            <div><span className="muted">This week buys</span><b>{DISTRICTS[city.currentToken].token}</b></div>
          </div>
          <div className="lab-actions">
            <button className="btn" disabled={!!busy} onClick={() => act("faucet", testActions.faucet)}>{busy === "faucet" ? "…" : "🎁 Get 1,000,000 test $CAPITALE"}</button>
            <div className="row">
              <input className="input narrow" value={tax} onChange={(e) => setTax(e.target.value)} inputMode="decimal" />
              <button className="btn" disabled={!!busy} onClick={() => act("tax", () => testActions.payTax(parseEther(tax || "0")))}>{busy === "tax" ? "…" : "💸 Pay test tax (ETH)"}</button>
            </div>
            <p className="muted small">Stands in for the 1% Stonks Exchange fee. 85% of it waits to buy the week&apos;s token (min {c.minOrderEth} ETH per order), 15% goes to ops.</p>
            <button className="btn" disabled={!!busy} onClick={() => act("buy", testActions.requestBuy)}>{busy === "buy" ? "…" : "🛒 Trigger a buy (requestBuy)"}</button>
            {c.pausedUntil > now && <p className="warn small">Buying paused for {formatCountdown(c.pausedUntil - now)} after a rejected order.</p>}
            {c.lastBuyAt + c.minInterval > now && <p className="muted small">Next buy allowed in {formatCountdown(c.lastBuyAt + c.minInterval - now)}.</p>}
            {c.isEarlyBird && <p className="muted small">During early bird, buys fill the early-bird pool; it&apos;s paid to early-bird buildings when the window ends (then hit Settle).</p>}
            <div className="row">
              <button className="btn small" disabled={!!busy} onClick={() => act("settle", testActions.settle)}>Settle</button>
              <button className="btn small" disabled={!!busy || city.opsEth <= 0} onClick={() => act("ops", testActions.payOps)}>Pay ops share</button>
            </div>
          </div>

          {address && c.oracleOwner === address.toLowerCase() && (
            <>
              <h3>4 · Test controls (only you)</h3>
              <p className="muted small">Move the test prices to check the rules. Current $CAPITALE price: ${city.capitaleUsd}</p>
              <div className="row">
                <input className="input narrow" placeholder="0.002" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
                <button className="btn small" disabled={!!busy || !Number(price)} onClick={() => act("price", () => testActions.setCapitalePrice(Number(price)))}>Set $CAPITALE price</button>
              </div>
              <div className="row">
                <button className={`btn small ${c.adapterQuality === 10_000 ? "primary" : ""}`} disabled={!!busy} onClick={() => act("q", () => testActions.setQuality(10_000))}>Normal fills</button>
                <button className={`btn small ${c.adapterQuality < 9_600 ? "primary" : ""}`} disabled={!!busy} onClick={() => act("q", () => testActions.setQuality(9_000))}>Bad fills (10% off)</button>
              </div>
              <p className="muted small">With bad fills, the next buy is rejected and buying pauses 6 hours: the protection working.</p>
            </>
          )}
        </>
      )}
      {msg && <p className={msg.ok ? "ok-box" : "err-box"}>{msg.text}</p>}
      <p className="preview-note">Testnet: tokens have no value. The weekly vote still closes on the real Sunday 20:00 Rome time.</p>
    </div>
  );
}
