import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HostControlServer } from "@/backend/ownership/HostControlServer";
import * as hostControlClient from "@/backend/ownership/hostControlClient";
import { HostOwnerLease } from "@/backend/ownership/hostOwnerLease";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { prepareOwnedHostRoot } from "@/backend/ownership/hostRootManifest";
import {
  requestHostStatusFromRunningServer,
  requestHostStatusDetailsFromRunningServer,
  requestPairingFromRunningServer,
} from "./pairingControl";

const cleanup: Array<() => Promise<void>> = [];

async function fixture(details = false) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-pair-control-")));
  const profile = join(root, "profile");
  const paths = resolveHostRootPaths(profile);
  const lease = HostOwnerLease.acquire(paths, "headless");
  prepareOwnedHostRoot(lease);
  const issuePairing = vi.fn<() => string>(() => "https://fixture.test/pair#token=fixture");
  const control = new HostControlServer({
    lease,
    ...(details
      ? {
          status: () => ({
            state: "ready" as const,
            admission: "held" as const,
            endpoint: "https://fixture.test/base/",
            build: {
              version: "2.0.0",
              sourceRevision: "fixture-revision",
              entrypointSha256: "d".repeat(64),
              root,
              layoutKind: "prefix" as const,
            },
          }),
        }
      : {}),
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
        autoUpdate: false,
        osNotifications: false,
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

  it("forwards a viewer scope preset to the owner", async () => {
    const test = await fixture();
    await test.control.start();
    await requestPairingFromRunningServer(test.profile, { preset: "viewer" });
    expect(test.issuePairing).toHaveBeenCalledWith(
      expect.objectContaining({ pairingPreset: "viewer" }),
    );
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

  it("reads the authenticated running build and admission without issuing a grant", async () => {
    const test = await fixture(true);
    await test.control.start();
    const basic = await requestHostStatusFromRunningServer(test.profile);
    const calls = vi.spyOn(hostControlClient, "callHostControl");
    const details = await requestHostStatusDetailsFromRunningServer(test.profile);
    expect(calls).toHaveBeenNthCalledWith(1, resolveHostRootPaths(test.profile), "describe", {});
    expect(calls).toHaveBeenNthCalledWith(2, resolveHostRootPaths(test.profile), "status", {
      expectedGeneration: basic.ownerGeneration,
    });
    expect(details.ownerGeneration).toBe(basic.ownerGeneration);
    expect(details.status).toMatchObject({
      profileNamespace: basic.description.profileNamespace,
      dataRoot: basic.description.dataRoot,
      mode: "headless",
      admission: "held",
      endpoint: "https://fixture.test/base/",
      build: { version: "2.0.0", entrypointSha256: "d".repeat(64) },
    });
    expect(test.issuePairing).not.toHaveBeenCalled();
  });

  it("refuses unsupported detailed status while leaving basic status available", async () => {
    const test = await fixture();
    await test.control.start();
    await expect(requestHostStatusDetailsFromRunningServer(test.profile)).rejects.toThrow(
      "does not provide detailed status",
    );
    await expect(requestHostStatusFromRunningServer(test.profile)).resolves.toMatchObject({
      description: { state: "ready" },
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
