"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { setMode } from "../lib/store";

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  if (isConnected && address) {
    return (
      <button className="btn wallet on" onClick={() => disconnect()} title="Disconnect">
        ● {short(address)}
      </button>
    );
  }
  const injected = connectors[0];
  return (
    <button
      className="btn wallet"
      disabled={isPending}
      onClick={() => {
        setMode("testnet");
        if (injected) connect({ connector: injected });
      }}
    >
      {isPending ? "Connecting…" : "Connect wallet"}
    </button>
  );
}
