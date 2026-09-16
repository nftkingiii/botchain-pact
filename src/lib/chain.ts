import { createPublicClient, defineChain, http, isAddress, type Address } from "viem";

export const CHAIN_ID = 968;
export const RPC_URL = "/api/rpc";
export const EXPLORER = "https://scan.bohr.life";
export const RECEIPT_ADDRESS = (import.meta.env.VITE_PACT_RECEIPT_ADDRESS || "0x26a01c58a44fd3d8F57E61FE388EDC527a052C6d") as Address;

export const botTestnet = defineChain({
  id: CHAIN_ID,
  name: "BOT Chain Testnet",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "BOT Chain Explorer", url: EXPLORER } },
  testnet: true,
});

export const receiptAbi = [
  { type: "function", name: "recipient", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "amount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "deadline", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "requestId", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "isOpen", stateMutability: "view", inputs: [{ name: "now_", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

export const publicClient = createPublicClient({ chain: botTestnet, transport: http(RPC_URL, { timeout: 12_000, retryCount: 1 }) });

export type ReceiptSnapshot = {
  chainId: number;
  blockNumber: bigint;
  blockTimestamp: bigint;
  code: `0x${string}`;
  recipient: Address;
  token: Address;
  amount: bigint;
  deadline: bigint;
  requestId: `0x${string}`;
  isOpen: boolean;
};

export async function readReceipt(address: string = RECEIPT_ADDRESS): Promise<ReceiptSnapshot> {
  if (!isAddress(address)) throw new Error("Receipt address is not a valid EVM address.");
  const [chainId, blockNumber, code] = await Promise.all([
    publicClient.getChainId(), publicClient.getBlockNumber(), publicClient.getCode({ address }),
  ]);
  if (chainId !== CHAIN_ID) throw new Error(`RPC is on chain ${chainId}; expected BOT Chain Testnet (${CHAIN_ID}).`);
  if (!code || code === "0x") throw new Error("No contract code exists at this address on BOT Chain Testnet.");
  const [block, recipient, token, amount, deadline, requestId] = await Promise.all([
    publicClient.getBlock({ blockNumber }),
    publicClient.readContract({ address, abi: receiptAbi, functionName: "recipient" }),
    publicClient.readContract({ address, abi: receiptAbi, functionName: "token" }),
    publicClient.readContract({ address, abi: receiptAbi, functionName: "amount" }),
    publicClient.readContract({ address, abi: receiptAbi, functionName: "deadline" }),
    publicClient.readContract({ address, abi: receiptAbi, functionName: "requestId" }),
  ]);
  const isOpen = await publicClient.readContract({ address, abi: receiptAbi, functionName: "isOpen", args: [block.timestamp] });
  return { chainId, blockNumber, blockTimestamp: block.timestamp, code, recipient, token, amount, deadline, requestId, isOpen };
}
