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
  writeHostRootManifest,
  type HostRootManifest,
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

  describe("activated offline-backup manifest form (Gate 2.5 S5.1)", () => {
    const activatedSource = () => ({
      kind: "offline-backup" as const,
      activation: "ready" as const,
      receiptSha256: "b".repeat(64),
      activationVersion: 1 as const,
      activatedAt: new Date().toISOString(),
    });

    function stagedRoot(lease: ReturnType<typeof owner>) {
      mkdirSync(lease.paths.dataRoot, { recursive: true });
      const staged = createHostRootManifest(lease.paths, {
        kind: "offline-backup",
        activation: "required",
        receiptSha256: "b".repeat(64),
      });
      writeFileSync(
        join(lease.paths.dataRoot, HOST_ROOT_MANIFEST_FILE),
        `${JSON.stringify(staged)}\n`,
      );
      return staged;
    }

    it("persists a validated activated manifest that normal startup accepts", () => {
      const lease = owner();
      const staged = stagedRoot(lease);
      expect(() => prepareOwnedHostRoot(lease)).toThrow(HostActivationRequiredError);
      const activated = { ...staged, source: activatedSource() };
      writeHostRootManifest(lease, activated);
      expect(readHostRootManifest(lease.paths)).toEqual(activated);
      // An activated root is ready: services may start after activation.
      expect(prepareOwnedHostRoot(lease)).toEqual(activated);
    });

    it("refuses a writer manifest bound to another profile or with an unsupported state", () => {
      const lease = owner();
      const activated = createHostRootManifest(lease.paths, activatedSource());
      expect(() =>
        writeHostRootManifest(lease, { ...activated, profileNamespace: "/some-other-profile" }),
      ).toThrow(/does not match this owned profile/u);
      expect(() =>
        writeHostRootManifest(lease, {
          ...activated,
          source: { kind: "offline-backup", activation: "ready" } as HostRootManifest["source"],
        }),
      ).toThrow(/activation state/u);
      expect(existsSync(join(lease.paths.dataRoot, HOST_ROOT_MANIFEST_FILE))).toBe(false);
    });

    it("pre-upgrade: the previous reader rules refuse an activated root loudly", () => {
      // Mirrors the pre-activation source discriminator in hostRootManifest.ts
      // (layout 1 before Gate 2.5 Batch 2): only empty/ready and staged
      // offline-backup/required were readable; every other offline-backup
      // state threw "Unsupported Poracode host-root activation state." — an
      // old binary therefore fails loudly on an activated root and can never
      // misread it as staged, empty, or startable-in-place.
      const lease = owner();
      const source = activatedSource();
      const activated = { ...stagedRoot(lease), source };
      const legacyReaderAccepts = (candidate: { kind: unknown; activation: unknown }): boolean =>
        (candidate.kind === "empty" && candidate.activation === "ready") ||
        (candidate.kind === "offline-backup" && candidate.activation === "required");
      expect(legacyReaderAccepts(activated.source)).toBe(false);
      // The current reader accepts the activated form and reports it as ready.
      writeFileSync(
        join(lease.paths.dataRoot, HOST_ROOT_MANIFEST_FILE),
        `${JSON.stringify(activated)}\n`,
      );
      expect(readHostRootManifest(lease.paths)?.source).toEqual(source);
    });
  });
});
