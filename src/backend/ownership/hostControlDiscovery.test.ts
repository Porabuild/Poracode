import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HOST_CONTROL_DISCOVERY_FILE } from "@/shared/hostControlProtocol";
import { HostOwnerLease } from "./hostOwnerLease";
import { resolveHostRootPaths } from "./hostRootPaths";
import { prepareOwnedHostRoot } from "./hostRootManifest";
import {
  publishHostControlDiscovery,
  readHostControlDiscovery,
  removeHostControlDiscovery,
} from "./hostControlDiscovery";

const cleanups: Array<() => void> = [];
const token = Buffer.alloc(32, 17).toString("base64url");

function fixture() {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-control-discovery-")));
  const paths = resolveHostRootPaths(join(root, "profile"));
  const lease = HostOwnerLease.acquire(paths, "headless");
  prepareOwnedHostRoot(lease);
  cleanups.push(() => {
    lease.release();
    rmSync(root, { recursive: true, force: true });
  });
  const path = join(paths.dataRoot, HOST_CONTROL_DISCOVERY_FILE);
  return { root, paths, lease, path };
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

describe("owner control discovery", () => {
  it("publishes only private discovery under the actual root and removes it under the lease", () => {
    const test = fixture();
    const record = publishHostControlDiscovery(test.lease, 43123, token);
    expect(readHostControlDiscovery(test.paths)).toEqual(record);
    expect(Object.keys(record).sort()).toEqual([
      "dataRoot",
      "formatVersion",
      "ownerGeneration",
      "profileNamespace",
      "token",
      "transport",
    ]);
    expect(existsSync(test.paths.profileNamespace)).toBe(false);
    expect(existsSync(join(test.paths.dataRoot, "secret-key.headless"))).toBe(false);
    removeHostControlDiscovery(test.lease);
    expect(existsSync(test.path)).toBe(false);
  });

  it.skipIf(process.platform === "win32")("publishes with owner-only permissions", () => {
    const test = fixture();
    publishHostControlDiscovery(test.lease, 43123, token);
    expect(statSync(test.path).mode & 0o777).toBe(0o600);
  });

  it.each(["missing", "corrupt", "oversized", "symlink", "hardlink"])(
    "refuses %s discovery without editing it or following a signal fallback",
    (shape) => {
      const test = fixture();
      const other = join(test.root, "other.json");
      if (shape === "corrupt") writeFileSync(test.path, "invalid-json", { mode: 0o600 });
      if (shape === "oversized") writeFileSync(test.path, " ".repeat(20_000), { mode: 0o600 });
      if (shape === "symlink" || shape === "hardlink") {
        writeFileSync(other, "{}", { mode: 0o600 });
        if (shape === "symlink") symlinkSync(other, test.path);
        else linkSync(other, test.path);
      }
      expect(() => readHostControlDiscovery(test.paths)).toThrow("unavailable");
      expect(existsSync(test.path)).toBe(shape !== "missing");
    },
  );

  it.skipIf(process.platform === "win32")("refuses a group-readable MAC record", () => {
    const test = fixture();
    publishHostControlDiscovery(test.lease, 43123, token);
    chmodSync(test.path, 0o640);
    expect(() => readHostControlDiscovery(test.paths)).toThrow("unavailable");
  });

  it.each([
    { formatVersion: 0 },
    { formatVersion: 2 },
    { ownerGeneration: randomUUID() },
    { profileNamespace: "/unrelated" },
    { dataRoot: "/unrelated.host-v1" },
    { token: "bad" },
    { token: `${"A".repeat(42)}B` },
    { transport: { kind: "http-loopback", port: 0 } },
    { transport: { kind: "http", url: "http://foreign.example.test" } },
    { extraKey: "unsupported" },
  ])("refuses incompatible or foreign discovery (%j)", (changed) => {
    const test = fixture();
    const original = publishHostControlDiscovery(test.lease, 43123, token);
    const bytes = JSON.stringify({ ...original, ...changed });
    writeFileSync(test.path, bytes);
    expect(() => readHostControlDiscovery(test.paths)).toThrow("unavailable");
    removeHostControlDiscovery(test.lease);
    expect(readFileSync(test.path, "utf8")).toBe(bytes);
  });

  it("rejects a stopped owner and replaces its stale record only after successor acquisition", () => {
    const test = fixture();
    const first = publishHostControlDiscovery(test.lease, 43123, token);
    test.lease.release();
    expect(() => readHostControlDiscovery(test.paths)).toThrow("unavailable");
    expect(() => publishHostControlDiscovery(test.lease, 43124, token)).toThrow("no longer active");
    const successor = HostOwnerLease.acquire(test.paths, "headless");
    try {
      expect(() => readHostControlDiscovery(test.paths)).toThrow("unavailable");
      const next = publishHostControlDiscovery(
        successor,
        43124,
        Buffer.alloc(32, 19).toString("base64url"),
      );
      expect(next.ownerGeneration).not.toBe(first.ownerGeneration);
      expect(readHostControlDiscovery(test.paths)).toEqual(next);
      expect(() => removeHostControlDiscovery(test.lease)).toThrow("no longer active");
    } finally {
      removeHostControlDiscovery(successor);
      successor.release();
    }
  });
});
