import { describe, expect, it } from "vitest";
import { deriveForwardOwner, ForwardOriginPolicy } from "./forwardOrigin";

const originSecret = Buffer.alloc(32, 1).toString("base64url");
const otherOriginSecret = Buffer.alloc(32, 2).toString("base64url");

const forwardId = "01234567-89ab-4cde-8f01-23456789abcd";

describe("forward origin ownership", () => {
  it("keeps an owner stable while distinguishing reclaimed IDs and different hosts", () => {
    const owner = deriveForwardOwner(originSecret, "host-a");
    expect(deriveForwardOwner(originSecret, "host-a")).toBe(owner);
    expect(deriveForwardOwner(otherOriginSecret, "host-a")).not.toBe(owner);
    expect(deriveForwardOwner(originSecret, "host-b")).not.toBe(owner);
  });

  it("rejects weak or noncanonical origin secrets", () => {
    expect(() => deriveForwardOwner("password", "host-a")).toThrow(
      "canonical 32-byte origin secret",
    );
    expect(() => deriveForwardOwner(`${originSecret}=`, "host-a")).toThrow(
      "canonical 32-byte origin secret",
    );
  });

  it("round-trips host and forward in one wildcard-compatible DNS label", () => {
    const policy = new ForwardOriginPolicy("https://apps.example.test:8443/");
    const ownerId = deriveForwardOwner(originSecret, "host-a");
    const origin = new URL(policy.originFor(ownerId, forwardId));
    expect(origin.hostname.split(".")[0]).toHaveLength(59);
    expect(policy.resolveAuthority(origin.host)).toEqual({ ownerId, forwardId });
    expect(policy.resolveAuthority(origin.hostname)).toBeNull();
    expect(policy.resolveAuthority(`${origin.host}.evil.test`)).toBeNull();
    expect(policy.resolveAuthority(`extra.${origin.host}`)).toBeNull();
    expect(policy.resolveAuthority(`user@${origin.host}`)).toBeNull();
    expect(policy.resolveAuthority(`${origin.host}/api`)).toBeNull();
  });

  it("accepts an explicit default HTTPS port without accepting another port", () => {
    const policy = new ForwardOriginPolicy("https://apps.example.test");
    const ownerId = deriveForwardOwner(originSecret, "host-a");
    const hostname = new URL(policy.originFor(ownerId, forwardId)).hostname;
    expect(policy.resolveAuthority(`${hostname}:443`)).toEqual({ ownerId, forwardId });
    expect(policy.resolveAuthority(`${hostname}:80`)).toBeNull();
  });

  it.each([
    "http://apps.example.test",
    "https://user:password@apps.example.test",
    "https://apps.example.test/prefix",
    "https://apps.example.test?query=1",
    "https://apps.example.test#fragment",
    "https://127.0.0.1",
    "https://[::1]",
    "https://*.example.test",
    "https://apps.example.test.",
  ])("rejects unsuitable configured origins: %s", (value) => {
    expect(() => new ForwardOriginPolicy(value)).toThrow(
      "Forward base URL must be an HTTPS DNS origin",
    );
  });

  it("rejects malformed or caller-selected labels", () => {
    const policy = new ForwardOriginPolicy("https://apps.example.test");
    expect(() => policy.originFor("another-host", forwardId)).toThrow(
      "Invalid forward origin identity.",
    );
    expect(() => policy.originFor("a".repeat(24), "../../api")).toThrow(
      "Invalid forward origin identity.",
    );
    expect(policy.resolveAuthority("f-selected.apps.example.test")).toBeNull();
  });
});
