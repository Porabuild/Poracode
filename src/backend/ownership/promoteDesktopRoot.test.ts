import Database from "better-sqlite3";
import { createHash } from "node:crypto";
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
import { afterEach, describe, expect, it, vi } from "vitest";
import { readHostActivationRecordFromPaths } from "./activationHostRoot";
import {
  HOST_CREDENTIAL_STATE_FILE,
  secretKeyFingerprint,
  writeHostCredentialState,
} from "./hostCredentialState";
import {
  beginHostOperation,
  readHostOperationJournal,
  type HostOperationPlanEvidence,
} from "./hostOperationJournal";
import { HostOwnerLease } from "./hostOwnerLease";
import {
  HOST_ACTIVATION_MANIFEST_VERSION,
  prepareOwnedHostRoot,
  readHostRootManifest,
  writeHostRootManifest,
} from "./hostRootManifest";
import { resolveDesktopHostRootPaths } from "./hostRootPaths";
import { stageHostImport } from "./stageHostImport";
import {
  DesktopRootPromotionRefusalError,
  ensureDesktopOwnedRoot,
  inspectDesktopRootPromotion,
  type DesktopOsSealedKeyCodec,
} from "./promoteDesktopRoot";

const roots: string[] = [];
const leases: HostOwnerLease[] = [];

function scratch(): string {
  const created = mkdtempSync(join(tmpdir(), "poracode-promotion-"));
  roots.push(created);
  return realpathSync.native(created);
}

function acquireDesktopLease(namespace: string): HostOwnerLease {
  const lease = HostOwnerLease.acquire(resolveDesktopHostRootPaths(namespace), "desktop");
  leases.push(lease);
  return lease;
}

/** A plain pre-unification desktop root: database, settings, OS-sealed key. */
function seedPlainRoot(
  root: string,
  options: { withKeyFile?: boolean; key?: string } = {},
): { namespace: string; key: string; sealed: string; plainDatabaseSha256: string } {
  const namespace = join(root, "profile");
  mkdirSync(namespace, { recursive: true });
  const database = new Database(join(namespace, "state.sqlite"));
  database.exec(
    "CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);" +
      "CREATE TABLE threads (id TEXT PRIMARY KEY, title TEXT);" +
      "CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT);",
  );
  database.prepare("INSERT INTO app_state VALUES ('schema_version', '0')").run();
  database.prepare("INSERT INTO threads VALUES ('thread-1', 'pre-upgrade thread')").run();
  database.prepare("INSERT INTO threads VALUES ('thread-2', 'second thread')").run();
  database.prepare("INSERT INTO projects VALUES ('project-1', 'seeded project')").run();
  database.close();
  writeFileSync(join(namespace, "settings.json"), '{"synthetic":"plain-root"}\n');
  const key = options.key ?? Buffer.alloc(32, 7).toString("base64");
  const sealed = Buffer.from(`sealed:${key}`).toString("base64");
  if (options.withKeyFile !== false) {
    writeFileSync(join(namespace, "secret-key.safe"), `${sealed}\n`);
  }
  return {
    namespace,
    key,
    sealed,
    plainDatabaseSha256: createHash("sha256")
      .update(readFileSync(join(namespace, "state.sqlite")))
      .digest("hex"),
  };
}

/** Desktop key codec over the fixture's `sealed:<base64-key>` blob format. */
function fixtureCodec(expected: {
  key: string;
}): DesktopOsSealedKeyCodec & { unseal: (sealed: string) => Promise<string> } {
  return {
    unseal: vi.fn<(sealed: string) => Promise<string>>(async (sealed: string) => {
      const decoded = Buffer.from(sealed, "base64").toString("utf8");
      if (decoded !== `sealed:${expected.key}`) throw new Error("fixture unseal failure");
      return expected.key;
    }),
  };
}

function threadCount(databasePath: string): number {
  const database = new Database(databasePath, { readonly: true });
  try {
    return database.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM threads").get()?.n ?? -1;
  } finally {
    database.close();
  }
}

