import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HostOwnerLease } from "./hostOwnerLease";
import { HOST_ROOT_MANIFEST_FILE, resolveHostRootPaths } from "./hostRootPaths";
import {
  createHostRootManifest,
  HostActivationRequiredError,
  HostImportRequiredError,
  prepareOwnedHostRoot,
  readHostRootManifest,
} from "./hostRootManifest";

const roots: string[] = [];
const leases: HostOwnerLease[] = [];

function owner() {
  const root = mkdtempSync(join(tmpdir(), "poracode-owner-manifest-"));
  roots.push(root);
  const lease = HostOwnerLease.acquire(
    resolveHostRootPaths(join(realpathSync.native(root), "profile")),
    "headless",
  );
  leases.push(lease);
  return lease;
}

afterEach(() => {
  for (const lease of leases.splice(0)) lease.release();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("owned host-root activation boundary", () => {
  it("creates a versioned empty host while leaving the profile namespace absent", () => {
    const lease = owner();
    const manifest = prepareOwnedHostRoot(lease);
    expect(manifest.source).toEqual({ kind: "empty", activation: "ready" });
    expect(readHostRootManifest(lease.paths)).toEqual(manifest);
    expect(existsSync(lease.paths.profileNamespace)).toBe(false);
    expect(prepareOwnedHostRoot(lease)).toEqual(manifest);
  });

  it("refuses an existing legacy profile before creating or changing its owned root", () => {
    const lease = owner();
    mkdirSync(lease.paths.profileNamespace);
    const settings = join(lease.paths.profileNamespace, "settings.json");
    const original = '{"synthetic":true,"scheduledAutomation":"must-remain-inactive"}\n';
    writeFileSync(settings, original);
    expect(() => prepareOwnedHostRoot(lease)).toThrow(HostImportRequiredError);
    expect(readFileSync(settings, "utf8")).toBe(original);
    expect(existsSync(lease.paths.dataRoot)).toBe(false);
  });

  it("does not reinterpret unmarked existing state as an empty installation", () => {
    const lease = owner();
    mkdirSync(lease.paths.dataRoot);
    const database = join(lease.paths.dataRoot, "state.sqlite");
    writeFileSync(database, "not-opened-by-bootstrap");
    expect(() => prepareOwnedHostRoot(lease)).toThrow(/without a valid/u);
    expect(readFileSync(database, "utf8")).toBe("not-opened-by-bootstrap");
    expect(existsSync(join(lease.paths.dataRoot, HOST_ROOT_MANIFEST_FILE))).toBe(false);
  });

  it("will not activate imported schedules, provider references or root-owned paths", () => {
    const lease = owner();
    mkdirSync(lease.paths.dataRoot);
    const manifest = createHostRootManifest(lease.paths, {
      kind: "offline-backup",
      activation: "required",
      receiptSha256: "a".repeat(64),
    });
    writeFileSync(join(lease.paths.dataRoot, HOST_ROOT_MANIFEST_FILE), JSON.stringify(manifest));
    expect(() => prepareOwnedHostRoot(lease)).toThrow(HostActivationRequiredError);
    expect(readHostRootManifest(lease.paths)).toEqual(manifest);
  });

  it.each([0, 2, "1", undefined])(
    "refuses an unknown layout without rewriting it (%s)",
    (version) => {
      const lease = owner();
      prepareOwnedHostRoot(lease);
      const path = join(lease.paths.dataRoot, HOST_ROOT_MANIFEST_FILE);
      const old = JSON.parse(readFileSync(path, "utf8"));
      const serialized = JSON.stringify({ ...old, layoutVersion: version });
      writeFileSync(path, serialized);
      expect(() => prepareOwnedHostRoot(lease)).toThrow(/Unsupported.*layout version/u);
      expect(readFileSync(path, "utf8")).toBe(serialized);
    },
  );

  it.each([
    { profileNamespace: "/some-other-profile" },
    { dataRoot: "/some-other-root" },
    { source: { kind: "offline-backup", activation: "ready" } },
    { source: { kind: "future", activation: "ready" } },
  ])("refuses a copied or unrecognized root marker (%j)", (change) => {
    const lease = owner();
    const manifest = prepareOwnedHostRoot(lease);
    const path = join(lease.paths.dataRoot, HOST_ROOT_MANIFEST_FILE);
    const serialized = JSON.stringify({ ...manifest, ...change });
    writeFileSync(path, serialized);
    expect(() => prepareOwnedHostRoot(lease)).toThrow(/manifest|activation/u);
    expect(readFileSync(path, "utf8")).toBe(serialized);
  });

  it("cannot initialize state after its owner generation is released", () => {
    const lease = owner();
    lease.release();
    expect(() => prepareOwnedHostRoot(lease)).toThrow(/no longer active/u);
    expect(existsSync(lease.paths.dataRoot)).toBe(false);
  });
});
