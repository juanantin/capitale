"use client";

import { useEffect, useState } from "react";
import MapView from "./MapView";
import Logo from "./Logo";
import WhitePaper from "./WhitePaper";
import { BuildTab, MyPalazzoTab, RankingsTab, SindacoTab, TownHallTab, TreasuryTab } from "./Panels";
import { DISTRICTS, MAX_BUILDINGS } from "../lib/config";
import { setLive, settleIfDue, tick, ui, useCity } from "../lib/store";

const TABS = [
  { key: "build", label: "Build", icon: "🏗️" },
  { key: "mine", label: "My Palazzo", icon: "🏠" },
  { key: "hall", label: "Town Hall", icon: "🗳️" },
  { key: "rank", label: "Rankings", icon: "🏆" },
  { key: "treasury", label: "Treasury", icon: "💰" },
  { key: "paper", label: "White Paper", icon: "📜" },
  { key: "sindaco", label: "Il Sindaco", icon: "🎩" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function App() {
  const city = useCity();
  const [tab, setTab] = useState<TabKey | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const a = setInterval(tick, 3200);
    const b = setInterval(() => settleIfDue(Math.floor(Date.now() / 1000)), 1000);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, []);

  ui.panelOpen = tab !== null;
  const D = DISTRICTS[city.currentToken];
  const current = TABS.find((t) => t.key === tab);

  return (
    <main className="app">
      <MapView />

      <header className="top">
        <div className="token-card">
          <div className="token-name">$CAPITALE</div>
          <button className="ca" onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }}>
            CA: {copied ? "announced at launch" : "coming soon"}
          </button>
          <div className="via">via <b>Stonks Exchange</b> · Base</div>
        </div>
        <div className="top-right">
          <Logo />
          <button className="btn wallet" disabled title="Preview mode">Connect wallet</button>
        </div>
      </header>

      <section className="stats">
        <div className="stat"><span>Residents</span><b>{city.buildings.length.toLocaleString()}<small>/{MAX_BUILDINGS.toLocaleString()}</small></b></div>
        <div className="stat"><span>City tax</span><b>{city.totalTaxEth.toFixed(2)} <small>ETH</small></b></div>
        <div className="stat"><span>Purchases</span><b>{city.totalPurchases}</b></div>
        <div className="stat" style={{ ["--c" as string]: D.colour }}><span>This week</span><b className="week-token">{D.token}</b></div>
        <button className={`stat live ${city.live ? "on" : ""}`} onClick={() => setLive(!city.live)} title="Simulated activity in the preview">
          <span>Preview</span><b>{city.live ? "● Live" : "❚❚ Paused"}</b>
        </button>
      </section>

      <section className={`sheet ${tab ? "open" : ""}`} aria-hidden={!tab}>
        {current && (
          <>
            <div className="sheet-head">
              <h2>{current.icon} {current.label}</h2>
              <button className="close" onClick={() => setTab(null)} aria-label="Close">×</button>
            </div>
            <div className="sheet-body">
              {tab === "build" && <BuildTab />}
              {tab === "mine" && <MyPalazzoTab />}
              {tab === "hall" && <TownHallTab />}
              {tab === "rank" && <RankingsTab />}
              {tab === "treasury" && <TreasuryTab />}
              {tab === "paper" && <WhitePaper />}
              {tab === "sindaco" && <SindacoTab />}
            </div>
          </>
        )}
      </section>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? "on" : ""} onClick={() => setTab(tab === t.key ? null : t.key)}>
            <span className="ti">{t.icon}</span>
            <span className="tl">{t.label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
