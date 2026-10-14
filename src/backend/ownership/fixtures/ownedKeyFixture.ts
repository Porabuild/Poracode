import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";
import { HostOwnerLease, type HostOwnerKind } from "../hostOwnerLease";
import { resolveHostRootPaths } from "../hostRootPaths";
import { prepareOwnedHostRoot } from "../hostRootManifest";
import type { NativeSecretCodec } from "../ownedSecretKey";

const roots: string[] = [];
const leases: HostOwnerLease[] = [];

export function ownedKeyFixture(kind: HostOwnerKind = "headless") {
  const created = mkdtempSync(join(tmpdir(), "poracode-owned-key-"));
  roots.push(created);
  const paths = resolveHostRootPaths(join(realpathSync.native(created), "profile"));
  function acquire() {
    const lease = HostOwnerLease.acquire(paths, kind);
    leases.push(lease);
    return lease;
  }
  const value = {
    paths,
    lease: acquire(),
    restart() {
      value.lease.release();
      value.lease = acquire();
      return value.lease;
    },
  };
  prepareOwnedHostRoot(value.lease);
  return value;
}

/** Synthetic codec; this verifies the boundary, not a real OS keychain. */
export function syntheticNativeCodec() {
  return {
    seal: vi.fn<NativeSecretCodec["seal"]>(async (request) => ({
      ownerGeneration: request.ownerGeneration,
      value: Buffer.from(`sealed:${request.value}`).toString("base64"),
    })),
    unseal: vi.fn<NativeSecretCodec["unseal"]>(async (request) => ({
      ownerGeneration: request.ownerGeneration,
      value: Buffer.from(request.value, "base64").toString().slice("sealed:".length),
    })),
  };
}

export function cleanOwnedKeyFixtures() {
  vi.restoreAllMocks();
  for (const lease of leases.splice(0)) lease.release();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
}
