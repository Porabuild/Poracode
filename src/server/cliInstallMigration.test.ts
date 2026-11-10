import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  migrateLegacyCommand,
  migrateLegacyService,
  CLI_INSTALL_MIGRATION_FILE,
} from "./cliInstallMigration";
import { defaultCliProfileNamespace } from "./cliProfileNamespace";
import { migrateDefaultLegacyInstall } from "./cliLegacyMigrationCli";
import { relocateLegacyTooling } from "./cliLegacyToolingMove";
import { runUp } from "./cliUp";
import { readCliInstallMigration } from "./cliInstallMigrationJournal";
import {
  SERVER_SERVICE_REGISTRATION_FILE,
  readServiceRegistration,
  serviceRegistrationId,
  writeServiceRegistration,
  type ServerServiceRegistration,
} from "./serverServiceRegistration";
import {
  ServiceOwnerChangedBeforeRetirementError,
  type ServiceCliOptions,
  type ServiceLifecycleDeps,
} from "./serverService";
import { HostOwnerLease } from "@/backend/ownership/hostOwnerLease";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { probeLeaseKernelLock } from "./serverDoctorIo";

const roots: string[] = [];
const reserveFixture = async () => ({ assertActive() {}, release() {} });
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "poracode-legacy-migrate-")));
  roots.push(root);
  const oldPrefix = join(root, ".poracode", "server");
  const newPrefix = join(root, ".local", "share", "poracode", "server");
  const profile = join(root, ".poracode");
  const nightly = join(root, ".poracode-nightly");
  const version = "2.0.0-nightly.202611091529";
  for (const prefix of [oldPrefix, newPrefix]) {
    const release = join(prefix, "releases", version);
    mkdirSync(join(release, "runtime"), { recursive: true });
    mkdirSync(join(release, "lib"), { recursive: true });
    mkdirSync(join(release, "resources"), { recursive: true });
    writeFileSync(join(release, "lib", "server.cjs"), "same verified server");
    writeFileSync(join(release, "package.json"), JSON.stringify({ version }));
    writeFileSync(join(release, "runtime", "node"), "node");
    writeFileSync(
      join(release, "standalone.json"),
      JSON.stringify({
        formatVersion: 1,
        kind: "poracode-standalone-runtime",
        version,
        target: "darwin-arm64",
        node: { version: "26.13.0", executable: "runtime/node" },
      }),
    );
    symlinkSync(`releases/${version}`, join(prefix, "current"));
  }
  const account = { kind: "uid" as const, id: "501" };
  const makeRegistration = (
    prefix: string,
    nonce: string,
    selectedProfile = profile,
    configPath: string | null = null,
  ): ServerServiceRegistration => ({
    formatVersion: 1,
    state: "installed",
    registrationId: serviceRegistrationId(selectedProfile, account),
    registrationNonce: nonce,
    manager: "systemd-user",
    account,
    profileNamespace: selectedProfile,
    installPrefix: prefix,
    nodeExecutable: join(prefix, "releases", version, "runtime", "node"),
    entrypointRelative: "current/lib/server.cjs",
    configPath,
    definition: { locator: join(root, "service.unit"), sha256: "a".repeat(64) },
    launcher: null,
  });
  writeServiceRegistration(makeRegistration(oldPrefix, "b".repeat(48)));
  const calls: string[] = [];
  const service = async (
    selectedProfile: string,
    options: ServiceCliOptions,
    deps?: ServiceLifecycleDeps,
  ) => {
    calls.push(`${options.action}:${options.recover}`);
    if (options.action === "status")
      return {
        native: { ActiveState: "active", MainPID: "123" },
        ownerGeneration: "g",
        ownerManaged: true,
      };
    if (options.action === "uninstall")
      rmSync(join(options.prefix, SERVER_SERVICE_REGISTRATION_FILE));
    if (options.action === "install")
      writeServiceRegistration(
        makeRegistration(
          options.prefix,
          deps!.registrationNonce!,
          selectedProfile,
          options.config ?? null,
        ),
      );
    return {};
  };
  return {
    root,
    oldPrefix,
    newPrefix,
    profile,
    targetProfile: nightly,
    assertTargetAvailable: reserveFixture,
    home: root,
    calls,
    service,
    allowRunning: true,
    releaseRoot: join(newPrefix, "releases", version),
  };
}

