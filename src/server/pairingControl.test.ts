import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HostControlServer } from "@/backend/ownership/HostControlServer";
import { HostOwnerLease } from "@/backend/ownership/hostOwnerLease";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { prepareOwnedHostRoot } from "@/backend/ownership/hostRootManifest";
import {
  requestHostStatusFromRunningServer,
  requestPairingFromRunningServer,
} from "./pairingControl";

const cleanup: Array<() => Promise<void>> = [];

async function fixture() {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-pair-control-")));
  const profile = join(root, "profile");
  const paths = resolveHostRootPaths(profile);
  const lease = HostOwnerLease.acquire(paths, "headless");
  prepareOwnedHostRoot(lease);
  const issuePairing = vi.fn<() => string>(() => "https://fixture.test/pair#token=fixture");
  const control = new HostControlServer({
    lease,
    describe: () => ({
      state: "ready",
      remoteProtocolVersion: 12,
      endpoint: "https://fixture.test/",
      capabilities: {
        ssh: true,
        browserPanel: false,
        chromeBridge: true,
        computerUse: true,
        nativeSecrets: false,
        portForward: true,
      },
    }),
    issuePairing,
  });
  cleanup.push(async () => {
    await control.dispose();
    lease.release();
    rmSync(root, { recursive: true, force: true });
  });
  return { profile, control, issuePairing };
}

afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
  vi.restoreAllMocks();
});

describe("pairing CLI owner adapter", () => {
  it("preserves the pair --json result while allowing concurrent local clients", async () => {
    const test = await fixture();
    await test.control.start();
    const replies = await Promise.all([
      requestPairingFromRunningServer(test.profile),
      requestPairingFromRunningServer(test.profile),
    ]);
    for (const reply of replies) {
      expect(Object.keys(reply).sort()).toEqual(["pairingUrl", "requestId"]);
      expect(reply.pairingUrl).toBe("https://fixture.test/pair#token=fixture");
    }
    expect(replies[0]!.requestId).not.toBe(replies[1]!.requestId);
    expect(test.issuePairing).toHaveBeenCalledTimes(2);
  });

  it("reads owner status without rotating or minting a pairing credential", async () => {
    const test = await fixture();
    await test.control.start();
    await expect(requestHostStatusFromRunningServer(test.profile)).resolves.toMatchObject({
      description: {
        mode: "headless",
        state: "ready",
        endpoint: "https://fixture.test/",
      },
    });
    expect(test.issuePairing).not.toHaveBeenCalled();
  });

  it("does not signal or repair a legacy PID record when current control is unavailable", async () => {
    const test = await fixture();
    mkdirSync(test.profile);
    const marker = join(test.profile, "server.lock");
    writeFileSync(marker, "4242");
    const signal = vi.spyOn(process, "kill").mockReturnValue(true);
    await expect(requestPairingFromRunningServer(test.profile)).rejects.toThrow("unavailable");
    expect(signal).not.toHaveBeenCalled();
    expect(readFileSync(marker, "utf8")).toBe("4242");
    expect(test.issuePairing).not.toHaveBeenCalled();
  });

  it("refuses pairing after joined control stop", async () => {
    const test = await fixture();
    await test.control.start();
    await test.control.dispose();
    await expect(requestPairingFromRunningServer(test.profile)).rejects.toThrow("unavailable");
    expect(test.issuePairing).not.toHaveBeenCalled();
  });
});
