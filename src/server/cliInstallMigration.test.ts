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
import { readLegacyServiceProfile } from "./cliLegacyProfile";
import { defaultCliProfileNamespace } from "./cliProfileNamespace";
import { migrateDefaultLegacyInstall } from "./cliLegacyMigrationCli";
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

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "poracode-legacy-migrate-")));
  roots.push(root);
  const oldPrefix = join(root, ".poracode", "server");
  const newPrefix = join(root, ".local", "share", "poracode", "server");
  const profile = join(root, ".poracode");
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
  const makeRegistration = (prefix: string, nonce: string): ServerServiceRegistration => ({
    formatVersion: 1,
    state: "installed",
    registrationId: serviceRegistrationId(profile, account),
    registrationNonce: nonce,
    manager: "systemd-user",
    account,
    profileNamespace: profile,
    installPrefix: prefix,
    nodeExecutable: join(prefix, "releases", version, "runtime", "node"),
    entrypointRelative: "current/lib/server.cjs",
    configPath: null,
    definition: { locator: join(root, "service.unit"), sha256: "a".repeat(64) },
    launcher: null,
  });
  writeServiceRegistration(makeRegistration(oldPrefix, "b".repeat(48)));
  const calls: string[] = [];
  const service = async (
    _profile: string,
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
    if (options.action === "uninstall") rmSync(join(oldPrefix, SERVER_SERVICE_REGISTRATION_FILE));
    if (options.action === "install")
      writeServiceRegistration(makeRegistration(newPrefix, deps!.registrationNonce!));
    return {};
  };
  return {
    root,
    oldPrefix,
    newPrefix,
    profile,
    calls,
    service,
    releaseRoot: join(newPrefix, "releases", version),
  };
}

describe.runIf(process.platform !== "win32")("legacy installation migration", () => {
  it("moves a running service while preserving its recorded profile and old files", async () => {
    const f = fixture();
    expect(defaultCliProfileNamespace("2.0.0-nightly.202611091529", {}, f.root)).toBe(f.profile);
    const result = await migrateLegacyService(f);
    expect(result).toEqual({ profile: f.profile, wasRunning: true });
    expect(f.calls).toEqual(["status:false", "uninstall:false", "install:false", "start:false"]);
    expect(existsSync(join(f.oldPrefix, "current"))).toBe(true);
    expect(readLegacyServiceProfile(f.newPrefix)).toBe(f.profile);
    expect(
      defaultCliProfileNamespace(
        "2.0.0-nightly.202611091529",
        { PORACODE_INSTALL_DIR: f.newPrefix },
        f.root,
      ),
    ).toBe(f.profile);
    await migrateLegacyService(f);
    expect(f.calls).toHaveLength(4);
  });

  it("recognizes the released service profile when HOME is reached through a symlink", () => {
    const f = fixture();
    const alias = join(f.root, "home-alias");
    symlinkSync(f.root, alias);
    expect(defaultCliProfileNamespace("2.0.0-nightly.202611091529", {}, alias)).toBe(f.profile);
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
    expect(readLegacyServiceProfile(f.newPrefix)).toBe(f.profile);
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
    expect(readLegacyServiceProfile(f.newPrefix)).toBe(f.profile);
  });

  it("keeps a future journal and refuses before removing the old service", async () => {
    const f = fixture();
    writeFileSync(
      join(f.newPrefix, CLI_INSTALL_MIGRATION_FILE),
      JSON.stringify({ formatVersion: 2 }),
    );
    await expect(migrateLegacyService(f)).rejects.toThrow(
      /Cannot read the legacy installation migration/u,
    );
    expect(f.calls).toEqual([]);
    expect(existsSync(join(f.oldPrefix, SERVER_SERVICE_REGISTRATION_FILE))).toBe(true);
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
