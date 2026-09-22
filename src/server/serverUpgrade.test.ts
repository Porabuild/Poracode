import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HostControlRefusedError } from "@/backend/ownership/hostControlClient";
import {
  canonicalHostPath,
  resolveHostRootPaths,
  type HostRootPaths,
} from "@/backend/ownership/hostRootPaths";
import type { HostControlStatusResult } from "@/shared/hostControlProtocol";
import { writeCurrentSymlink } from "./serverNativeOverlay";
import {
  allocateUpgradeReleaseId,
  defaultUpgradeIo,
  parseUpgradeCliOptions,
  upgradeServerPrefix,
  type UpgradeDoctorResult,
  type UpgradeIo,
} from "./serverUpgrade";
import { abandonServerUpgrade, resumeServerUpgrade } from "./serverUpgradeRecovery";
import {
  readReleaseBuildIdentity,
  RunningOwnerRefusedError,
  type RunningOwnerProbe,
} from "./serverUpgradeIdentity";
import { candidateMigrationPolicyFromEntries } from "./serverUpgradeMigrationPolicy";
import { acquireServerUpgradeLock, serverUpgradeLockPath } from "./serverUpgradeLock";
import {
  readServerUpgradeJournal,
  readServerUpgradeJournalState,
  writeServerUpgradeJournal,
} from "./serverUpgradeJournal";
import type { ServerServiceTarget } from "./serverUpgradeRestart";

const dirs: string[] = [];
const envBackup = new Map<string, string | undefined>();

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  for (const [key, value] of envBackup) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  envBackup.clear();
});

function sandbox(): { prefix: string; profile: string; paths: HostRootPaths } {
  const root = mkdtempSync(join(tmpdir(), "poracode-upgrade-"));
  dirs.push(root);
  // The upgrader canonicalizes the prefix before touching the journal, so the
  // fixture uses the canonical path too (macOS tmpdir is a symlink).
  const prefix = canonicalHostPath(join(root, "prefix"));
  const profile = join(root, "profile");
  mkdirSync(prefix, { recursive: true });
  envBackup.set("PORACODE_BASE_DIR", process.env.PORACODE_BASE_DIR);
  process.env.PORACODE_BASE_DIR = profile;
  return { prefix, profile, paths: resolveHostRootPaths(profile) };
}

function writeRelease(dir: string, version: string, marker: string): void {
  mkdirSync(join(dir, "lib"), { recursive: true });
  mkdirSync(join(dir, "resources"), { recursive: true });
  writeFileSync(join(dir, "package.json"), `${JSON.stringify({ version })}\n`);
  writeFileSync(join(dir, "lib", "server.cjs"), `${marker}\n`);
}

const REGISTRY_46 = [
  { version: 45, name: "journal", rollback: "rollback-compatible" as const },
  { version: 46, name: "anchor", rollback: "rollback-compatible" as const },
];
const REGISTRY_47 = [
  ...REGISTRY_46,
  { version: 47, name: "receipt principal", rollback: "forward-only" as const },
];

function doctorFor(forwardOnly: boolean): UpgradeDoctorResult {
  const registry = forwardOnly ? REGISTRY_47 : REGISTRY_46;
  return {
    ok: true,
    detail: "doctor ok",
    migrations: candidateMigrationPolicyFromEntries(registry.at(-1)!.version, registry),
  };
}

interface FakeWorld {
  owner: RunningOwnerProbe | null;
  schemaVersion: number | null;
  candidateRunning: boolean;
  candidateAdmission: "held" | "open";
  candidateState: "starting" | "ready";
  candidateEndpoint: string | null;
  candidateBuild: { version: string; entrypointSha256: string; root: string } | null;
  currentReleaseDir: string | null;
  started: { staging: boolean }[];
  backupDestination: string | null;
  failAt: string | null;
  rollbackStartFails: boolean;
  migrateOnCandidateStart: boolean;
  probeThrows: Error | null;
}

