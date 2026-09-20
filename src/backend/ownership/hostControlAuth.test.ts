import { describe, expect, it } from "vitest";
import {
  authenticateHostControlRequest,
  createHostControlRequestProof,
  createHostControlResponseProof,
  verifyHostControlResponse,
} from "./hostControlAuth";

const secret = Buffer.alloc(32, 21).toString("base64url");
const otherSecret = Buffer.alloc(32, 22).toString("base64url");
const now = 1_789_000_000_000;
const input = {
  method: "POST",
  path: "/control",
  authority: "127.0.0.1:43123",
  body: Buffer.from('{"operation":"describe"}'),
};

describe("local owner request and response proofs", () => {
  it("proves both peers without sending the discovery secret", () => {
    const authorization = createHostControlRequestProof(secret, input, now);
    expect(authorization).not.toContain(secret);
    expect(authenticateHostControlRequest(secret, { ...input, authorization }, now)).toBe(true);
    const reply = Buffer.from('{"ok":true}');
    const proof = createHostControlResponseProof(secret, authorization, 200, reply);
    expect(verifyHostControlResponse(secret, authorization, 200, reply, proof)).toBe(true);
  });

  it.each([
    { method: "GET" },
    { path: "/other" },
    { authority: "127.0.0.1:43124" },
    { body: Buffer.from('{"operation":"issue-pairing"}') },
  ])("rejects request tampering (%j)", (changed) => {
    const authorization = createHostControlRequestProof(secret, input, now);
    expect(
      authenticateHostControlRequest(secret, { ...input, ...changed, authorization }, now),
    ).toBe(false);
  });

  it.each([-5_001, 1_001])("rejects a proof outside its same-host time window (%s)", (offset) => {
    const authorization = createHostControlRequestProof(secret, input, now + offset);
    expect(authenticateHostControlRequest(secret, { ...input, authorization }, now)).toBe(false);
  });

  it("refuses the old raw bearer, another credential and malformed proof material", () => {
    const authorization = createHostControlRequestProof(otherSecret, input, now);
    expect(authenticateHostControlRequest(secret, { ...input, authorization }, now)).toBe(false);
    for (const invalid of [
      undefined,
      `Bearer ${secret}`,
      "Poracode-Control invalid",
      `${authorization} `,
    ])
      expect(
        authenticateHostControlRequest(secret, { ...input, authorization: invalid }, now),
      ).toBe(false);
  });

  it("prevents reflected, stale-call and modified responses", () => {
    const authorization = createHostControlRequestProof(secret, input, now);
    const nextCall = createHostControlRequestProof(secret, input, now);
    const reply = Buffer.from('{"ok":true}');
    const proof = createHostControlResponseProof(secret, authorization, 200, reply);
    expect(
      verifyHostControlResponse(secret, authorization, 200, reply, authorization.split(".").at(-1)),
    ).toBe(false);
    expect(verifyHostControlResponse(secret, nextCall, 200, reply, proof)).toBe(false);
    expect(verifyHostControlResponse(secret, authorization, 500, reply, proof)).toBe(false);
    expect(
      verifyHostControlResponse(secret, authorization, 200, Buffer.from('{"ok":false}'), proof),
    ).toBe(false);
    expect(verifyHostControlResponse(otherSecret, authorization, 200, reply, proof)).toBe(false);
    expect(verifyHostControlResponse(secret, authorization, 200, reply, undefined)).toBe(false);
  });
});
