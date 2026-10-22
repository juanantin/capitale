"use client";

import { useEffect, useRef, useState } from "react";
import { CityScene } from "../lib/scene";
import { DISTRICTS, levelForUsd } from "../lib/config";
import { DISTRICT_PLACES, PLACES } from "../lib/plots";
import { YOU, getCity, onCityEvent, useCity } from "../lib/store";

export default function MapView() {
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CityScene | null>(null);
  const banners = useRef<(HTMLDivElement | null)[]>([]);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const city = useCity();

  const placeBanners = () => {
    const sc = sceneRef.current;
    if (!sc) return;
    const keys = [...DISTRICT_PLACES, "mayor"] as const;
    keys.forEach((k, i) => {
      const el = banners.current[i];
      if (!el) return;
      const [x, y] = sc.worldToScreen(PLACES[k]);
      const lift = k === "napoli" ? 110 : k === "venezia" ? 120 : 80;
      const s = Math.max(0.55, Math.min(1.15, sc.scale * 2.4));
      el.style.transform = `translate(${x}px, ${y - lift * sc.scale}px) translate(-50%, -100%) scale(${s})`;
    });
  };

  useEffect(() => {
    const scene = new CityScene({ onSelect: setSelected, onCamera: placeBanners });
    sceneRef.current = scene;
    let alive = true;
    scene.init(host.current!).then(() => {
      if (!alive) return;
      scene.sync(getCity().buildings, false);
      placeBanners();
      setReady(true);
    });
    const off = onCityEvent((e) => {
      if (e.type === "invited") scene.burstAt(e.building.id);
      if (e.type === "focus") {
        scene.flyTo(e.id);
        scene.select(e.id);
        setSelected(e.id);
      }
    });
    const onResize = () => placeBanners();
    window.addEventListener("resize", onResize);
    return () => {
      alive = false;
      off();
      window.removeEventListener("resize", onResize);
      scene.destroy();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (ready) sceneRef.current?.sync(city.buildings, true);
  }, [city.buildings, ready]);

  const sel = selected ? city.buildings[selected - 1] : null;
  const d = sel ? DISTRICTS[sel.district] : null;

  return (
    <div className="map">
      <div ref={host} className="map-canvas" />
      <div className="map-overlay">
        {DISTRICTS.map((D, i) => (
          <div key={D.token} ref={(el) => { banners.current[i] = el; }} className="banner" style={{ ["--c" as string]: D.colour, ["--cd" as string]: D.dark }}>
            {city.currentToken === D.id && <span className="this-week">THIS WEEK</span>}
            <span className="banner-token">{D.token}</span>
            <span className="banner-city">{D.city}</span>
          </div>
        ))}
        <div ref={(el) => { banners.current[4] = el; }} className="banner mayor-banner">
          <span className="banner-token">IL SINDACO</span>
          <span className="banner-city">#0</span>
        </div>
      </div>
      {!ready && <div className="map-loading">Building the city…</div>}
      {sel && d && (
        <div className="building-card" style={{ ["--c" as string]: d.colour }}>
          <button className="close" onClick={() => { setSelected(null); sceneRef.current?.select(null); }} aria-label="Close">×</button>
          <div className="bc-title">Palazzo #{sel.id}</div>
          <div className="bc-sub">{d.city} · {d.styles[sel.style]}</div>
          <div className="bc-grid">
            <span>Level</span><b>L{levelForUsd(sel.claimedUsd)}</b>
            <span>Claimed</span><b>${sel.claimedUsd.toFixed(2)}</b>
            <span>Pending</span><b>${sel.pendingUsd.toFixed(2)}</b>
            <span>Invites</span><b>{sel.invites}{sel.invites >= 2 ? " 🎆" : ""}</b>
            <span>Plot</span><b>{d.city} #{sel.plot + 1}</b>
            <span>Owner</span><b>{sel.owner === YOU ? "You" : sel.owner}</b>
          </div>
        </div>
      )}
    </div>
  );
}