function promotionRecords(namespace: string): readonly { phase: string; operationId: string }[] {
  const journal = readHostOperationJournal(resolveDesktopHostRootPaths(namespace));
  return (journal?.operations ?? []).map((record) => ({
    phase: record.phase,
    operationId: record.operationId,
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const lease of leases.splice(0)) lease.release();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("desktop data-root promotion (V5 plan 1.3)", () => {
  it("promotes a seeded plain-root profile on the first managed launch and is a no-op on the second", async () => {
    const root = scratch();
    const seed = seedPlainRoot(root);
    const paths = resolveDesktopHostRootPaths(seed.namespace);
    const codec = fixtureCodec(seed);

    // First launch: the lease the admission holds is on the NEW root, and
    // the promotion makes every seeded thread visible from it.
    const firstLease = acquireDesktopLease(seed.namespace);
    expect(firstLease.paths.dataRoot).toBe(`${seed.namespace}.host-v1`);
    const prepared = await ensureDesktopOwnedRoot(firstLease, { osSealedKey: codec });
    expect(prepared.baseDir).toBe(`${seed.namespace}.host-v1`);

    expect(threadCount(join(paths.dataRoot, "state.sqlite"))).toBe(2);
    expect(readFileSync(join(paths.dataRoot, "settings.json"), "utf8")).toContain("plain-root");
    expect(readFileSync(join(paths.dataRoot, "secret-key.safe"), "utf8").trim()).toBe(seed.sealed);
    expect(readHostRootManifest(paths)?.source).toMatchObject({
      kind: "offline-backup",
      activation: "ready",
      activationVersion: HOST_ACTIVATION_MANIFEST_VERSION,
    });
    const state = JSON.parse(
      readFileSync(join(paths.dataRoot, HOST_CREDENTIAL_STATE_FILE), "utf8"),
    ) as { mode: string; keyFingerprint: string };
    expect(state.mode).toBe("os-sealed");
    expect(state.keyFingerprint).toBe(secretKeyFingerprint(seed.key));
    const record = readHostActivationRecordFromPaths(paths);
    expect(record?.sourceBackupPath).toBe(seed.namespace);
    expect(record?.credentialOutcome).toBe("desktop-os-sealed-key");
    expect(record?.resumedAt).toBeUndefined();
    expect(promotionRecords(seed.namespace)).toEqual([
      { phase: "completed", operationId: expect.any(String) },
    ]);
    // The plain root is the preserved pre-promotion copy, byte-identical.
    expect(
      createHash("sha256")
        .update(readFileSync(join(seed.namespace, "state.sqlite")))
        .digest("hex"),
    ).toBe(seed.plainDatabaseSha256);
    expect(existsSync(join(seed.namespace, "host-root.json"))).toBe(false);

    // Second launch: re-acquire under a fresh generation and ensure again —
    // no re-staging, no second journal record, no duplicated data.
    firstLease.release();
    const secondLease = acquireDesktopLease(seed.namespace);
    await expect(ensureDesktopOwnedRoot(secondLease, { osSealedKey: codec })).resolves.toEqual(
      prepared,
    );
    expect(codec.unseal).toHaveBeenCalledTimes(1);
    expect(threadCount(join(paths.dataRoot, "state.sqlite"))).toBe(2);
    expect(promotionRecords(seed.namespace)).toEqual([
      { phase: "completed", operationId: expect.any(String) },
    ]);
    expect(readHostActivationRecordFromPaths(paths)?.resumedAt).toBeUndefined();
  });

  it("resumes an interrupted promotion whose credential state landed but manifest did not flip", async () => {
    const root = scratch();
    const seed = seedPlainRoot(root);
    const paths = resolveDesktopHostRootPaths(seed.namespace);
    const lease = acquireDesktopLease(seed.namespace);
    await stageHostImport(lease, {
      sourceBackupPath: seed.namespace,
      sourceDeclaredOffline: true,
      promoteProfileNamespaceSource: true,
    });
    // Crash window: the custody mutation wrote the credential state, but the
    // manifest flip, activation record and journal completion never ran.
    const plan: HostOperationPlanEvidence = {
      credentialOutcome: "desktop-os-sealed-key",
      archivedKeyFiles: [],
      keyFingerprint: secretKeyFingerprint(seed.key),
    };
    const receipt = JSON.parse(readFileSync(join(paths.dataRoot, "host-import.json"), "utf8")) as {
      createdAt: string;
    };
    beginHostOperation(lease, {
      operation: "promotion",
      operationId: receipt.createdAt,
      plan,
    });
    writeHostCredentialState(lease, "os-sealed", seed.key);
    lease.release();

    const resumedLease = acquireDesktopLease(seed.namespace);
    await expect(
      ensureDesktopOwnedRoot(resumedLease, { osSealedKey: fixtureCodec(seed) }),
    ).resolves.toMatchObject({ baseDir: paths.dataRoot });

    expect(readHostRootManifest(paths)?.source.activation).toBe("ready");
    expect(threadCount(join(paths.dataRoot, "state.sqlite"))).toBe(2);
    const record = readHostActivationRecordFromPaths(paths);
    expect(record?.credentialOutcome).toBe("desktop-os-sealed-key");
    // The redo path re-applies the (deterministic) custody from re-verified
    // staged evidence: a fresh application, not a resumed completion marker.
    expect(record?.resumedAt).toBeUndefined();
    expect(promotionRecords(seed.namespace)).toEqual([
      { phase: "completed", operationId: expect.any(String) },
    ]);
  });

  it("resumes an interrupted promotion whose manifest flipped but whose record and journal did not settle", async () => {
    const root = scratch();
    const seed = seedPlainRoot(root);
    const paths = resolveDesktopHostRootPaths(seed.namespace);
    const lease = acquireDesktopLease(seed.namespace);
    await stageHostImport(lease, {
      sourceBackupPath: seed.namespace,
      sourceDeclaredOffline: true,
      promoteProfileNamespaceSource: true,
    });
    const receipt = JSON.parse(readFileSync(join(paths.dataRoot, "host-import.json"), "utf8")) as {
      createdAt: string;
      sourceBackupPath: string;
    };
    const plan: HostOperationPlanEvidence = {
      credentialOutcome: "desktop-os-sealed-key",
      archivedKeyFiles: [],
      keyFingerprint: secretKeyFingerprint(seed.key),
    };
    beginHostOperation(lease, { operation: "promotion", operationId: receipt.createdAt, plan });
    writeHostCredentialState(lease, "os-sealed", seed.key);
    const manifest = readHostRootManifest(paths);
    if (manifest === undefined || manifest.source.kind !== "offline-backup") {
      throw new Error("fixture staging manifest missing");
    }
    writeHostRootManifest(lease, {
      ...manifest,
      source: {
        kind: "offline-backup",
        activation: "ready",
        receiptSha256: manifest.source.receiptSha256,
        activationVersion: HOST_ACTIVATION_MANIFEST_VERSION,
        activatedAt: new Date().toISOString(),
      },
    });
    lease.release();

    const resumedLease = acquireDesktopLease(seed.namespace);
    await ensureDesktopOwnedRoot(resumedLease, { osSealedKey: fixtureCodec(seed) });

    expect(threadCount(join(paths.dataRoot, "state.sqlite"))).toBe(2);
    expect(readHostActivationRecordFromPaths(paths)?.resumedAt).toBeDefined();
    expect(promotionRecords(seed.namespace)).toEqual([
      { phase: "completed", operationId: receipt.createdAt },
    ]);
  });

  it("refuses loudly when both roots exist with data and the owned root is not this promotion", async () => {
    const root = scratch();
    const namespace = join(root, "profile");
    const paths = resolveDesktopHostRootPaths(namespace);
    // An independent, already-activated owned root (for example created by
    // the standalone server), and only then a database in the plain root.
    const lease = acquireDesktopLease(namespace);
    prepareOwnedHostRoot(lease);
    const seed = seedPlainRoot(root);

    expect(inspectDesktopRootPromotion(paths).kind).toBe("refuse");
    await expect(
      ensureDesktopOwnedRoot(lease, { osSealedKey: fixtureCodec(seed) }),
    ).rejects.toBeInstanceOf(DesktopRootPromotionRefusalError);
    // Nothing was changed: the independent owned root stays as it was.
    expect(readHostRootManifest(paths)?.source).toMatchObject({ kind: "empty" });
    expect(existsSync(join(paths.dataRoot, "state.sqlite"))).toBe(false);
  });

  it("never auto-activates a foreign staged import", async () => {
    const root = scratch();
    const seed = seedPlainRoot(root);
    const paths = resolveDesktopHostRootPaths(seed.namespace);
    const foreign = join(root, "offline-backup");
    mkdirSync(foreign);
    const foreignDatabase = new Database(join(foreign, "state.sqlite"));
    foreignDatabase.exec("CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    foreignDatabase.close();
    const lease = acquireDesktopLease(seed.namespace);
    await stageHostImport(lease, { sourceBackupPath: foreign, sourceDeclaredOffline: true });

    expect(inspectDesktopRootPromotion(paths).kind).toBe("refuse");
    await expect(ensureDesktopOwnedRoot(lease)).rejects.toThrow(/poracode-server activate/u);
  });

  it("records honest session-only custody when OS-backed secret storage is unavailable", async () => {
    const root = scratch();
    const seed = seedPlainRoot(root);
    const paths = resolveDesktopHostRootPaths(seed.namespace);
    const lease = acquireDesktopLease(seed.namespace);

    await expect(ensureDesktopOwnedRoot(lease)).resolves.toMatchObject({
      baseDir: paths.dataRoot,
    });

    expect(readHostRootManifest(paths)?.source.activation).toBe("ready");
    const state = JSON.parse(
      readFileSync(join(paths.dataRoot, HOST_CREDENTIAL_STATE_FILE), "utf8"),
    ) as { mode: string; keyFingerprint: string | null };
    expect(state.mode).toBe("session-only");
    expect(state.keyFingerprint).toBeNull();
    // The sealed key file is preserved untouched for a later healthy launch.
    expect(readFileSync(join(paths.dataRoot, "secret-key.safe"), "utf8").trim()).toBe(seed.sealed);
  });

  it("starts a fresh owned root for a namespace without promotable data and copies no key", async () => {
    const root = scratch();
    const namespace = join(root, "profile");
    const lease = acquireDesktopLease(namespace);

    const prepared = await ensureDesktopOwnedRoot(lease);

    const paths = resolveDesktopHostRootPaths(namespace);
    expect(prepared.baseDir).toBe(paths.dataRoot);
    expect(readHostRootManifest(paths)?.source).toMatchObject({
      kind: "empty",
      activation: "ready",
    });
    expect(existsSync(join(paths.dataRoot, HOST_CREDENTIAL_STATE_FILE))).toBe(false);
    expect(promotionRecords(namespace)).toEqual([]);
  });

  it("classifies decisions without a lease", () => {
    const root = scratch();
    const namespace = join(root, "profile");
    const paths = resolveDesktopHostRootPaths(namespace);
    expect(inspectDesktopRootPromotion(paths)).toEqual({ kind: "fresh" });

    seedPlainRoot(root);
    expect(inspectDesktopRootPromotion(paths)).toEqual({ kind: "required" });
  });
});