function fakeIo(
  world: FakeWorld,
  paths: HostRootPaths,
  prefix: string,
  input: { forwardOnly?: boolean; registry?: UpgradeDoctorResult["migrations"] } = {},
): UpgradeIo {
  let clockMs = 0;
  const candidateStatus = (): { ownerGeneration: string; status: HostControlStatusResult } => {
    if (world.failAt === "candidate-status") throw new Error("synthetic candidate unreachable");
    if (!world.candidateRunning || !world.candidateBuild)
      throw new Error("synthetic candidate not running");
    return {
      ownerGeneration: "candidate-generation",
      status: {
        profileNamespace: paths.profileNamespace,
        dataRoot: paths.dataRoot,
        mode: "headless",
        state: world.candidateState,
        admission: world.candidateAdmission,
        endpoint: world.candidateEndpoint,
        build: {
          version: world.candidateBuild.version,
          sourceRevision: null,
          entrypointSha256: world.candidateBuild.entrypointSha256,
          root: world.candidateBuild.root,
          layoutKind: "prefix",
        },
      },
    };
  };
  return {
    stage: (tarball, releaseDir) => {
      if (world.failAt === "stage") throw new Error("synthetic stage failure");
      writeRelease(releaseDir, tarball, `candidate:${tarball}`);
    },
    doctor: () => {
      if (world.failAt === "doctor") throw new Error("synthetic doctor failure");
      return input.registry !== undefined
        ? { ok: true, detail: "doctor ok", migrations: input.registry }
        : doctorFor(input.forwardOnly === true);
    },
    probeOwner: async () => {
      if (world.probeThrows) throw world.probeThrows;
      if (world.failAt === "probe") throw new Error("synthetic probe failure");
      return world.owner;
    },
    stopOwner: async () => {
      if (world.failAt === "stop-owner") throw new Error("synthetic drain failure");
      world.owner = null;
    },
    captureBackup: async (destination) => {
      if (world.failAt === "backup") throw new Error("synthetic backup failure");
      world.backupDestination = destination;
    },
    readSchemaVersion: () => world.schemaVersion,
    writeCurrent: (targetPrefix, releaseDir) => {
      world.currentReleaseDir = releaseDir;
      writeCurrentSymlink(targetPrefix, releaseDir);
    },
    removeCurrent: (targetPrefix) => rmSync(join(targetPrefix, "current"), { force: true }),
    startCandidate: async ({ staging }) => {
      if (world.failAt === "start-candidate") throw new Error("synthetic spawn failure");
      if (!staging && world.rollbackStartFails) throw new Error("synthetic rollback spawn failure");
      world.started.push({ staging });
      world.candidateRunning = true;
      if (staging) {
        if (world.migrateOnCandidateStart && world.schemaVersion !== null) world.schemaVersion = 47;
        world.candidateAdmission = "held";
        world.candidateState = "starting";
        world.candidateEndpoint = null;
        const identity = readReleaseBuildIdentity(world.currentReleaseDir!);
        world.candidateBuild = {
          version: identity.version!,
          entrypointSha256: identity.entrypointSha256!,
          root: identity.root,
        };
      } else {
        world.candidateAdmission = "open";
        world.candidateState = "ready";
        world.candidateEndpoint = "http://127.0.0.1:1/";
        world.candidateBuild = null;
        // The restarted previous release is the owner again.
        world.owner = legacyOwner(paths);
      }
      return {
        child: null,
        target: { kind: "direct", unit: null } satisfies ServerServiceTarget,
      };
    },
    candidateStatus: async () => {
      if (world.failAt === "status") throw new Error("synthetic status failure");
      return candidateStatus();
    },
    admitCandidate: async (expected) => {
      if (world.failAt === "admit") throw new Error("synthetic admit failure");
      const current = candidateStatus();
      if (
        current.status.build.version !== expected.version ||
        current.status.build.entrypointSha256 !== expected.entrypointSha256
      )
        throw new Error("synthetic admit identity mismatch");
      world.candidateAdmission = "open";
      world.candidateState = "ready";
      world.candidateEndpoint = "http://127.0.0.1:1/";
      return candidateStatus();
    },
    stopCandidate: async () => {
      if (world.failAt === "stop-candidate") throw new Error("synthetic stop failure");
      world.candidateRunning = false;
    },
    now: () => clockMs,
    sleep: async (ms) => {
      clockMs += ms;
    },
  };
}

function newWorld(): FakeWorld {
  return {
    owner: null,
    schemaVersion: null,
    candidateRunning: false,
    candidateAdmission: "held",
    candidateState: "starting",
    candidateEndpoint: null,
    candidateBuild: null,
    currentReleaseDir: null,
    started: [],
    backupDestination: null,
    failAt: null,
    rollbackStartFails: false,
    migrateOnCandidateStart: false,
    probeThrows: null,
  };
}

function legacyOwner(paths: HostRootPaths): RunningOwnerProbe {
  return {
    paths,
    generation: "generation-old",
    pid: 4242,
    processIdentity: null,
    kind: "headless",
    phase: "ready",
    description: {
      profileNamespace: paths.profileNamespace,
      dataRoot: paths.dataRoot,
      mode: "headless",
      state: "ready",
      operations: ["describe", "issue-pairing"],
      capabilities: {
        ssh: false,
        browserPanel: false,
        chromeBridge: false,
        computerUse: false,
        nativeSecrets: false,
        portForward: false,
        autoUpdate: false,
        osNotifications: false,
      },
      remoteProtocolVersion: 12,
      endpoint: "http://127.0.0.1:1/",
    },
    status: null,
  };
}

/** A staged D4 candidate answering the authenticated status surface. */
function candidateOwner(
  paths: HostRootPaths,
  releaseDir: string,
  admission: "held" | "open",
): RunningOwnerProbe {
  const identity = readReleaseBuildIdentity(releaseDir);
  return {
    paths,
    generation: "candidate-generation",
    pid: 5151,
    processIdentity: null,
    kind: "headless",
    phase: "ready",
    description: legacyOwner(paths).description,
    status: {
      profileNamespace: paths.profileNamespace,
      dataRoot: paths.dataRoot,
      mode: "headless",
      state: admission === "open" ? "ready" : "starting",
      admission,
      endpoint: admission === "open" ? "http://127.0.0.1:1/" : null,
      build: {
        version: identity.version!,
        sourceRevision: null,
        entrypointSha256: identity.entrypointSha256!,
        root: identity.root,
        layoutKind: "prefix",
      },
    },
  };
}

function writeJournalFixture(input: {
  readonly prefix: string;
  readonly releaseDir: string;
  readonly previousTarget: string | null;
  readonly phase:
    | "staging"
    | "staged"
    | "draining"
    | "drained"
    | "backup-captured"
    | "swapped"
    | "candidate-started"
    | "qualified";
  readonly forwardOnlyMigration?: boolean;
}): void {
  const identity = readReleaseBuildIdentity(input.releaseDir);
  writeServerUpgradeJournal(input.prefix, {
    prefix: input.prefix,
    releaseId: "release-interrupted",
    releaseDir: input.releaseDir,
    previousTarget: input.previousTarget,
    phase: input.phase,
    detail: null,
    backupPath: null,
    expectedVersion: identity.version,
    expectedEntrypointSha256: identity.entrypointSha256,
    forwardOnlyMigration: input.forwardOnlyMigration ?? false,
  });
}

