import Database from "better-sqlite3";
import { fork } from "node:child_process";
import { once } from "node:events";
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
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HostOwnerController } from "./HostOwnerController";
import { HostRootInUseError, readHostOwnerRecord } from "./hostOwnerLease";
import { HOST_CREDENTIAL_STATE_FILE } from "./hostCredentialState";
import { syntheticNativeCodec } from "./fixtures/ownedKeyFixture";
import type { NativeSecretValue } from "./ownedSecretKey";

const roots: string[] = [];
const owners: HostOwnerController[] = [];
const releases: (() => void)[] = [];

function fixture(kind: "desktop" | "headless" = "headless") {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-owner-controller-")));
  roots.push(root);
  const namespace = join(root, "profile");
  const owner = HostOwnerController.acquire(namespace, kind);
  owners.push(owner);
  function successor(nextKind: "desktop" | "headless" = kind) {
    const next = HostOwnerController.acquire(namespace, nextKind);
    owners.push(next);
    return next;
  }
  return { root, namespace, owner, successor };
}

function backup(root: string) {
  const source = join(root, "offline-backup");
  mkdirSync(source);
  const database = new Database(join(source, "state.sqlite"));
  database.exec(
    "CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT); INSERT INTO app_state VALUES ('schema_version', '0')",
  );
  database.close();
  writeFileSync(join(source, "settings.json"), '{"synthetic":true}\n');
  return { sourceBackupPath: source, sourceDeclaredOffline: true } as const;
}

function holdBackup() {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  releases.push(() => release.resolve());
  const original = Database.prototype.backup;
  vi.spyOn(Database.prototype, "backup").mockImplementation(
    async function (this: InstanceType<typeof Database>, destination, options) {
      const result = await original.call(this, destination, options);
      entered.resolve();
      await release.promise;
      return result;
    },
  );
  return { entered: entered.promise, release: () => release.resolve() };
}

async function externalContender(namespace: string) {
  const child = fork(
    fileURLToPath(new URL("./fixtures/leaseProcess.mjs", import.meta.url)),
    [namespace, "desktop"],
    {
      execArgv: [
        "--experimental-transform-types",
        "--disable-warning=ExperimentalWarning",
        "--import",
        fileURLToPath(new URL("../../../scripts/remote-v3-ts-register.mjs", import.meta.url)),
      ],
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    },
  );
  const exited = once(child, "exit");
  const deadline = Promise.withResolvers<never>();
  const replyTimeout = setTimeout(() => {
    child.kill("SIGKILL");
    deadline.reject(new Error("Ownership contender did not reply within 5 seconds."));
  }, 5_000);
  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr = `${stderr}${chunk.toString()}`.slice(-4_096);
  });
  try {
    return await Promise.race([
      deadline.promise,
      once(child, "message").then(([message]) => message as { status: string; code?: string }),
      exited.then(() => {
        throw new Error(`Ownership contender exited before replying: ${stderr}`);
      }),
    ]);
  } finally {
    clearTimeout(replyTimeout);
    if (child.connected) child.disconnect();
    else if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    const teardown = Promise.withResolvers<never>();
    const forceKill = setTimeout(() => child.kill("SIGKILL"), 1_000);
    const teardownTimeout = setTimeout(() => {
      child.kill("SIGKILL");
      teardown.reject(new Error("Ownership contender did not exit within 2 seconds."));
    }, 2_000);
    try {
      await Promise.race([exited, teardown.promise]);
    } finally {
      clearTimeout(forceKill);
      clearTimeout(teardownTimeout);
    }
  }
}

