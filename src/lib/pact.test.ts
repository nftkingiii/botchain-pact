import { describe, expect, it } from "vitest";
import { amountToUnits, createRequest, decodeRequest, encodeRequest, isExpired, verifyRequestFingerprint } from "./pact";

const seed = {
  version: 1 as const, title: "Community dinner", merchant: "The Commons",
  recipient: "0x0000000000000000000000000000000000000001", asset: "BOT", tokenAddress: null,
  decimals: 18, amount: "2.5", deadline: "2030-01-01T00:00:00.000Z", note: "Shared meal",
  createdAt: "2026-09-16T12:00:00.000Z",
};

describe("Pact request integrity", () => {
  it("creates stable fingerprints and round-trips a link payload", async () => {
    const request = await createRequest(seed);
    expect(await verifyRequestFingerprint(request)).toBe(true);
    expect(await verifyRequestFingerprint(decodeRequest(encodeRequest(request)))).toBe(true);
    expect(request.requestId).toMatch(/^0x[\da-f]{64}$/);
  });
  it("detects changed fields when the original fingerprint is retained", async () => {
    const request = await createRequest(seed);
    expect(await verifyRequestFingerprint({ ...request, amount: "9" })).toBe(false);
  });
  it("uses integer units and rejects unsupported precision", () => {
    expect(amountToUnits("2.500001", 6)).toBe(2_500_001n);
    expect(() => amountToUnits("0.0000001", 6)).toThrow(/decimal places/);
  });
  it("treats the expiry instant as closed", async () => {
    const request = await createRequest(seed);
    expect(isExpired(request, Date.parse(request.deadline))).toBe(true);
    expect(isExpired(request, Date.parse(request.deadline) - 1)).toBe(false);
  });
});