describe("parseUpgradeCliOptions", () => {
  it("requires --from and defaults the prefix", () => {
    expect(parseUpgradeCliOptions(["--from", "/tmp/a.tar.gz"])).toEqual({
      from: "/tmp/a.tar.gz",
      prefix: "/opt/poracode",
      json: false,
    });
    expect(() => parseUpgradeCliOptions([])).toThrow(/--from <tarball>/u);
  });

  it("parses the explicit recovery flags", () => {
    expect(parseUpgradeCliOptions(["--resume", "--from", "/tmp/a.tar.gz", "--json"])).toEqual({
      from: "/tmp/a.tar.gz",
      prefix: "/opt/poracode",
      json: true,
      resume: true,
    });
    expect(parseUpgradeCliOptions(["--resume", "--confirm"])).toEqual({
      from: "",
      prefix: "/opt/poracode",
      json: false,
      resume: true,
      confirm: true,
    });
    expect(parseUpgradeCliOptions(["--abandon-journal", "--confirm"])).toEqual({
      from: "",
      prefix: "/opt/poracode",
      json: false,
      abandonJournal: true,
      confirm: true,
    });
    expect(() => parseUpgradeCliOptions(["--abandon-journal"])).toThrow(/Usage/u);
    expect(() => parseUpgradeCliOptions(["--resume", "--abandon-journal", "--confirm"])).toThrow(
      /Usage/u,
    );
    expect(() => parseUpgradeCliOptions(["--from", "/tmp/a.tar.gz", "--confirm"])).toThrow(
      /Usage/u,
    );
  });
});

