import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptFactoryAuthV2, encryptFactoryAuthV2, parseFactoryAuth } from "./factoryCredentials";

describe("decryptFactoryAuthV2", () => {
  const keyB64 = randomBytes(32).toString("base64");

  it("round-trips an AES-256-GCM envelope (iv:tag:ciphertext, 16-byte nonce)", () => {
    const payload = JSON.stringify({ access_token: "at", refresh_token: "rt" });
    const envelope = encryptFactoryAuthV2(payload, keyB64);
    expect(envelope.split(":")).toHaveLength(3);
    expect(decryptFactoryAuthV2(envelope, keyB64)).toBe(payload);
  });

  it("throws on a tampered ciphertext (GCM auth failure)", () => {
    const envelope = encryptFactoryAuthV2("{}", keyB64);
    const [iv, tag, ct] = envelope.split(":");
    const bytes = Buffer.from(ct!, "base64");
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;
    const tampered = [iv, tag, bytes.toString("base64")].join(":");
    expect(() => decryptFactoryAuthV2(tampered, keyB64)).toThrow(/.+/);
  });

  it("throws on a malformed envelope or wrong-length key", () => {
    expect(() => decryptFactoryAuthV2("not-an-envelope", keyB64)).toThrow(
      "invalid AES-GCM envelope",
    );
    const envelope = encryptFactoryAuthV2("{}", keyB64);
    expect(() => decryptFactoryAuthV2(envelope, randomBytes(16).toString("base64"))).toThrow(
      /key length/,
    );
  });
});

describe("parseFactoryAuth", () => {
  it("extracts top-level, camelCase, and nested tokens", () => {
    expect(parseFactoryAuth(JSON.stringify({ access_token: "a", refresh_token: "r" }))).toEqual({
      accessToken: "a",
      refreshToken: "r",
    });
    expect(parseFactoryAuth(JSON.stringify({ accessToken: "a" }))).toEqual({ accessToken: "a" });
    expect(parseFactoryAuth(JSON.stringify({ tokens: { access_token: "a" } }))).toEqual({
      accessToken: "a",
    });
  });

  it("returns undefined without an access token or on bad JSON", () => {
    expect(parseFactoryAuth(JSON.stringify({ refresh_token: "r" }))).toBeUndefined();
    expect(parseFactoryAuth("not json")).toBeUndefined();
  });
});
