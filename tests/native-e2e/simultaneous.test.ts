import { afterEach, describe, expect, it } from "vitest";
import { pairingTokenFromUrl } from "./harness/wireLab.ts";
import { exchangeToken, startLab } from "./helpers/testClient.ts";
import { portsForSlot } from "./harness/runDirectory.ts";

describe("simultaneous isolated harness runs", () => {
  const harnesses: Array<Awaited<ReturnType<typeof startLab>>> = [];

  afterEach(async () => {
    while (harnesses.length > 0) {
      await harnesses.pop()?.stop();
    }
  });

  it("runs two labs at once on distinct ports with isolated pairing and replay", async () => {
    const [left, right] = await Promise.all([startLab(), startLab()]);
    harnesses.push(left, right);

    expect(left.hostPort).not.toBe(right.hostPort);
    expect(left.controlPort).not.toBe(right.controlPort);
    expect(left.capability).not.toBe(right.capability);

    const leftCredential = pairingTokenFromUrl(left.lab.issuePairingUrl().pairingUrl);
    const rightCredential = pairingTokenFromUrl(right.lab.issuePairingUrl().pairingUrl);
    expect(leftCredential).not.toBe(rightCredential);

    const leftToken = await exchangeToken(left.httpBaseUrl, leftCredential, ["session:read"]);
    expect(leftToken.status).toBe(200);
    const stolen = await exchangeToken(right.httpBaseUrl, leftCredential, ["session:read"]);
    expect(stolen.status).toBe(401);

    left.lab.publishEvent({ type: "thread-state", threadId: "left-only" });
    expect(left.lab.ring.seq).toBe(1);
    expect(right.lab.ring.seq).toBe(0);

    const leftState = await fetch(new URL("/v1/state", left.controlUrl), {
      headers: { authorization: `Harness ${left.capability}` },
    });
    const rightState = await fetch(new URL("/v1/state", left.controlUrl), {
      headers: { authorization: `Harness ${right.capability}` },
    });
    expect(leftState.status).toBe(200);
    expect(rightState.status).toBe(401);
  });

  it("assigns disjoint reserved port blocks to adjacent slots", () => {
    const slotZero = portsForSlot(0);
    const slotOne = portsForSlot(1);
    const left = [
      slotZero.appHost,
      slotZero.control,
      slotZero.relay,
      slotZero.productionHost,
      slotZero.upstream,
    ];
    const right = [
      slotOne.appHost,
      slotOne.control,
      slotOne.relay,
      slotOne.productionHost,
      slotOne.upstream,
    ];
    expect(new Set([...left, ...right]).size).toBe(10);
    expect(slotOne.base).toBe(slotZero.base + 8);
  });
});
