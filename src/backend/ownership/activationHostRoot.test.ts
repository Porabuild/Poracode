import Database from "better-sqlite3";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HostOwnerController } from "./HostOwnerController";
import { HostOwnerLease } from "./hostOwnerLease";
import {
  HOST_ACTIVATION_ARCHIVE_DIR,
  HOST_ACTIVATION_RECORD_FILE,
  HostActivationCooperationRequiredError,
  HostStagedImportMissingError,
  activateStagedHostRoot,
  readHostActivationRecord,
} from "./activationHostRoot";
import { HOST_CREDENTIAL_STATE_FILE, secretKeyFingerprint } from "./hostCredentialState";
import { readHostRootManifest } from "./hostRootManifest";
import { resolveDesktopHostRootPaths, resolveHostRootPaths } from "./hostRootPaths";
import { stageHostImport } from "./stageHostImport";
import {
  HOST_KEY_ADOPTION_OFFER_FILE,
  HostCredentialAdoptionService,
  requestNativeKeyAdoption,
} from "./nativeSecretKey";

const roots: string[] = [];

function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), "poracode-activation-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function buildOfflineBackup(root: string, keyFile?: { name: string; value: string }): string {
  const source = join(root, "backup");
  mkdirSync(source, { recursive: true });
  const database = new Database(join(source, "state.sqlite"));
  database.exec("CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  database.prepare("INSERT INTO app_state (key, value) VALUES ('schema_version', '0')").run();
  database.close();
  writeFileSync(join(source, "settings.json"), '{"synthetic":true}\n');
  if (keyFile) writeFileSync(join(source, keyFile.name), keyFile.value);
  return source;
}

async function stageBackup(namespace: string, source: string): Promise<void> {
  const lease = HostOwnerLease.acquire(resolveHostRootPaths(namespace), "headless");
  try {
    await stageHostImport(lease, { sourceBackupPath: source, sourceDeclaredOffline: true });
  } finally {
    lease.release();
  }
}

function headlessKey(byte: number): string {
  return Buffer.alloc(32, byte).toString("base64");
}