describe.runIf(process.platform !== "win32")("legacy installation migration", () => {
  it("moves a running service to the nightly profile while preserving old profile files", async () => {
    const f = fixture();
    const nightly = join(f.root, ".poracode-nightly");
    writeFileSync(join(f.profile, "stable-data"), "keep stable");
    expect(defaultCliProfileNamespace("2.0.0-nightly.202611091529", {}, f.root)).toBe(nightly);
    const result = await migrateLegacyService({
      ...f,
      targetProfile: nightly,
      assertTargetAvailable: reserveFixture,
    });
    expect(result).toEqual({ profile: nightly, wasRunning: true });
    expect(f.calls).toEqual(["status:false", "uninstall:false", "install:false", "start:false"]);
    expect(existsSync(join(f.oldPrefix, "current"))).toBe(true);
    expect(readServiceRegistration(f.newPrefix)?.profileNamespace).toBe(nightly);
    expect(readFileSync(join(f.profile, "stable-data"), "utf8")).toBe("keep stable");
    expect(
      defaultCliProfileNamespace(
        "2.0.0-nightly.202611091529",
        { PORACODE_INSTALL_DIR: f.newPrefix },
        f.root,
      ),
    ).toBe(nightly);
    await migrateLegacyService(f);
    expect(f.calls).toHaveLength(4);
  });

  it("keeps nightly on the nightly path when HOME is reached through a symlink", () => {
    const f = fixture();
    const alias = join(f.root, "home-alias");
    symlinkSync(f.root, alias);
    expect(defaultCliProfileNamespace("2.0.0-nightly.202611091529", {}, alias)).toBe(
      join(alias, ".poracode-nightly"),
    );
  });

  it("resumes after a crash immediately after removing the old service", async () => {
    const f = fixture();
    const crash = async (
      profile: string,
      options: ServiceCliOptions,
      deps?: ServiceLifecycleDeps,
    ) => {
      const result = await f.service(profile, options, deps);
      if (options.action === "uninstall") throw new Error("interrupted");
      return result;
    };
    await expect(migrateLegacyService({ ...f, service: crash })).rejects.toThrow("interrupted");
    expect(
      JSON.parse(readFileSync(join(f.newPrefix, CLI_INSTALL_MIGRATION_FILE), "utf8")).phase,
    ).toBe("prepared");
    await migrateLegacyService(f);
    expect(f.calls).toEqual(["status:false", "uninstall:false", "install:false", "start:false"]);
    expect(readServiceRegistration(f.newPrefix)?.profileNamespace).toBe(f.targetProfile);
  });

  it("re-registers a legacy service in the same prefix for the nightly profile", async () => {
    const f = fixture();
    const nightly = join(f.root, ".poracode-nightly");
    const result = await migrateLegacyService({
      ...f,
      newPrefix: f.oldPrefix,
      targetProfile: nightly,
      assertTargetAvailable: reserveFixture,
    });
    expect(result.profile).toBe(nightly);
    expect(readServiceRegistration(f.oldPrefix)?.profileNamespace).toBe(nightly);
  });

  it("starts a new same-prefix move after a completed service is reinstalled", async () => {
    const f = fixture();
    const nightly = join(f.root, ".poracode-nightly");
    await migrateLegacyService({
      ...f,
      newPrefix: f.oldPrefix,
      targetProfile: nightly,
      assertTargetAvailable: reserveFixture,
    });
    const installed = readServiceRegistration(f.oldPrefix)!;
    writeServiceRegistration({ ...installed, registrationNonce: "d".repeat(48) });
    const custom = join(f.root, "custom");
    const result = await migrateLegacyService({
      ...f,
      newPrefix: f.oldPrefix,
      targetProfile: custom,
      assertTargetAvailable: reserveFixture,
    });
    expect(result.profile).toBe(custom);
    expect(readServiceRegistration(f.oldPrefix)?.profileNamespace).toBe(custom);
  });

  it("does not stop the old service if the destination profile is in use", async () => {
    const f = fixture();
    await expect(
      migrateLegacyService({
        ...f,
        targetProfile: join(f.root, ".poracode-nightly"),
        assertTargetAvailable: async () => {
          throw new Error("destination in use");
        },
      }),
    ).rejects.toThrow(/destination in use/u);
    expect(f.calls).toEqual(["status:false"]);
    expect(readServiceRegistration(f.oldPrefix)?.state).toBe("installed");
  });

  it("refuses to restart a nightly service on the stable default even when explicitly requested", async () => {
    const f = fixture();
    await expect(migrateLegacyService({ ...f, targetProfile: f.profile })).rejects.toThrow(
      /other channel/u,
    );
    expect(f.calls).toEqual([]);
    expect(readServiceRegistration(f.oldPrefix)?.state).toBe("installed");
  });

  it("holds destination ownership through retirement and registration", async () => {
    const f = fixture();
    let held = false;
    const observed: Array<[string, boolean]> = [];
    const reserve = async () => {
      held = true;
      return {
        assertActive() {
          expect(held).toBe(true);
        },
        release() {
          held = false;
        },
      };
    };
    const service = async (
      profile: string,
      options: ServiceCliOptions,
      deps?: ServiceLifecycleDeps,
    ) => {
      observed.push([options.action, held]);
      return f.service(profile, options, deps);
    };
    await migrateLegacyService({
      ...f,
      service,
      targetProfile: join(f.root, ".poracode-nightly"),
      assertTargetAvailable: reserve,
    });
    expect(observed).toEqual([
      ["status", false],
      ["uninstall", true],
      ["install", true],
      ["start", false],
    ]);
    expect(held).toBe(false);
  });

  it("preserves the journal and profiles when the destination fails to start, then resumes", async () => {
    const f = fixture();
    writeFileSync(join(f.profile, "stable-data"), "keep stable");
    const failStart = async (
      profile: string,
      options: ServiceCliOptions,
      deps?: ServiceLifecycleDeps,
    ) => {
      if (options.action === "start") throw new Error("destination claimed");
      return f.service(profile, options, deps);
    };
    await expect(migrateLegacyService({ ...f, service: failStart })).rejects.toThrow(
      /old service was stopped.*retry the migration/u,
    );
    expect(readCliInstallMigration(f.newPrefix)?.phase).toBe("new-installed");
    expect(readFileSync(join(f.profile, "stable-data"), "utf8")).toBe("keep stable");
    expect(readServiceRegistration(f.newPrefix)?.profileNamespace).toBe(f.targetProfile);
    await migrateLegacyService(f);
    expect(readCliInstallMigration(f.newPrefix)?.phase).toBe("complete");
  });

  it("probes a released reservation even while its stopped record names this process", async () => {
    const f = fixture();
    const observed: string[] = [];
    const reserve = async (profile: string) =>
      HostOwnerLease.acquire(resolveHostRootPaths(profile), "headless");
    const service = async (
      profile: string,
      options: ServiceCliOptions,
      deps?: ServiceLifecycleDeps,
    ) => {
      if (options.action === "start") {
        const paths = resolveHostRootPaths(profile);
        observed.push(probeLeaseKernelLock(paths).state, deps?.lease?.(paths).state ?? "missing");
      }
      return f.service(profile, options, deps);
    };
    await migrateLegacyService({ ...f, service, assertTargetAvailable: reserve });
    expect(observed).toEqual(["skipped-same-process", "free"]);
  });

  it("does not interrupt a running service without an explicit migration choice", async () => {
    const f = fixture();
    await expect(
      migrateLegacyService({
        ...f,
        allowRunning: false,
        targetProfile: join(f.root, ".poracode-nightly"),
        assertTargetAvailable: reserveFixture,
      }),
    ).rejects.toThrow(/stops its agent turns/u);
    expect(f.calls).toEqual(["status:false"]);
    expect(readServiceRegistration(f.oldPrefix)?.state).toBe("installed");
  });

  it("lets an npm-style up migrate an existing default service to the nightly profile", async () => {
    const f = fixture();
    const external = join(f.root, "npm-cache-entry");
    mkdirSync(external);
    writeFileSync(
      join(external, "standalone.json"),
      readFileSync(join(f.releaseRoot, "standalone.json")),
    );
    const configured: string[] = [];
    const result = await runUp(
      { reachability: "local", service: true, pair: false },
      {
        profile: f.targetProfile,
        releaseRoot: external,
        home: f.root,
        env: {},
        interactive: false,
        ownerRunning: async () => true,
        tailnetAddress: () => undefined,
        lanAddress: () => undefined,
        configure: async (_profile, args) => {
          configured.push(...args);
        },
        service: f.service,
        migrateDefaultInstall: async () => {
          const moved = await migrateLegacyService(f);
          return { prefix: f.newPrefix, profile: moved.profile, moved: [], retained: [] };
        },
      },
    );
    expect(result.prefix).toBe(f.newPrefix);
    expect(readServiceRegistration(f.newPrefix)?.profileNamespace).toBe(f.targetProfile);
    expect(configured).toContain("--bind-mode");
  });

  it("moves to a newer nightly build without starting that build on stable data", async () => {
    const f = fixture();
    const nightly = join(f.root, ".poracode-nightly");
    const next = "2.0.0-nightly.202611100001";
    const marker = JSON.parse(readFileSync(join(f.releaseRoot, "standalone.json"), "utf8"));
    marker.version = next;
    writeFileSync(join(f.releaseRoot, "standalone.json"), JSON.stringify(marker));
    writeFileSync(join(f.releaseRoot, "package.json"), JSON.stringify({ version: next }));
    writeFileSync(join(f.releaseRoot, "lib", "server.cjs"), "new nightly build");
    await expect(migrateLegacyService({ ...f, targetProfile: f.profile })).rejects.toThrow(
      /same build when retaining a profile/u,
    );
    await expect(
      migrateLegacyService({ ...f, targetProfile: nightly, assertTargetAvailable: reserveFixture }),
    ).resolves.toMatchObject({ profile: nightly });
    expect(readServiceRegistration(f.newPrefix)?.profileNamespace).toBe(nightly);
  });

  it("leaves the stable profile's explicit config behind when switching to nightly", async () => {
    const f = fixture();
    const config = join(f.oldPrefix, "custom-config.json");
    writeFileSync(config, "stable config");
    writeServiceRegistration({ ...readServiceRegistration(f.oldPrefix)!, configPath: config });
    const nightly = join(f.root, ".poracode-nightly");
    await migrateLegacyService({
      ...f,
      targetProfile: nightly,
      assertTargetAvailable: reserveFixture,
    });
    expect(readServiceRegistration(f.newPrefix)?.configPath).toBeNull();
    expect(readFileSync(config, "utf8")).toBe("stable config");
    expect(
      relocateLegacyTooling({ home: f.root, prefix: f.newPrefix, env: {}, isIdle: () => true })
        .retained,
    ).toContain(f.oldPrefix);
  });

  it("resnapshots a service that changed before retirement on the next attempt", async () => {
    const f = fixture();
    const changed = async (
      profile: string,
      options: ServiceCliOptions,
      deps?: ServiceLifecycleDeps,
    ) => {
      if (options.action === "uninstall") throw new ServiceOwnerChangedBeforeRetirementError();
      return f.service(profile, options, deps);
    };
    await expect(migrateLegacyService({ ...f, service: changed })).rejects.toThrow(
      /state changed/u,
    );
    expect(existsSync(join(f.newPrefix, CLI_INSTALL_MIGRATION_FILE))).toBe(false);
    await migrateLegacyService(f);
    expect(readServiceRegistration(f.newPrefix)?.profileNamespace).toBe(f.targetProfile);
  });

  it("keeps a future journal and refuses before removing the old service", async () => {
    const f = fixture();
    writeFileSync(
      join(f.newPrefix, CLI_INSTALL_MIGRATION_FILE),
      JSON.stringify({ formatVersion: 3 }),
    );
    await expect(migrateLegacyService(f)).rejects.toThrow(
      /Cannot read the legacy installation migration/u,
    );
    expect(f.calls).toEqual([]);
    expect(existsSync(join(f.oldPrefix, SERVER_SERVICE_REGISTRATION_FILE))).toBe(true);
  });

  it("preserves an interrupted format-1 journal and reads completed format-1 history", async () => {
    const f = fixture();
    const old = readServiceRegistration(f.oldPrefix)!;
    const journal = {
      formatVersion: 1,
      oldPrefix: f.oldPrefix,
      newPrefix: f.newPrefix,
      profile: f.profile,
      oldNonce: old.registrationNonce,
      newNonce: "c".repeat(48),
      registrationId: old.registrationId,
      account: old.account,
      configPath: null,
      releaseVersion: "2.0.0-nightly.202611091529",
      entrypointSha256: "d".repeat(64),
      ownerGeneration: null,
      nativeMainPid: "0",
      nativeState: "inactive",
      wasRunning: false,
      phase: "prepared",
    };
    const path = join(f.newPrefix, CLI_INSTALL_MIGRATION_FILE);
    const original = JSON.stringify(journal);
    writeFileSync(path, original);
    await expect(migrateLegacyService(f)).rejects.toThrow(/interrupted format-1 migration/u);
    expect(readFileSync(path, "utf8")).toBe(original);
    expect(f.calls).toEqual([]);
    writeFileSync(path, JSON.stringify({ ...journal, phase: "complete" }));
    expect(readCliInstallMigration(f.newPrefix)).toMatchObject({
      formatVersion: 2,
      oldProfile: f.profile,
      newProfile: f.profile,
    });
  });

  it("refuses two existing service registrations before upgrading or stopping either one", async () => {
    const f = fixture();
    const old = readServiceRegistration(f.oldPrefix)!;
    writeServiceRegistration({
      ...old,
      installPrefix: f.newPrefix,
      registrationNonce: "c".repeat(48),
      nodeExecutable: join(f.releaseRoot, "runtime", "node"),
    });
    await expect(
      migrateDefaultLegacyInstall({ home: f.root, env: {}, releaseRoot: f.releaseRoot }),
    ).rejects.toThrow(/Both the old and new prefixes/u);
    expect(readServiceRegistration(f.oldPrefix)?.registrationNonce).toBe("b".repeat(48));
    expect(readServiceRegistration(f.newPrefix)?.registrationNonce).toBe("c".repeat(48));
  });

  it("checks the current service profile even when an unregistered legacy runtime remains", async () => {
    const f = fixture();
    const old = readServiceRegistration(f.oldPrefix)!;
    rmSync(join(f.oldPrefix, SERVER_SERVICE_REGISTRATION_FILE));
    writeServiceRegistration({
      ...old,
      installPrefix: f.newPrefix,
      registrationNonce: "c".repeat(48),
      nodeExecutable: join(f.releaseRoot, "runtime", "node"),
    });
    await expect(
      migrateDefaultLegacyInstall({
        home: f.root,
        env: {},
        releaseRoot: f.releaseRoot,
        explicitProfile: join(f.root, "custom"),
      }),
    ).rejects.toThrow(/different profile/u);
    expect(readServiceRegistration(f.newPrefix)?.profileNamespace).toBe(f.profile);
    expect(existsSync(join(f.oldPrefix, "current"))).toBe(true);
  });

  it("does not move a different service when an explicit profile is selected", async () => {
    const f = fixture();
    await expect(
      migrateDefaultLegacyInstall({
        home: f.root,
        env: {},
        releaseRoot: f.releaseRoot,
        explicitProfile: join(f.root, "custom"),
      }),
    ).rejects.toThrow(/different profile/u);
    expect(readServiceRegistration(f.oldPrefix)?.profileNamespace).toBe(f.profile);
    expect(readServiceRegistration(f.newPrefix)).toBeNull();
  });

  it("refuses to resume if the candidate build changed after service removal", async () => {
    const f = fixture();
    const crash = async (
      profile: string,
      options: ServiceCliOptions,
      deps?: ServiceLifecycleDeps,
    ) => {
      const result = await f.service(profile, options, deps);
      if (options.action === "uninstall") throw new Error("interrupted");
      return result;
    };
    await expect(migrateLegacyService({ ...f, service: crash })).rejects.toThrow("interrupted");
    writeFileSync(join(f.releaseRoot, "lib", "server.cjs"), "different build");
    await expect(migrateLegacyService(f)).rejects.toThrow(/selected release changed/u);
    expect(f.calls).toEqual(["status:false", "uninstall:false"]);
  });

  it("refuses a pending journal that would resume nightly on the stable profile", async () => {
    const f = fixture();
    const crash = async (
      profile: string,
      options: ServiceCliOptions,
      deps?: ServiceLifecycleDeps,
    ) => {
      const result = await f.service(profile, options, deps);
      if (options.action === "uninstall") throw new Error("interrupted");
      return result;
    };
    await expect(migrateLegacyService({ ...f, service: crash })).rejects.toThrow("interrupted");
    const path = join(f.newPrefix, CLI_INSTALL_MIGRATION_FILE);
    const journal = JSON.parse(readFileSync(path, "utf8"));
    journal.newProfile = f.profile;
    journal.newRegistrationId = journal.oldRegistrationId;
    writeFileSync(path, JSON.stringify(journal));
    await expect(migrateLegacyService(f)).rejects.toThrow(/other channel/u);
    expect(readServiceRegistration(f.newPrefix)).toBeNull();
  });

  it("retargets an owned link but leaves foreign commands alone", () => {
    const f = fixture();
    const binDir = join(f.root, "bin");
    mkdirSync(binDir);
    const command = join(binDir, "poracode");
    symlinkSync(join(f.oldPrefix, "current", "bin", "poracode"), command);
    expect(migrateLegacyCommand({ oldPrefix: f.oldPrefix, newPrefix: f.newPrefix, binDir })).toBe(
      true,
    );
    expect(readlinkSync(command)).toBe(join(f.newPrefix, "current", "bin", "poracode"));
    rmSync(command);
    writeFileSync(command, "foreign");
    expect(migrateLegacyCommand({ oldPrefix: f.oldPrefix, newPrefix: f.newPrefix, binDir })).toBe(
      false,
    );
    expect(readFileSync(command, "utf8")).toBe("foreign");
  });
});