afterEach(async () => {
  for (const release of releases.splice(0)) release();
  await Promise.all(owners.splice(0).map((owner) => owner.close()));
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("owned host startup composition", () => {
  it("cannot initialize an empty root while an import owns the staging operation", async () => {
    const value = fixture();
    const held = holdBackup();
    const importing = value.owner.stageImport(backup(value.root));
    // Attach a rejection handler before exercising the competing operation.
    void importing.catch(() => undefined);
    await held.entered;
    await expect(value.owner.initialize({ mode: "headless" })).rejects.toThrow("staging-import");
    expect(existsSync(value.owner.lease.paths.dataRoot)).toBe(false);
    held.release();
    await expect(importing).resolves.toMatchObject({ activation: "required" });
    await expect(value.owner.initialize({ mode: "headless" })).rejects.toThrow("staged");
  });

  it("joins a cancelled real SQLite backup before allowing a successor to acquire", async () => {
    const value = fixture();
    const held = holdBackup();
    const importing = value.owner.stageImport(backup(value.root));
    void importing.catch(() => undefined);
    await held.entered;
    let closed = false;
    const closing = value.owner.close().then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    expect(() => value.successor("desktop")).toThrow(HostRootInUseError);
    expect(await externalContender(value.namespace)).toMatchObject({
      status: "refused",
      code: "HOST_ROOT_IN_USE",
    });
    held.release();
    await expect(importing).rejects.toThrow("closing");
    await closing;
    const next = value.successor("desktop");
    expect(next.lease.generation).not.toBe(value.owner.lease.generation);
    expect(existsSync(next.lease.paths.dataRoot)).toBe(false);
    await next.initialize({ mode: "headless" });
    expect(readFileSync(join(next.lease.paths.dataRoot, "secret-key.headless"), "utf8")).not.toBe(
      "",
    );
  });

  it("abandons a held native byte transform and ignores its late reply after a successor initializes", async () => {
    const value = fixture("desktop");
    const entered = Promise.withResolvers<NativeSecretValue>();
    const reply = Promise.withResolvers<NativeSecretValue>();
    const codec = syntheticNativeCodec();
    codec.seal.mockImplementation((request) => {
      entered.resolve(request);
      return reply.promise;
    });
    const initializing = value.owner.initialize({ mode: "os-sealed", codec });
    void initializing.catch(() => undefined);
    const request = await entered.promise;
    await value.owner.close();
    await expect(initializing).rejects.toThrow("closing");
    expect(existsSync(join(value.owner.lease.paths.dataRoot, "secret-key.safe"))).toBe(false);
    expect(existsSync(join(value.owner.lease.paths.dataRoot, HOST_CREDENTIAL_STATE_FILE))).toBe(
      false,
    );
    const next = value.successor("headless");
    const runtime = await next.initialize({ mode: "headless" });
    const before = readFileSync(
      join(next.lease.paths.dataRoot, HOST_CREDENTIAL_STATE_FILE),
      "utf8",
    );
    reply.resolve({
      ownerGeneration: request.ownerGeneration,
      value: Buffer.from("synthetic-late-sealed").toString("base64"),
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(readFileSync(join(next.lease.paths.dataRoot, HOST_CREDENTIAL_STATE_FILE), "utf8")).toBe(
      before,
    );
    expect(readFileSync(join(next.lease.paths.dataRoot, "secret-key.headless"), "utf8")).toBe(
      runtime.secretStorageKey,
    );
    expect(existsSync(join(next.lease.paths.dataRoot, "secret-key.safe"))).toBe(false);
  });

  it("cancels a native startup wait while retaining ownership for the runtime shutdown barrier", async () => {
    const value = fixture("desktop");
    const entered = Promise.withResolvers<NativeSecretValue>();
    const reply = Promise.withResolvers<NativeSecretValue>();
    const codec = syntheticNativeCodec();
    codec.seal.mockImplementation((request) => {
      entered.resolve(request);
      return reply.promise;
    });
    const initializing = value.owner.initialize({ mode: "os-sealed", codec });
    void initializing.catch(() => undefined);
    const request = await entered.promise;
    value.owner.cancelStartup();
    value.owner.cancelStartup();
    await expect(initializing).rejects.toThrow("closing");
    value.owner.lease.assertActive();
    expect(await externalContender(value.namespace)).toMatchObject({
      status: "refused",
      code: "HOST_ROOT_IN_USE",
    });
    await expect(value.owner.initialize({ mode: "headless" })).rejects.toThrow("closing");
    await expect(value.owner.stageImport(backup(value.root))).rejects.toThrow("closing");
    expect(() => value.owner.markReady()).toThrow("closing");
    reply.resolve({
      ownerGeneration: request.ownerGeneration,
      value: Buffer.from("synthetic-cancelled-sealed").toString("base64"),
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(existsSync(join(value.owner.lease.paths.dataRoot, "secret-key.safe"))).toBe(false);
    await value.owner.close();
    expect(await externalContender(value.namespace)).toMatchObject({ status: "owned" });
  });

  it("retains initialized credential capabilities during cancellation until final close", async () => {
    const value = fixture();
    const runtime = await value.owner.initialize({ mode: "headless" });
    value.owner.markReady();
    value.owner.cancelStartup();
    value.owner.cancelStartup();
    runtime.lease.assertActive(runtime.lease.generation);
    runtime.credentialCapabilities.assertCanPersistSecrets();
    expect(await externalContender(value.namespace)).toMatchObject({
      status: "refused",
      code: "HOST_ROOT_IN_USE",
    });
    expect(() => value.owner.markReady()).toThrow("closing");
    await value.owner.close();
    expect(() => runtime.credentialCapabilities.assertCanPersistSecrets()).toThrow(
      "no longer active",
    );
    expect(await externalContender(value.namespace)).toMatchObject({ status: "owned" });
  });

  it("cancels a staged backup without releasing its lease before the explicit close barrier", async () => {
    const value = fixture();
    const held = holdBackup();
    const importing = value.owner.stageImport(backup(value.root));
    void importing.catch(() => undefined);
    await held.entered;
    value.owner.cancelStartup();
    expect(await externalContender(value.namespace)).toMatchObject({
      status: "refused",
      code: "HOST_ROOT_IN_USE",
    });
    held.release();
    await expect(importing).rejects.toThrow("closing");
    expect(existsSync(value.owner.lease.paths.dataRoot)).toBe(false);
    expect(await externalContender(value.namespace)).toMatchObject({
      status: "refused",
      code: "HOST_ROOT_IN_USE",
    });
    await value.owner.close();
    value.owner.cancelStartup();
    expect(await externalContender(value.namespace)).toMatchObject({ status: "owned" });
  });

  it("does not advertise ready before credentials and runtime construction finish", async () => {
    const value = fixture();
    expect(() => value.owner.markReady()).toThrow("acquired");
    await value.owner.initialize({ mode: "headless" });
    expect(readHostOwnerRecord(value.owner.lease.paths)?.phase).toBe("preparing");
    value.owner.markReady();
    expect(readHostOwnerRecord(value.owner.lease.paths)?.phase).toBe("ready");
    await expect(value.owner.initialize({ mode: "headless" })).rejects.toThrow("ready");
  });

  it("rejects import, duplicate initialization and readiness while a native key is pending", async () => {
    const value = fixture("desktop");
    const entered = Promise.withResolvers<NativeSecretValue>();
    const reply = Promise.withResolvers<NativeSecretValue>();
    const codec = syntheticNativeCodec();
    codec.seal.mockImplementation((request) => {
      entered.resolve(request);
      return reply.promise;
    });
    const initializing = value.owner.initialize({ mode: "os-sealed", codec });
    void initializing.catch(() => undefined);
    const request = await entered.promise;
    await expect(value.owner.stageImport(backup(value.root))).rejects.toThrow("initializing");
    await expect(value.owner.initialize({ mode: "session-only" })).rejects.toThrow("initializing");
    expect(() => value.owner.markReady()).toThrow("initializing");
    expect(codec.seal).toHaveBeenCalledTimes(1);
    reply.resolve({
      ownerGeneration: request.ownerGeneration,
      value: Buffer.from("synthetic-sealed").toString("base64"),
    });
    await initializing;
    value.owner.markReady();
  });

  it("shares close and cancels an admitted operation before its first filesystem work", async () => {
    const value = fixture();
    const initializing = value.owner.initialize({ mode: "headless" });
    void initializing.catch(() => undefined);
    const closing = value.owner.close();
    expect(value.owner.close()).toBe(closing);
    await expect(initializing).rejects.toThrow("closing");
    await closing;
    expect(existsSync(value.owner.lease.paths.dataRoot)).toBe(false);
    await expect(value.owner.initialize({ mode: "headless" })).rejects.toThrow("no longer active");
    const next = value.successor();
    const runtime = await next.initialize({ mode: "headless" });
    await next.close();
    expect(() => runtime.credentialCapabilities.assertCanPersistSecrets()).toThrow(
      "no longer active",
    );
  });

  it("preserves a legacy candidate and keeps the lease after a startup refusal until close", async () => {
    const value = fixture();
    mkdirSync(value.namespace);
    writeFileSync(join(value.namespace, "settings.json"), '{"syntheticCandidate":true}\n');
    await expect(value.owner.initialize({ mode: "headless" })).rejects.toThrow(
      "offline backup import",
    );
    expect(readFileSync(join(value.namespace, "settings.json"), "utf8")).toBe(
      '{"syntheticCandidate":true}\n',
    );
    expect(existsSync(value.owner.lease.paths.dataRoot)).toBe(false);
    expect(() => value.successor("desktop")).toThrow(HostRootInUseError);
    expect(() => value.owner.markReady()).toThrow("failed");
    await value.owner.close();
    value.successor("desktop").lease.assertActive();
  });

  it.each(["desktop", "headless"] as const)(
    "excludes the other startup kind before any owned-root side effect when %s starts first",
    async (kind) => {
      const value = fixture(kind);
      expect(existsSync(value.owner.lease.paths.dataRoot)).toBe(false);
      expect(() => value.successor(kind === "desktop" ? "headless" : "desktop")).toThrow(
        HostRootInUseError,
      );
      expect(existsSync(value.owner.lease.paths.dataRoot)).toBe(false);
      await value.owner.close();
      const next = value.successor(kind === "desktop" ? "headless" : "desktop");
      next.lease.assertActive();
    },
  );
});