describe("staged host activation (Gate 2.5 S5.1)", () => {
  it("adopts a staged headless-file key and keeps it across owner restarts", async () => {
    const root = scratch();
    const namespace = join(realpathSync.native(root), "profile");
    const key = headlessKey(3);
    await stageBackup(
      namespace,
      buildOfflineBackup(root, { name: "secret-key.headless", value: key }),
    );

    const result = await activateStagedHostRoot({ profileNamespace: namespace });

    expect(result.credentialOutcome).toBe("adopted-existing-key");
    expect(result.keyFingerprint).toBe(secretKeyFingerprint(key));
    expect(readFileSync(join(result.dataRoot, "secret-key.headless"), "utf8").trim()).toBe(key);
    // Restart custody: the controller-owned initialization adopts the activated
    // key in one owner generation and again after a full restart.
    const first = HostOwnerController.acquire(namespace, "headless");
    const runtime = await first.initialize({ mode: "headless" });
    expect(runtime.secretStorageKey).toBe(key);
    expect(runtime.credentialCapabilities.canPersistSecrets).toBe(true);
    await first.close();
    const second = HostOwnerController.acquire(namespace, "headless");
    expect((await second.initialize({ mode: "headless" })).secretStorageKey).toBe(key);
    await second.close();
  });

  it("adopts an OS-sealed key through the one-time desktop cooperation protocol", async () => {
    const root = scratch();
    const namespace = join(realpathSync.native(root), "profile");
    mkdirSync(namespace, { recursive: true });
    const key = headlessKey(5);
    const sealed = Buffer.from(`sealed:${key}`).toString("base64");
    await stageBackup(
      namespace,
      buildOfflineBackup(root, { name: "secret-key.safe", value: sealed }),
    );

    const desktopLease = HostOwnerLease.acquire(resolveDesktopHostRootPaths(namespace), "desktop");
    const service = new HostCredentialAdoptionService({
      lease: desktopLease,
      unseal: async (value, generation) => {
        expect(generation).toBe(desktopLease.generation);
        return Buffer.from(value, "base64").toString().slice("sealed:".length);
      },
    });
    await service.start();
    try {
      const result = await activateStagedHostRoot({
        profileNamespace: namespace,
        unsealCooperation: (sealedKey) =>
          requestNativeKeyAdoption(resolveDesktopHostRootPaths(namespace), sealedKey),
        leasePollMs: 10,
        // The cooperating desktop holds the shared lease; quitting it is the
        // operator action the bounded wait exists for.
        onOwnerWait: () => desktopLease.release(),
      });
      expect(result.credentialOutcome).toBe("adopted-os-sealed-key");
      expect(result.keyFingerprint).toBe(secretKeyFingerprint(key));
      // The safe blob was archived out of the key-file scan and the offer was
      // retired before the answer was returned.
      expect(existsSync(join(result.dataRoot, "secret-key.safe"))).toBe(false);
      expect(
        readFileSync(
          join(result.dataRoot, HOST_ACTIVATION_ARCHIVE_DIR, "secret-key.safe"),
          "utf8",
        ).trim(),
      ).toBe(sealed);
      expect(existsSync(join(namespace, HOST_KEY_ADOPTION_OFFER_FILE))).toBe(false);
      // The adopted key material keeps the imported payloads decryptable.
      const controller = HostOwnerController.acquire(namespace, "headless");
      expect((await controller.initialize({ mode: "headless" })).secretStorageKey).toBe(key);
      await controller.close();
    } finally {
      await service.dispose().catch(() => undefined);
      desktopLease.release();
    }
  });

  it("archives the staged OS-sealed key and starts fresh on the sign-in-again fallback", async () => {
    const root = scratch();
    const namespace = join(realpathSync.native(root), "profile");
    const previousKey = headlessKey(7);
    const sealed = Buffer.from(`sealed:${previousKey}`).toString("base64");
    await stageBackup(
      namespace,
      buildOfflineBackup(root, { name: "secret-key.safe", value: sealed }),
    );

    const result = await activateStagedHostRoot({
      profileNamespace: namespace,
      fallback: "sign-in-again",
    });

    expect(result.credentialOutcome).toBe("fresh-key-sign-in-again");
    expect(result.keyFingerprint).not.toBe(secretKeyFingerprint(previousKey));
    expect(existsSync(join(result.dataRoot, "secret-key.safe"))).toBe(false);
    expect(existsSync(join(result.dataRoot, HOST_ACTIVATION_ARCHIVE_DIR, "secret-key.safe"))).toBe(
      true,
    );
    // A fresh key means imported sealed values can no longer decrypt; the
    // controller-owned path uses the fresh key consistently across restarts.
    const controller = HostOwnerController.acquire(namespace, "headless");
    const fresh = (await controller.initialize({ mode: "headless" })).secretStorageKey;
    expect(secretKeyFingerprint(fresh)).toBe(result.keyFingerprint);
    await controller.close();
    const restarted = HostOwnerController.acquire(namespace, "headless");
    expect((await restarted.initialize({ mode: "headless" })).secretStorageKey).toBe(fresh);
    await restarted.close();
  });

  it("refuses an OS-sealed staged root when cooperation is unavailable", async () => {
    const root = scratch();
    const namespace = join(realpathSync.native(root), "profile");
    const sealed = Buffer.from(`sealed:${headlessKey(9)}`).toString("base64");
    await stageBackup(
      namespace,
      buildOfflineBackup(root, { name: "secret-key.safe", value: sealed }),
    );
    const paths = resolveHostRootPaths(namespace);

    await expect(activateStagedHostRoot({ profileNamespace: namespace })).rejects.toThrow(
      HostActivationCooperationRequiredError,
    );
    // Refused-by-default-until-activated stays, and the staged root is intact.
    expect(readHostRootManifest(paths)?.source.activation).toBe("required");
    expect(existsSync(join(paths.dataRoot, "secret-key.safe"))).toBe(true);
    expect(existsSync(join(paths.dataRoot, HOST_ACTIVATION_RECORD_FILE))).toBe(false);
  });

  it("refuses and changes nothing when the staged database no longer matches its hash", async () => {
    const root = scratch();
    const namespace = join(realpathSync.native(root), "profile");
    await stageBackup(
      namespace,
      buildOfflineBackup(root, { name: "secret-key.headless", value: headlessKey(11) }),
    );
    const paths = resolveHostRootPaths(namespace);
    appendFileSync(join(paths.dataRoot, "state.sqlite"), "tampered");

    await expect(activateStagedHostRoot({ profileNamespace: namespace })).rejects.toThrow(
      /staged database no longer matches/u,
    );
    expect(existsSync(join(paths.dataRoot, HOST_ACTIVATION_RECORD_FILE))).toBe(false);
    expect(readHostRootManifest(paths)?.source.activation).toBe("required");
    expect(existsSync(join(paths.dataRoot, "secret-key.headless"))).toBe(true);
  });

  it("refuses when the staged file inventory no longer matches its receipt", async () => {
    const root = scratch();
    const namespace = join(realpathSync.native(root), "profile");
    await stageBackup(
      namespace,
      buildOfflineBackup(root, { name: "secret-key.headless", value: headlessKey(13) }),
    );
    const paths = resolveHostRootPaths(namespace);
    writeFileSync(join(paths.dataRoot, "unexpected.txt"), "added after staging");

    await expect(activateStagedHostRoot({ profileNamespace: namespace })).rejects.toThrow(
      /no longer matches its verified inventory/u,
    );
    expect(existsSync(join(paths.dataRoot, HOST_ACTIVATION_RECORD_FILE))).toBe(false);
  });

  it("refuses a half-adopted root left by a crashed activation instead of re-activating", async () => {
    const root = scratch();
    const namespace = join(realpathSync.native(root), "profile");
    const sealed = Buffer.from(`sealed:${headlessKey(19)}`).toString("base64");
    await stageBackup(
      namespace,
      buildOfflineBackup(root, { name: "secret-key.safe", value: sealed }),
    );
    const paths = resolveHostRootPaths(namespace);
    // Crash point inside applyActivatedCustody: the staged key was archived and
    // its material adopted as the headless key, but the manifest flip, the
    // activation record and the receipt supersession never ran. The single
    // mutation is deliberately not atomic; re-running must detect the changed
    // root loudly and re-stage, never treat the half-adopted state as staged
    // evidence.
    mkdirSync(join(paths.dataRoot, HOST_ACTIVATION_ARCHIVE_DIR), { recursive: true, mode: 0o700 });
    renameSync(
      join(paths.dataRoot, "secret-key.safe"),
      join(paths.dataRoot, HOST_ACTIVATION_ARCHIVE_DIR, "secret-key.safe"),
    );
    writeFileSync(join(paths.dataRoot, "secret-key.headless"), `${headlessKey(21)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });

    await expect(activateStagedHostRoot({ profileNamespace: namespace })).rejects.toThrow(
      /no longer matches its verified inventory/u,
    );
    expect(existsSync(join(paths.dataRoot, HOST_ACTIVATION_RECORD_FILE))).toBe(false);
    expect(readHostRootManifest(paths)?.source.activation).toBe("required");
  });

  it("refuses an unusable cooperation answer without changing the staged root", async () => {
    const root = scratch();
    const namespace = join(realpathSync.native(root), "profile");
    const sealed = Buffer.from(`sealed:${headlessKey(15)}`).toString("base64");
    await stageBackup(
      namespace,
      buildOfflineBackup(root, { name: "secret-key.safe", value: sealed }),
    );
    const paths = resolveHostRootPaths(namespace);

    await expect(
      activateStagedHostRoot({
        profileNamespace: namespace,
        unsealCooperation: async () => Buffer.alloc(16).toString("base64"),
      }),
    ).rejects.toThrow(/unusable key material/u);
    expect(readHostRootManifest(paths)?.source.activation).toBe("required");
    expect(existsSync(join(paths.dataRoot, HOST_ACTIVATION_RECORD_FILE))).toBe(false);
  });

  it("reports that nothing is staged instead of activating an empty root", async () => {
    const root = scratch();
    const namespace = join(realpathSync.native(root), "profile");
    await expect(activateStagedHostRoot({ profileNamespace: namespace })).rejects.toThrow(
      HostStagedImportMissingError,
    );
  });

  it("records versioned activation evidence and supersedes the staged receipt", async () => {
    const root = scratch();
    const namespace = join(realpathSync.native(root), "profile");
    await stageBackup(
      namespace,
      buildOfflineBackup(root, { name: "secret-key.headless", value: headlessKey(17) }),
    );
    const paths = resolveHostRootPaths(namespace);

    const result = await activateStagedHostRoot({ profileNamespace: namespace });

    const recordLease = HostOwnerLease.acquire(paths, "headless");
    const record = readHostActivationRecord(recordLease);
    recordLease.release();
    expect(record.formatVersion).toBe(1);
    expect(record.credentialOutcome).toBe("adopted-existing-key");
    expect(record.verified.databaseSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(record.keyFingerprint).toBe(result.keyFingerprint);
    expect(record.archivedKeyFiles).toEqual([]);
    expect(existsSync(join(paths.dataRoot, "host-import.json"))).toBe(false);
    expect(
      existsSync(join(paths.dataRoot, HOST_ACTIVATION_ARCHIVE_DIR, "host-import.staged.json")),
    ).toBe(true);
    expect(existsSync(join(paths.dataRoot, HOST_CREDENTIAL_STATE_FILE))).toBe(true);
    // A second run reports that nothing is staged; it never re-activates.
    await expect(activateStagedHostRoot({ profileNamespace: namespace })).rejects.toThrow(
      HostStagedImportMissingError,
    );
  });
});
