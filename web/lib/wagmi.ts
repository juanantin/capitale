import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { baseSepolia } from "viem/chains";
import { createPublicClient } from "viem";

// Base Sepolia (test network). NEXT_PUBLIC_RPC_URL can point at another node (e.g. a local
// anvil in tests); the chain id stays 84532.
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia.base.org";
export const CHAIN = baseSepolia;
export const EXPLORER = "https://sepolia.basescan.org";

const transport = http(RPC_URL, { batch: { batchSize: 40 } });

export const wagmiConfig = createConfig({
  chains: [CHAIN],
  connectors: [injected({ shimDisconnect: true })],
  transports: { [CHAIN.id]: transport },
  ssr: false,
});

export const publicClient = createPublicClient({ chain: CHAIN, transport });