describe("upgradeServerPrefix (D4)", () => {
  it("upgrades a legacy owner and qualifies the distinct candidate", async () => {
    const { prefix, paths } = sandbox();
    const previous = join(prefix, "releases", "old");
    writeRelease(previous, "1.0.0", "old");
    writeCurrentSymlink(prefix, previous);
    const world = newWorld();
    world.owner = legacyOwner(paths);
    world.schemaVersion = 46;
    const io = fakeIo(world, paths, prefix, { forwardOnly: false });

    const result = await upgradeServerPrefix({ from: "1.1.0", prefix, json: true }, io);
    expect(result.ok).toBe(true);
    expect(result.outcome).toBe("upgraded");
    expect(result.rolledBack).toBe(false);
    expect(result.backupPath).toBeNull();
    expect(result.migration.forwardOnly).toEqual([]);
    expect(world.owner).toBeNull();
    expect(world.started).toEqual([{ staging: true }]);
    expect(readServerUpgradeJournal(prefix)?.phase).toBe("complete");
    expect(readFileSync(join(prefix, "current", "package.json"), "utf8")).toContain("1.1.0");
  });

  it("captures a consistent backup before a forward-only migration and admits only after proof", async () => {
    const { prefix, paths } = sandbox();
    const previous = join(prefix, "releases", "old");
    writeRelease(previous, "1.0.0", "old");
    writeCurrentSymlink(prefix, previous);
    const world = newWorld();
    world.owner = legacyOwner(paths);
    world.schemaVersion = 46;
    const io = fakeIo(world, paths, prefix, { forwardOnly: true });

    const result = await upgradeServerPrefix({ from: "1.1.0", prefix, json: true }, io);
    expect(result.ok).toBe(true);
    expect(result.outcome).toBe("upgraded");
    expect(result.backupPath).toContain("pre-migration");
    expect(world.backupDestination).toBe(result.backupPath);
    // The candidate was staged with admission held and only the orchestrator
    // admitted it after the authenticated identity proof.
    expect(world.started).toEqual([{ staging: true }]);
    expect(world.candidateAdmission).toBe("open");
    expect(readServerUpgradeJournal(prefix)?.forwardOnlyMigration).toBe(true);
  });

  it("refuses a second upgrader while the prefix lock is held", async () => {
    const { prefix, paths } = sandbox();
    const previous = join(prefix, "releases", "old");
    writeRelease(previous, "1.0.0", "old");
    writeCurrentSymlink(prefix, previous);
    const held = acquireServerUpgradeLock({
      prefix,
      releaseId: "release-held-by-first",
      pid: process.pid,
    });
    try {
      await expect(
        upgradeServerPrefix(
          { from: "1.1.0", prefix, json: true },
          fakeIo(newWorld(), paths, prefix, { forwardOnly: false }),
        ),
      ).rejects.toMatchObject({ code: "SERVER_UPGRADE_BUSY" });
    } finally {
      held.release();
    }
    expect(existsSync(serverUpgradeLockPath(prefix))).toBe(false);
  });

  it("takes over a stale lock without signalling an unrelated live PID", async () => {
    const { prefix, paths } = sandbox();
    const previous = join(prefix, "releases", "old");
    writeRelease(previous, "1.0.0", "old");
    writeCurrentSymlink(prefix, previous);
    // A live unrelated process holds a lock record with no readable identity:
    // conservative liveness keeps it busy and never signals it.
    const unrelatedPid = process.pid;
    writeFileSync(
      serverUpgradeLockPath(prefix),
      `${JSON.stringify({
        formatVersion: 1,
        token: "stale-token-value-000000000000",
        pid: unrelatedPid,
        processIdentity: null,
        hostname: "",
        acquiredAt: new Date().toISOString(),
        releaseId: "release-stale",
      })}\n`,
    );
    await expect(
      upgradeServerPrefix(
        { from: "1.1.0", prefix, json: true },
        fakeIo(newWorld(), paths, prefix, { forwardOnly: false }),
      ),
    ).rejects.toMatchObject({ code: "SERVER_UPGRADE_BUSY" });

    // A dead PID is stale and may be taken over.
    writeFileSync(
      serverUpgradeLockPath(prefix),
      `${JSON.stringify({
        formatVersion: 1,
        token: "stale-token-value-000000000001",
        pid: 999_999_999,
        processIdentity: "dead",
        hostname: "",
        acquiredAt: new Date().toISOString(),
        releaseId: "release-stale",
      })}\n`,
    );
    const result = await upgradeServerPrefix(
      { from: "1.1.0", prefix, json: true },
      fakeIo(newWorld(), paths, prefix, { forwardOnly: false }),
    );
    expect(result.ok).toBe(true);
  });

  it("refuses a desktop or mismatched owner instead of touching it", async () => {
    const { prefix, paths } = sandbox();
    const previous = join(prefix, "releases", "old");
    writeRelease(previous, "1.0.0", "old");
    writeCurrentSymlink(prefix, previous);
    const world = newWorld();
    world.probeThrows = new RunningOwnerRefusedError("desktop owner");
    const io = fakeIo(world, paths, prefix, { forwardOnly: false });
    const result = await upgradeServerPrefix({ from: "1.1.0", prefix, json: true }, io);
    expect(result.ok).toBe(false);
    expect(result.outcome).toBe("unchanged");
    // Nothing was drained, swapped or started.
    expect(world.started).toEqual([]);
    expect(readFileSync(join(prefix, "current", "package.json"), "utf8")).toContain("1.0.0");
    expect(readServerUpgradeJournal(prefix)?.phase).toBe("failed");
  });

  it("rolls the code back when the candidate cannot prove the expected build", async () => {
    const { prefix, paths } = sandbox();
    const previous = join(prefix, "releases", "old");
    writeRelease(previous, "1.0.0", "old");
    writeCurrentSymlink(prefix, previous);
    const world = newWorld();
    world.owner = legacyOwner(paths);
    world.schemaVersion = 46;
    const io = fakeIo(world, paths, prefix, { forwardOnly: false });
    // The candidate answers status with a different version than staged.
    const originalStatus = io.candidateStatus;
    const ioWithWrongBuild: UpgradeIo = {
      ...io,
      candidateStatus: async () => {
        const reply = await originalStatus();
        return {
          ...reply,
          status: { ...reply.status, build: { ...reply.status.build, version: "9.9.9" } },
        };
      },
    };
    const result = await upgradeServerPrefix(
      { from: "1.1.0", prefix, json: true, healthTimeoutMs: 1_000 },
      ioWithWrongBuild,
    );
    expect(result.ok).toBe(false);
    expect(result.outcome).toBe("rolled-back");
    expect(result.rolledBack).toBe(true);
    expect(readFileSync(join(prefix, "current", "package.json"), "utf8")).toContain("1.0.0");
    // The previous release was restarted without staging.
    expect(world.started.at(-1)).toEqual({ staging: false });
    expect(readServerUpgradeJournal(prefix)?.phase).toBe("failed");
  });

  it("enters explicit recovery when a forward-only migration ran and the candidate failed", async () => {
    const { prefix, paths } = sandbox();
    const previous = join(prefix, "releases", "old");
    writeRelease(previous, "1.0.0", "old");
    writeCurrentSymlink(prefix, previous);
    const world = newWorld();
    world.owner = legacyOwner(paths);
    world.schemaVersion = 46;
    world.migrateOnCandidateStart = true;
    world.failAt = "candidate-status";
    const io = fakeIo(world, paths, prefix, { forwardOnly: true });
    const result = await upgradeServerPrefix(
      { from: "1.1.0", prefix, json: true, healthTimeoutMs: 1_000 },
      io,
    );
    expect(result.ok).toBe(false);
    expect(result.outcome).toBe("recovery-required");
    expect(result.rolledBack).toBe(false);
    // The symlink stays on the candidate: code rollback would not undo schema 47.
    expect(readFileSync(join(prefix, "current", "package.json"), "utf8")).toContain("1.1.0");
    expect(result.backupPath).not.toBeNull();
    expect(result.detail).toContain("forward-only");
    expect(readServerUpgradeJournal(prefix)?.phase).toBe("recovery-required");
  });

  it("reports recovery when rollback itself fails, preserving both releases", async () => {
    const { prefix, paths } = sandbox();
    const previous = join(prefix, "releases", "old");
    writeRelease(previous, "1.0.0", "old");
    writeCurrentSymlink(prefix, previous);
    const world = newWorld();
    world.owner = legacyOwner(paths);
    world.schemaVersion = 46;
    world.failAt = "candidate-status";
    world.rollbackStartFails = true;
    const io = fakeIo(world, paths, prefix, { forwardOnly: false });
    const result = await upgradeServerPrefix(
      { from: "1.1.0", prefix, json: true, healthTimeoutMs: 500 },
      io,
    );
    expect(result.ok).toBe(false);
    expect(result.outcome).toBe("recovery-required");
    expect(result.detail).toContain("Rollback also failed");
    expect(existsSync(previous)).toBe(true);
    expect(existsSync(result.releaseDir!)).toBe(true);
  });

  it("restarts the previous release when the pre-migration backup is interrupted", async () => {
    const { prefix, paths } = sandbox();
    const previous = join(prefix, "releases", "old");
    writeRelease(previous, "1.0.0", "old");
    writeCurrentSymlink(prefix, previous);
    const world = newWorld();
    world.owner = legacyOwner(paths);
    world.schemaVersion = 46;
    world.failAt = "backup";
    const io = fakeIo(world, paths, prefix, { forwardOnly: true });
    const result = await upgradeServerPrefix({ from: "1.1.0", prefix, json: true }, io);
    expect(result.ok).toBe(false);
    expect(result.outcome).toBe("unchanged");
    expect(result.backupPath).toBeNull();
    // The owner was drained, so the previous release is restarted.
    expect(world.started).toEqual([{ staging: false }]);
    expect(readFileSync(join(prefix, "current", "package.json"), "utf8")).toContain("1.0.0");
  });

  it("refuses to start when a prior upgrade journal is non-terminal", async () => {
    const { prefix, paths } = sandbox();
    const previous = join(prefix, "releases", "old");
    writeRelease(previous, "1.0.0", "old");
    writeCurrentSymlink(prefix, previous);
    writeFileSync(
      join(prefix, "upgrade-journal.json"),
      `${JSON.stringify({
        formatVersion: 1,
        prefix,
        releaseId: "release-interrupted",
        releaseDir: join(prefix, "releases", "release-interrupted"),
        previousTarget: previous,
        phase: "swapped",
        updatedAt: new Date().toISOString(),
        detail: null,
        backupPath: null,
        expectedVersion: "1.1.0",
        expectedEntrypointSha256: "a".repeat(64),
        forwardOnlyMigration: false,
      })}\n`,
    );
    await expect(
      upgradeServerPrefix(
        { from: "1.1.0", prefix, json: true },
        fakeIo(newWorld(), paths, prefix, { forwardOnly: false }),
      ),
    ).rejects.toMatchObject({ code: "SERVER_UPGRADE_IN_PROGRESS" });
  });

  it("allocates collision-resistant release ids", () => {
    const ids = new Set(Array.from({ length: 64 }, () => allocateUpgradeReleaseId()));
    expect(ids.size).toBe(64);
    expect([...ids].every((id) => /^release-\d{14}-[0-9a-f]{12}$/u.test(id))).toBe(true);
  });

  it("exposes no public health qualification in the default IO", () => {
    expect(defaultUpgradeIo).not.toHaveProperty("health");
  });

  it("fails a wrong build even when a healthy process answers a custom TLS port", async () => {
    const { prefix, paths } = sandbox();
    const previous = join(prefix, "releases", "old");
    writeRelease(previous, "1.0.0", "old");
    writeCurrentSymlink(prefix, previous);
    const world = newWorld();
    world.owner = legacyOwner(paths);
    world.schemaVersion = 46;
    const io = fakeIo(world, paths, prefix, { forwardOnly: false });
    // A healthy HTTP surface on the configured remote port must not qualify
    // anything: the upgrade compares the authenticated control identity only.
    const { createServer } = await import("node:http");
    const healthy = createServer((_request, response) => {
      response.statusCode = 200;
      response.end("ok");
    });
    await new Promise<void>((resolve) => healthy.listen(0, "127.0.0.1", resolve));
    const address = healthy.address();
    if (!address || typeof address === "string") throw new Error("no listen port");
    envBackup.set("PORACODE_REMOTE_ACCESS_PORT", process.env.PORACODE_REMOTE_ACCESS_PORT);
    envBackup.set("PORACODE_REMOTE_TLS_CERT", process.env.PORACODE_REMOTE_TLS_CERT);
    envBackup.set("PORACODE_REMOTE_TLS_KEY", process.env.PORACODE_REMOTE_TLS_KEY);
    process.env.PORACODE_REMOTE_ACCESS_PORT = String(address.port);
    process.env.PORACODE_REMOTE_TLS_CERT = "/fixture/tls/server.crt";
    process.env.PORACODE_REMOTE_TLS_KEY = "/fixture/tls/server.key";
    try {
      const wrongBuild: UpgradeIo = {
        ...io,
        candidateStatus: async () => {
          const reply = await io.candidateStatus();
          return {
            ...reply,
            status: { ...reply.status, build: { ...reply.status.build, version: "0.0.0" } },
          };
        },
      };
      const result = await upgradeServerPrefix(
        { from: "1.1.0", prefix, json: true, healthTimeoutMs: 500 },
        wrongBuild,
      );
      expect(result.ok).toBe(false);
      expect(result.outcome).toBe("rolled-back");
      expect(readFileSync(join(prefix, "current", "package.json"), "utf8")).toContain("1.0.0");
    } finally {
      healthy.closeAllConnections();
      await new Promise<void>((resolve) => healthy.close(() => resolve()));
    }
  });
});

