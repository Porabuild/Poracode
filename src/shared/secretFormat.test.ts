import { describe, it, expect } from "vitest";
import { SECRET_PREFIX, isEncryptedSecret } from "./secretFormat";

describe("SECRET_PREFIX", () => {
  it("has the expected value", () => {
    expect(SECRET_PREFIX).toBe("lc-safe:v1:");
  });
});

describe("isEncryptedSecret", () => {
  it("returns true for a string starting with the prefix", () => {
    expect(isEncryptedSecret("lc-safe:v1:encryptedPayload123")).toBe(true);
  });

  it("returns false for a plain string", () => {
    expect(isEncryptedSecret("plaintext-value")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isEncryptedSecret("")).toBe(false);
  });

  it("returns false for a partial prefix match", () => {
    expect(isEncryptedSecret("lc-safe:v1")).toBe(false);
  });

  it("returns true for just the prefix with nothing after", () => {
    expect(isEncryptedSecret("lc-safe:v1:")).toBe(true);
  });
});
