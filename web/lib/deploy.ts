// "Deploy test city": puts a complete Capitale on Base Sepolia from the connected wallet.
// Six wallet confirmations. Testnet only: it uses the test stand-ins from TestKit.

import { parseEther, type Address } from "viem";
import { getWalletClient, switchChain } from "@wagmi/core";
import { nftAbi, pricingAbi, testKitAbi, vaultAbi } from "./abis";
import { CHAIN, publicClient, wagmiConfig } from "./wagmi";

export const DEPLOY_STEPS = [
  "Test tokens, price feed and swap (TestKit)",
  "Pricing contract",
  "Building NFT contract",
  "Vault",
  "Link pricing → NFT",
  "Link NFT → vault",
] as const;

export interface DeployOptions {
  /** Early-bird length in seconds (6 hours is the real value; shorter is handy for testing). */
  earlyBird: number;
}

export async function deployTestCity(opts: DeployOptions, onStep: (i: number) => void): Promise<Address> {
  let wc = await getWalletClient(wagmiConfig);
  if (!wc) throw new Error("Connect your wallet first.");
  if (wc.chain?.id !== CHAIN.id) {
    await switchChain(wagmiConfig, { chainId: CHAIN.id });
    wc = (await getWalletClient(wagmiConfig))!;
  }
  const me = wc.account.address;
  const { testKitBytecode, pricingBytecode, nftBytecode, vaultBytecode } = await import("./bytecode");

  const deploy = async (abi: readonly unknown[], bytecode: `0x${string}`, args: unknown[]) => {
    const hash = await wc!.deployContract({ abi, bytecode, args, account: wc!.account, chain: CHAIN } as never);
    const r = await publicClient.waitForTransactionReceipt({ hash });
    if (r.status !== "success" || !r.contractAddress) throw new Error("Deployment failed.");
    return r.contractAddress;
  };
  const call = async (address: Address, abi: readonly unknown[], functionName: string, args: unknown[]) => {
    const hash = await wc!.writeContract({ address, abi, functionName, args, account: wc!.account, chain: CHAIN } as never);
    const r = await publicClient.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`${functionName} failed.`);
  };
  const read = <T>(address: Address, abi: readonly unknown[], functionName: string, args: unknown[] = []) =>
    publicClient.readContract({ address, abi, functionName, args } as never) as Promise<T>;

  onStep(0);
  const kit = await deploy(testKitAbi, testKitBytecode, []);
  const [capitale, oracle, adapter, rewards] = await Promise.all([
    read<Address>(kit, testKitAbi, "capitale"),
    read<Address>(kit, testKitAbi, "oracle"),
    read<Address>(kit, testKitAbi, "adapter"),
    read<readonly Address[]>(kit, testKitAbi, "rewardTokens"),
  ]);

  onStep(1);
  const now = Number((await publicClient.getBlock()).timestamp);
  // The early bird lasts 6h from startTime; starting earlier makes the test window shorter.
  const start = now - (6 * 3600 - opts.earlyBird);
  const pricing = await deploy(pricingAbi, pricingBytecode, [me, oracle, BigInt(start), 300n, parseEther("40"), [parseEther("52"), parseEther("68"), parseEther("88"), parseEther("120")]]);

  onStep(2);
  const nft = await deploy(nftAbi, nftBytecode, [capitale, pricing, me]);

  onStep(3);
  const vault = await deploy(vaultAbi, vaultBytecode, [
    me,
    nft,
    BigInt(start + 6 * 3600),
    rewards,
    [adapter, adapter, adapter, adapter],
    oracle,
    me,
    "0x0000000000000000000000000000000000000000",
    1, // first week buys STONKEX
    { minOrder: parseEther("0.001"), maxOrder: parseEther("0.01"), minInterval: 600, rejectPause: 6 * 3600, maxDeviationBps: 400 },
  ]);

  onStep(4);
  await call(pricing, pricingAbi, "setNft", [nft]);
  onStep(5);
  await call(nft, nftAbi, "setVault", [vault]);
  onStep(6);
  return vault;
}