describe("upgrade failure classification and recovery (D4 review corrections)", () => {
  it("requires recovery when the schema cannot be read after a potentially forward-only migration (F2)", async () => {
    const { prefix, paths } = sandbox();
    const previous = join(prefix, "releases", "old");
    writeRelease(previous, "1.0.0", "old");
    writeCurrentSymlink(prefix, previous);
    const world = newWorld();
    world.owner = legacyOwner(paths);
    world.schemaVersion = 46;
    world.migrateOnCandidateStart = true;
    world.failAt = "candidate-status";
    const io = fakeIo(world, paths, prefix, { forwardOnly: true });
    let reads = 0;
    const unreadableSchema: UpgradeIo = {
      ...io,
      readSchemaVersion: () => {
        reads += 1;
        if (reads === 1) return 46;
        throw new Error("probe: database unreadable after the candidate failed");
      },
    };
    const result = await upgradeServerPrefix(
      { from: "1.1.0", prefix, json: true, healthTimeoutMs: 1_000 },
      unreadableSchema,
    );
    expect(result.ok).toBe(false);
    expect(result.outcome).toBe("recovery-required");
    expect(result.rolledBack).toBe(false);
    // The previous release is never restarted over data a forward-only
    // migration may have rewritten.
    expect(world.started).toEqual([{ staging: true }]);
    expect(result.detail).toContain("could not be read");
    expect(readServerUpgradeJournal(prefix)?.phase).toBe("recovery-required");
    expect(readFileSync(join(prefix, "current", "package.json"), "utf8")).toContain("1.1.0");
  });

  it("refuses to upgrade from a corrupt or future journal instead of treating it as absent (F1/F3)", async () => {
    for (const content of [
      "{not json\n",
      `${JSON.stringify({ formatVersion: 2, phase: "swapped" })}\n`,
    ]) {
      const { prefix, paths } = sandbox();
      const previous = join(prefix, "releases", "old");
      writeRelease(previous, "1.0.0", "old");
      writeCurrentSymlink(prefix, previous);
      writeFileSync(join(prefix, "upgrade-journal.json"), content);
      const world = newWorld();
      await expect(
        upgradeServerPrefix(
          { from: "1.1.0", prefix, json: true },
          fakeIo(world, paths, prefix, { forwardOnly: false }),
        ),
      ).rejects.toMatchObject({ code: "SERVER_UPGRADE_JOURNAL_UNREADABLE" });
      expect(world.started).toEqual([]);
      expect(readFileSync(join(prefix, "current", "package.json"), "utf8")).toContain("1.0.0");
    }
  });

  it("refuses to upgrade from an unknown-phase format-1 journal (V1)", async () => {
    const { prefix, paths } = sandbox();
    const previous = join(prefix, "releases", "old");
    writeRelease(previous, "1.0.0", "old");
    writeCurrentSymlink(prefix, previous);
    writeFileSync(
      join(prefix, "upgrade-journal.json"),
      `${JSON.stringify({
        formatVersion: 1,
        prefix,
        releaseId: "release-old",
        releaseDir: previous,
        previousTarget: null,
        phase: "verifying-by-a-future-build",
        updatedAt: "2026-01-01T00:00:00.000Z",
        detail: null,
        backupPath: null,
        expectedVersion: null,
        expectedEntrypointSha256: null,
        forwardOnlyMigration: false,
      })}\n`,
    );
    const world = newWorld();
    await expect(
      upgradeServerPrefix(
        { from: "1.1.0", prefix, json: true },
        fakeIo(world, paths, prefix, { forwardOnly: false }),
      ),
    ).rejects.toMatchObject({ code: "SERVER_UPGRADE_JOURNAL_UNREADABLE" });
    expect(world.started).toEqual([]);
    expect(readFileSync(join(prefix, "current", "package.json"), "utf8")).toContain("1.0.0");
  });

  it("names the resume/abandon remediation in the in-progress refusal (F4)", async () => {
    const { prefix, paths } = sandbox();
    const previous = join(prefix, "releases", "old");
    writeRelease(previous, "1.0.0", "old");
    writeCurrentSymlink(prefix, previous);
    const staged = join(prefix, "releases", "release-interrupted");
    writeRelease(staged, "1.1.0", "interrupted");
    writeJournalFixture({
      prefix,
      releaseDir: staged,
      previousTarget: previous,
      phase: "swapped",
    });
    const rejection = await upgradeServerPrefix(
      { from: "1.1.0", prefix, json: true },
      fakeIo(newWorld(), paths, prefix, { forwardOnly: false }),
    ).catch((error: unknown) => error);
    expect(rejection).toMatchObject({ code: "SERVER_UPGRADE_IN_PROGRESS" });
    expect((rejection as Error).message).toContain("--resume --confirm");
    expect((rejection as Error).message).toContain("--abandon-journal --confirm");
  });

  it("resumes a pre-drain journal by restaging from the tarball (F4)", async () => {
    const { prefix, paths } = sandbox();
    const previous = join(prefix, "releases", "old");
    writeRelease(previous, "1.0.0", "old");
    writeCurrentSymlink(prefix, previous);
    const staged = join(prefix, "releases", "release-interrupted");
    writeRelease(staged, "1.1.0", "interrupted");
    writeJournalFixture({
      prefix,
      releaseDir: staged,
      previousTarget: previous,
      phase: "staged",
    });
    const world = newWorld();
    const result = await resumeServerUpgrade(
      { from: "1.1.0", prefix, json: true, resume: true },
      fakeIo(world, paths, prefix, { forwardOnly: false }),
    );
    expect(result.ok).toBe(true);
    expect(result.outcome).toBe("upgraded");
    expect(result.resumed).toBe(true);
    // The interrupted pre-drain release was discarded; nothing was activated.
    expect(existsSync(staged)).toBe(false);
    expect(world.started).toEqual([{ staging: true }]);
    expect(readServerUpgradeJournal(prefix)?.phase).toBe("complete");
  });

  it("finishes a crash between swap and candidate start with --resume --confirm (F4)", async () => {
    const { prefix, paths } = sandbox();
    const previous = join(prefix, "releases", "old");
    writeRelease(previous, "1.0.0", "old");
    writeCurrentSymlink(prefix, previous);
    const staged = join(prefix, "releases", "release-interrupted");
    writeRelease(staged, "1.1.0", "interrupted");
    // The swap had already happened when the upgrader died.
    writeCurrentSymlink(prefix, staged);
    writeJournalFixture({
      prefix,
      releaseDir: staged,
      previousTarget: previous,
      phase: "swapped",
    });
    const world = newWorld();
    world.currentReleaseDir = staged;
    const result = await resumeServerUpgrade(
      { from: "", prefix, json: true, resume: true, confirm: true },
      fakeIo(world, paths, prefix, { forwardOnly: false }),
    );
    expect(result.ok).toBe(true);
    expect(result.outcome).toBe("upgraded");
    expect(result.resumed).toBe(true);
    expect(world.started).toEqual([{ staging: true }]);
    expect(world.candidateAdmission).toBe("open");
    expect(readServerUpgradeJournal(prefix)?.phase).toBe("complete");
  });

  it("admits an already-held staged candidate without starting a second one (F4)", async () => {
    const { prefix, paths } = sandbox();
    const previous = join(prefix, "releases", "old");
    writeRelease(previous, "1.0.0", "old");
    writeCurrentSymlink(prefix, previous);
    const staged = join(prefix, "releases", "release-interrupted");
    writeRelease(staged, "1.1.0", "interrupted");
    writeCurrentSymlink(prefix, staged);
    writeJournalFixture({
      prefix,
      releaseDir: staged,
      previousTarget: previous,
      phase: "candidate-started",
    });
    const world = newWorld();
    world.currentReleaseDir = staged;
    world.candidateRunning = true;
    world.candidateAdmission = "held";
    world.candidateState = "starting";
    world.candidateBuild = {
      version: "1.1.0",
      entrypointSha256: readReleaseBuildIdentity(staged).entrypointSha256!,
      root: staged,
    };
    world.owner = candidateOwner(paths, staged, "held");
    const result = await resumeServerUpgrade(
      { from: "", prefix, json: true, resume: true, confirm: true },
      fakeIo(world, paths, prefix, { forwardOnly: false }),
    );
    expect(result.ok).toBe(true);
    expect(result.resumed).toBe(true);
    expect(world.started).toEqual([]);
    expect(world.candidateAdmission).toBe("open");
    expect(readServerUpgradeJournal(prefix)?.phase).toBe("complete");
  });

  it("requires --confirm past the drain boundary and never resumes a mismatched release (F4)", async () => {
    const { prefix, paths } = sandbox();
    const previous = join(prefix, "releases", "old");
    writeRelease(previous, "1.0.0", "old");
    writeCurrentSymlink(prefix, previous);
    const staged = join(prefix, "releases", "release-interrupted");
    writeRelease(staged, "1.1.0", "interrupted");
    writeJournalFixture({
      prefix,
      releaseDir: staged,
      previousTarget: previous,
      phase: "drained",
    });
    const world = newWorld();
    await expect(
      resumeServerUpgrade(
        { from: "1.1.0", prefix, json: true, resume: true },
        fakeIo(world, paths, prefix, { forwardOnly: false }),
      ),
    ).rejects.toMatchObject({ code: "SERVER_UPGRADE_RECOVERY_REFUSED" });
    expect(world.started).toEqual([]);
    expect(readServerUpgradeJournal(prefix)?.phase).toBe("drained");
  });

  it("abandons only with --confirm and never removes a non-admitted active release (F4)", async () => {
    const { prefix, paths } = sandbox();
    const previous = join(prefix, "releases", "old");
    writeRelease(previous, "1.0.0", "old");
    writeCurrentSymlink(prefix, previous);
    const staged = join(prefix, "releases", "release-interrupted");
    writeRelease(staged, "1.1.0", "interrupted");
    writeCurrentSymlink(prefix, staged);
    writeJournalFixture({
      prefix,
      releaseDir: staged,
      previousTarget: previous,
      phase: "swapped",
    });
    const world = newWorld();
    const io = fakeIo(world, paths, prefix, { forwardOnly: false });
    await expect(
      abandonServerUpgrade({ from: "", prefix, json: true, abandonJournal: true }, io),
    ).rejects.toMatchObject({ code: "SERVER_UPGRADE_REFUSED" });
    await expect(
      abandonServerUpgrade(
        { from: "", prefix, json: true, abandonJournal: true, confirm: true },
        io,
      ),
    ).rejects.toMatchObject({ code: "SERVER_UPGRADE_RECOVERY_REFUSED" });
    expect(readServerUpgradeJournal(prefix)?.phase).toBe("swapped");
    expect(readlinkSync(join(prefix, "current"))).toBe(join("releases", "release-interrupted"));
  });

  it("abandons a pre-drain journal with authenticated owner absence without touching current (F4)", async () => {
    const { prefix, paths } = sandbox();
    const previous = join(prefix, "releases", "old");
    writeRelease(previous, "1.0.0", "old");
    writeCurrentSymlink(prefix, previous);
    const currentBefore = readlinkSync(join(prefix, "current"));
    const staged = join(prefix, "releases", "release-interrupted");
    writeRelease(staged, "1.1.0", "interrupted");
    writeJournalFixture({
      prefix,
      releaseDir: staged,
      previousTarget: previous,
      phase: "staged",
    });
    const world = newWorld();
    const result = await abandonServerUpgrade(
      { from: "", prefix, json: true, abandonJournal: true, confirm: true },
      fakeIo(world, paths, prefix, { forwardOnly: false }),
    );
    expect(result.ok).toBe(true);
    expect(readServerUpgradeJournalState(prefix)).toEqual({ state: "absent" });
    expect(readlinkSync(join(prefix, "current"))).toBe(currentBefore);
    expect(world.started).toEqual([]);
  });

  it("refuses recovery while another upgrade holds the prefix lock (F4)", async () => {
    const { prefix, paths } = sandbox();
    const previous = join(prefix, "releases", "old");
    writeRelease(previous, "1.0.0", "old");
    writeCurrentSymlink(prefix, previous);
    const staged = join(prefix, "releases", "release-interrupted");
    writeRelease(staged, "1.1.0", "interrupted");
    writeJournalFixture({
      prefix,
      releaseDir: staged,
      previousTarget: previous,
      phase: "staged",
    });
    const held = acquireServerUpgradeLock({ prefix, releaseId: "release-live-upgrade" });
    const io = fakeIo(newWorld(), paths, prefix, { forwardOnly: false });
    try {
      await expect(
        resumeServerUpgrade({ from: "1.1.0", prefix, json: true, resume: true }, io),
      ).rejects.toMatchObject({ code: "SERVER_UPGRADE_BUSY" });
      await expect(
        abandonServerUpgrade(
          { from: "", prefix, json: true, abandonJournal: true, confirm: true },
          io,
        ),
      ).rejects.toMatchObject({ code: "SERVER_UPGRADE_BUSY" });
    } finally {
      held.release();
    }
    expect(readServerUpgradeJournal(prefix)?.phase).toBe("staged");
  });

  it("refuses a resume whose journal vanished between inspection and the recovery lock (V3)", async () => {
    const { prefix, paths } = sandbox();
    const previous = join(prefix, "releases", "old");
    writeRelease(previous, "1.0.0", "old");
    writeCurrentSymlink(prefix, previous);
    const staged = join(prefix, "releases", "release-interrupted");
    writeRelease(staged, "1.1.0", "interrupted");
    writeJournalFixture({
      prefix,
      releaseDir: staged,
      previousTarget: previous,
      phase: "staged",
    });
    const world = newWorld();
    const io: UpgradeIo = {
      ...fakeIo(world, paths, prefix, { forwardOnly: false }),
      // Simulates another recovery resolving the journal while this process
      // sat between its pre-lock inspection and the acquired lock.
      probeOwner: async () => {
        rmSync(join(prefix, "upgrade-journal.json"), { force: true });
        return null;
      },
    };
    await expect(
      resumeServerUpgrade({ from: "1.1.0", prefix, json: true, resume: true }, io),
    ).rejects.toMatchObject({ code: "SERVER_UPGRADE_RECOVERY_REFUSED" });
    // Nothing was restaged, removed or activated.
    expect(existsSync(staged)).toBe(true);
    expect(readlinkSync(join(prefix, "current"))).toBe(join("releases", "old"));
    expect(world.started).toEqual([]);
  });

  it("records --confirm as the sole authority when an unusable journal is abandoned with no owner (V6)", async () => {
    const { prefix, paths } = sandbox();
    const previous = join(prefix, "releases", "old");
    writeRelease(previous, "1.0.0", "old");
    writeCurrentSymlink(prefix, previous);
    const staged = join(prefix, "releases", "release-staged");
    writeRelease(staged, "1.1.0", "staged");
    writeCurrentSymlink(prefix, staged);
    writeFileSync(join(prefix, "upgrade-journal.json"), "{corrupt\n");
    const world = newWorld();
    world.owner = null;
    const result = await abandonServerUpgrade(
      { from: "", prefix, json: true, abandonJournal: true, confirm: true },
      fakeIo(world, paths, prefix, { forwardOnly: false }),
    );
    expect(result.ok).toBe(true);
    expect(result.detail).toContain("--confirm alone");
    expect(result.detail).toContain("nor evidence");
    expect(readlinkSync(join(prefix, "current"))).toBe(join("releases", "release-staged"));
    expect(readServerUpgradeJournalState(prefix)).toEqual({ state: "absent" });
  });

  it("refuses to abandon an unusable journal while an unverifiable live owner answers (V6)", async () => {
    const { prefix, paths } = sandbox();
    const previous = join(prefix, "releases", "old");
    writeRelease(previous, "1.0.0", "old");
    const staged = join(prefix, "releases", "release-staged");
    writeRelease(staged, "1.1.0", "staged");
    writeCurrentSymlink(prefix, staged);
    writeFileSync(join(prefix, "upgrade-journal.json"), "{corrupt\n");
    const world = newWorld();
    // Pre-D4 owner: authenticated describe, but no status/admission proof.
    world.owner = legacyOwner(paths);
    await expect(
      abandonServerUpgrade(
        { from: "", prefix, json: true, abandonJournal: true, confirm: true },
        fakeIo(world, paths, prefix, { forwardOnly: false }),
      ),
    ).rejects.toMatchObject({ code: "SERVER_UPGRADE_RECOVERY_REFUSED" });
    expect(readServerUpgradeJournalState(prefix).state).toBe("invalid");
    expect(readlinkSync(join(prefix, "current"))).toBe(join("releases", "release-staged"));
  });

  it("treats unavailable/stopping admit refusals as admission-uncertain, never a rollback (F9)", async () => {
    for (const code of ["unavailable", "stopping"] as const) {
      const { prefix, paths } = sandbox();
      const previous = join(prefix, "releases", "old");
      writeRelease(previous, "1.0.0", "old");
      writeCurrentSymlink(prefix, previous);
      const world = newWorld();
      world.owner = legacyOwner(paths);
      world.schemaVersion = 46;
      const io = fakeIo(world, paths, prefix, { forwardOnly: false });
      const refusing: UpgradeIo = {
        ...io,
        admitCandidate: async () => {
          throw new HostControlRefusedError(code);
        },
      };
      const result = await upgradeServerPrefix(
        { from: "1.1.0", prefix, json: true, healthTimeoutMs: 1_000 },
        refusing,
      );
      expect(result.outcome).toBe("recovery-required");
      expect(result.rolledBack).toBe(false);
      expect(world.started).toEqual([{ staging: true }]);
      expect(readServerUpgradeJournal(prefix)?.phase).toBe("recovery-required");
    }
  });

  it("still rolls back on a definite identity-mismatch admit refusal", async () => {
    const { prefix, paths } = sandbox();
    const previous = join(prefix, "releases", "old");
    writeRelease(previous, "1.0.0", "old");
    writeCurrentSymlink(prefix, previous);
    const world = newWorld();
    world.owner = legacyOwner(paths);
    world.schemaVersion = 46;
    const io = fakeIo(world, paths, prefix, { forwardOnly: false });
    const refusing: UpgradeIo = {
      ...io,
      admitCandidate: async () => {
        throw new HostControlRefusedError("identity-mismatch");
      },
    };
    const result = await upgradeServerPrefix(
      { from: "1.1.0", prefix, json: true, healthTimeoutMs: 1_000 },
      refusing,
    );
    expect(result.outcome).toBe("rolled-back");
    expect(result.rolledBack).toBe(true);
    expect(world.started.at(-1)).toEqual({ staging: false });
  });
});
