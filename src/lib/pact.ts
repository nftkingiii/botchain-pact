import { z } from "zod";
import { sha256, toBytes } from "viem";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const address = /^0x[\da-fA-F]{40}$/;
const amountPattern = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,18})?$/;

export const requestSchema = z.object({
  version: z.literal(1),
  title: z.string().trim().min(3).max(72),
  merchant: z.string().trim().min(2).max(60),
  recipient: z.string().regex(address, "Enter a valid EVM recipient address."),
  asset: z.string().trim().min(2).max(12).regex(/^[A-Za-z0-9._-]+$/),
  tokenAddress: z.string().regex(address).nullable(),
  decimals: z.number().int().min(0).max(18),
  amount: z.string().regex(amountPattern).refine((v) => Number(v) > 0, "Amount must be greater than zero."),
  deadline: z.string().datetime(),
  note: z.string().trim().max(240),
  createdAt: z.string().datetime(),
  requestId: z.string().regex(/^0x[\da-f]{64}$/),
});

export type PactRequest = z.infer<typeof requestSchema>;
type RequestSeed = Omit<PactRequest, "requestId">;

export function normalizeAddress(value: string): `0x${string}` {
  const normalized = value.trim();
  if (!address.test(normalized) || normalized.toLowerCase() === ZERO_ADDRESS) throw new Error("Enter a valid non-zero EVM address.");
  return normalized as `0x${string}`;
}

export function amountToUnits(amount: string, decimals: number): bigint {
  if (!amountPattern.test(amount)) throw new Error("Use a positive amount with no more precision than the selected asset.");
  const [whole, fraction = ""] = amount.split(".");
  if (fraction.length > decimals) throw new Error(`This asset supports at most ${decimals} decimal places.`);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
}

function canonical(seed: RequestSeed): string {
  return JSON.stringify({ ...seed, recipient: seed.recipient.toLowerCase(), tokenAddress: seed.tokenAddress?.toLowerCase() ?? null });
}

export async function createRequest(seed: RequestSeed): Promise<PactRequest> {
  const parsed = requestSchema.omit({ requestId: true }).parse(seed);
  amountToUnits(parsed.amount, parsed.decimals);
  const requestId = sha256(toBytes(canonical(parsed as RequestSeed)));
  return requestSchema.parse({ ...parsed, requestId });
}

export async function verifyRequestFingerprint(request: PactRequest): Promise<boolean> {
  const { requestId, ...seed } = requestSchema.parse(request);
  return sha256(toBytes(canonical(seed))).toLowerCase() === requestId.toLowerCase();
}

export function encodeRequest(request: PactRequest): string {
  const valid = requestSchema.parse(request);
  return btoa(unescape(encodeURIComponent(JSON.stringify(valid)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeRequest(encoded: string): PactRequest {
  if (!/^[\w-]{20,3500}$/.test(encoded)) throw new Error("This request link is malformed or too large.");
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
  return requestSchema.parse(JSON.parse(decodeURIComponent(escape(atob(base64)))) as unknown);
}

export function requestUrl(request: PactRequest, base = window.location.origin): string {
  const url = new URL("/", base);
  url.searchParams.set("request", encodeRequest(request));
  return url.toString();
}

export function isExpired(request: PactRequest, nowMs = Date.now()): boolean {
  return Date.parse(request.deadline) <= nowMs;
}

export function amountMatches(a: bigint, b: bigint): boolean { return a === b; }
