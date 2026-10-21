import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { join, sep } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import type { HostOwnerRecord } from "@/backend/ownership/hostOwnerLease";
import { hostServiceCapabilities } from "@/shared/hostControlProtocol";
import {
  parseServiceCliOptions,
  runServerService,
  serviceCommandHelp,
  type ServiceLifecycleDeps,
} from "./serverService";
import {
  readInstalledServiceRelease,
  readServiceRegistration,
  SERVER_SERVICE_REGISTRATION_FILE,
  serverServiceRegistrationSchema,
  serverServiceRegistrationV1Schema,
} from "./serverServiceRegistration";
import { qualifyLoadedService, renderServiceDefinition } from "./serverServiceManager";
import type { RunningOwnerProbe } from "./serverUpgradeIdentity";
import { registeredServiceUpgradeIo } from "./serverServiceUpgrade";
import { defaultUpgradeIo } from "./serverUpgrade";
import {
  acquireServerUpgradeLock,
  readServerUpgradeLockRecord,
  SERVER_UPGRADE_LOCK_FILE,
} from "./serverUpgradeLock";
import type { WindowsServiceRequest, WindowsServiceRun } from "./windowsServiceManager";

const roots: string[] = [];
describe("service command help", () => {
  it("exposes only install/removal flags supported by the selected action", () => {
    expect(serviceCommandHelp("install")).toContain("[--config PATH] [--recover]");
    expect(serviceCommandHelp("uninstall")).toContain("[--recover]");
    expect(serviceCommandHelp("uninstall")).not.toContain("--config");
    for (const action of ["start", "stop", "restart", "status"]) {
      const help = serviceCommandHelp(action);
      expect(help).toContain(`service ${action} --prefix PATH`);
      expect(help).not.toContain("--recover");
      expect(help).not.toContain("--config");
      expect(help).toContain("Windows requires a logged-on interactive user");
    }
  });

  it("refuses an unknown action instead of implying it is supported", () => {
    expect(() => serviceCommandHelp("constructor")).toThrow("Run poracode service --help");
  });
});
afterEach(() => {
  if (roots.length === 0) return;
  const scratch = realpathSync.native(join(process.cwd(), "tmp"));
  for (const root of roots.splice(0)) {
    if (!realpathSync.native(root).startsWith(`${scratch}${sep}`))
      throw new Error("Refusing cleanup outside the owned fixture root.");
    rmSync(root, { recursive: true, force: true });
  }
});
function fixture(platform: "linux" | "win32" = "linux") {
  mkdirSync("tmp", { recursive: true });
  const root = realpathSync.native(mkdtempSync(join(process.cwd(), "tmp", "service-fixture-")));
  roots.push(root);
  const prefix = join(root, "installed prefix"),
    home = join(root, "home"),
    profile = join(root, "profile");
  const release = join(prefix, "releases", "release-selected");
  mkdirSync(join(release, "lib"), { recursive: true });
  mkdirSync(join(release, "resources"));
  mkdirSync(home);
  writeFileSync(join(release, "package.json"), JSON.stringify({ version: "1.2.3" }));
  writeFileSync(join(release, "lib", "server.cjs"), "// selected artifact\n");
  if (platform === "win32") {
    // Header fixture only; the injected manager never executes these bytes.
    const bytes = Buffer.alloc(512),
      target = `win32-${process.arch}`;
    bytes.writeUInt16LE(0x5a4d, 0);
    bytes.writeUInt32LE(64, 0x3c);
    bytes.writeUInt32LE(0x00004550, 64);
    bytes.writeUInt16LE(process.arch === "arm64" ? 0xaa64 : 0x8664, 68);
    bytes.writeUInt16LE(240, 84);
    bytes.writeUInt16LE(0x20b, 88);
    bytes.writeUInt16LE(2, 156);
    const directory = join(release, "resources", "service-launcher");
    mkdirSync(join(directory, target), { recursive: true });
    writeFileSync(join(directory, target, "service-launcher-v1.exe"), bytes);
    writeFileSync(
      join(directory, "manifest.json"),
      JSON.stringify({
        formatVersion: 1,
        protocolVersion: 1,
        helperVersion: "1.0.0",
        sourceSha256: "a".repeat(64),
        targets: {
          [target]: {
            relativePath: `${target}/service-launcher-v1.exe`,
            bytes: bytes.length,
            sha256: createHash("sha256").update(bytes).digest("hex"),
          },
        },
      }),
    );
  }
  symlinkSync(release, join(prefix, "current"), "junction");
  let owner: RunningOwnerProbe | null = null;
  let record: HostOwnerRecord | null = null;
  let locked = false,
    loaded = false,
    enabled = false;
  let mainPid = "0",
    active = "inactive";
  let clock = 0;
  const calls: string[][] = [];
  let onCommand: ((args: readonly string[]) => void) | undefined;
  let onWindowsRequest: ((request: WindowsServiceRequest) => void) | undefined;
  const windowsCalls: WindowsServiceRequest[] = [];
  const manager = new Map<string, string>();
  const run = vi.fn<NonNullable<ServiceLifecycleDeps["run"]>>((args: readonly string[]) => {
    calls.push([...args]);
    onCommand?.(args);
    const registration = readServiceRegistration(prefix);
    if (args[0] === "show") {
      if (!loaded) return "LoadState=not-found\n";
      return Object.entries({
        Id: `${registration!.registrationId}.service`,
        Description: `Poracode ${registration!.registrationNonce}`,
        LoadState: "loaded",
        FragmentPath: registration!.definition.locator,
        SourcePath: "",
        DropInPaths: "",
        NeedDaemonReload: "no",
        Transient: "no",
        User: "",
        Type: "exec",
        Restart: "no",
        MainPID: mainPid,
        ControlPID: "0",
        ActiveState: active,
        UnitFileState: enabled ? "enabled" : "disabled",
        ...Object.fromEntries(manager),
      })
        .map(([key, value]) => `${key}=${value}`)
        .join("\n");
    }
    if (args[0] === "daemon-reload")
      loaded = Boolean(registration && existsSync(registration.definition.locator));
    if (args[0] === "enable") enabled = true;
    if (args[0] === "disable") enabled = false;
    if (args[0] === "start") startOwner();
    return "";
  });
  function startOwner() {
    const selected = readInstalledServiceRelease(prefix),
      paths = resolveHostRootPaths(profile);
    record = {
      formatVersion: 1,
      ...paths,
      generation: randomUUID(),
      pid: 12345,
      kind: "headless",
      phase: "ready",
      startedAt: new Date().toISOString(),
    };
    owner = {
      paths,
      generation: record.generation,
      pid: record.pid,
      processIdentity: "fixture-only",
      kind: "headless",
      phase: "ready",
      description: {
        profileNamespace: paths.profileNamespace,
        dataRoot: paths.dataRoot,
        mode: "headless",
        state: "ready",
        operations: ["describe", "issue-pairing"],
        capabilities: hostServiceCapabilities(),
        remoteProtocolVersion: 12,
        endpoint: null,
      },
      status: {
        profileNamespace: paths.profileNamespace,
        dataRoot: paths.dataRoot,
        mode: "headless",
        state: "ready",
        admission: "open",
        endpoint: null,
        build: {
          version: selected.build.version!,
          root: selected.releaseDir,
          entrypointSha256: selected.build.entrypointSha256,
          sourceRevision: null,
          layoutKind: "prefix",
        },
      },
    };
    locked = true;
    mainPid = String(record.pid);
    active = "active";
  }
  const shutdown = vi.fn<NonNullable<ServiceLifecycleDeps["shutdown"]>>(async () => {
    if (record) record = { ...record, phase: "stopped" };
    owner = null;
    locked = false;
    mainPid = "0";
    active = "inactive";
    return "accepted" as const;
  });
  const probe = vi.fn<NonNullable<ServiceLifecycleDeps["probe"]>>(async () => owner);
  const windowsRun: WindowsServiceRun = (request) => {
    windowsCalls.push(request);
    onWindowsRequest?.(request);
    const account = { sid: "S-1-5-21-1000-2000-3000-1001", home };
    if (request.operation === "context") return { version: 1, account, task: null };
    if (request.operation === "register") loaded = true;
    if (request.operation === "enable") enabled = true;
    if (request.operation === "disable") enabled = false;
    if (request.operation === "start") startOwner();
    if (request.operation === "remove") loaded = false;
    return {
      version: 1,
      account,
      task: loaded
        ? {
            found: true,
            qualified: Boolean(request.definition),
            enabled,
            instances: mainPid === "0" ? 0 : 1,
            wrapperPid: mainPid === "0" ? 0 : 12344,
            hostPid: Number(mainPid),
            phase: mainPid === "0" ? "inactive" : "active",
            lastResult: 0,
          }
        : null,
    };
  };
  const deps: ServiceLifecycleDeps = {
    platform,
    uid: () => 1000,
    home,
    run,
    windowsRun,
    probe,
    shutdown,
    readOwner: () => record,
    lease: () => ({ state: locked ? "locked" : "free", detail: "fixture only" }),
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
  };
  const options = (action: string, ...extra: string[]) =>
    parseServiceCliOptions([action, "--prefix", prefix, ...extra]);
  const execute = (action: string, ...extra: string[]) =>
    runServerService(profile, options(action, ...extra), deps);
  return {
    root,
    prefix,
    home,
    profile,
    release,
    run,
    calls,
    windowsCalls,
    deps,
    probe,
    shutdown,
    manager,
    execute,
    options,
    startOwner,
    get owner() {
      return owner;
    },
    get record() {
      return record;
    },
    setOwner(value: RunningOwnerProbe | null) {
      owner = value;
    },
    setRecord(value: HostOwnerRecord | null) {
      record = value;
    },
    setLease(value: boolean) {
      locked = value;
    },
    setNative(pid: string, state: string) {
      mainPid = pid;
      active = state;
    },
    onCommand(value: (args: readonly string[]) => void) {
      onCommand = value;
    },
    onWindowsRequest(value: (request: WindowsServiceRequest) => void) {
      onWindowsRequest = value;
    },
  };
}

describe("explicit installed-prefix service administration", () => {
  it.each(
    [
      [],
      ["install"],
      ["start", "--prefix", "a", "--config", "b"],
      ["start", "--prefix", "a", "--recover"],
      ["stop", "--prefix", "a", "--force"],
      ["install", "--prefix", "a", "--prefix", "b"],
    ].map((args) => ({ args })),
  )("rejects unqualified flags $args", ({ args }) => {
    expect(() => parseServiceCliOptions(args)).toThrow("service");
  });
  it.each(["freebsd"] as const)(
    "refuses %s before filesystem/manager effects",
    async (platform) => {
      const run = vi.fn<NonNullable<ServiceLifecycleDeps["run"]>>();
      await expect(
        runServerService("absent", parseServiceCliOptions(["install", "--prefix", "absent"]), {
          platform,
          run,
        }),
      ).rejects.toThrow("not qualified");
      expect(run).not.toHaveBeenCalled();
    },
  );
  it("refuses to persist an Electron executable as native Node before prefix/manager effects", async () => {
    const f = fixture();
    const descriptor = Object.getOwnPropertyDescriptor(process.versions, "electron");
    Object.defineProperty(process.versions, "electron", {
      configurable: true,
      value: "fixture-electron",
    });
    try {
      await expect(f.execute("install")).rejects.toThrow("supported native Node.js");
      expect(f.run).not.toHaveBeenCalled();
      expect(readServiceRegistration(f.prefix)).toBeNull();
      expect(readServerUpgradeLockRecord(f.prefix)).toBeNull();
    } finally {
      if (descriptor) Object.defineProperty(process.versions, "electron", descriptor);
      else Reflect.deleteProperty(process.versions, "electron");
    }
  });
  it("installs without start, retains selected current and uses the real releaseId in the shared lock", async () => {
    const f = fixture();
    let observedRelease: string | undefined;
    f.onCommand(() => {
      observedRelease = readServerUpgradeLockRecord(f.prefix)?.releaseId;
    });
    await expect(f.execute("install")).resolves.toMatchObject({ state: "installed" });
    expect(observedRelease).toBe("release-selected");
    expect(f.calls.some(([action]) => action === "start")).toBe(false);
    const registration = readServiceRegistration(f.prefix)!;
    expect(registration).toMatchObject({
      state: "installed",
      installPrefix: realpathSync.native(f.prefix),
      configPath: null,
      launcher: null,
    });
    const text = readFileSync(registration.definition.locator, "utf8");
    expect(text).toContain(join(f.prefix, "current", "lib", "server.cjs").replace(/\\/gu, "\\\\"));
    expect(text).toContain(f.profile.replace(/\\/gu, "\\\\"));
    expect(text).not.toContain(f.release);
    expect(readServerUpgradeLockRecord(f.prefix)).toBeNull();
  });
  it("preserves future registration bytes and refuses before native effects", async () => {
    const f = fixture();
    const bytes = '{"formatVersion":99,"retain":"future"}\n';
    writeFileSync(join(f.prefix, SERVER_SERVICE_REGISTRATION_FILE), bytes);
    for (const action of ["install", "status", "start", "stop", "restart", "uninstall"]) {
      await expect(f.execute(action)).rejects.toThrow("compatible CLI");
      expect(readFileSync(join(f.prefix, SERVER_SERVICE_REGISTRATION_FILE), "utf8")).toBe(bytes);
    }
    expect(f.calls).toEqual([]);
  });
  it("installs with an existing configuration file without treating it as a namespace", async () => {
    const f = fixture();
    const config = join(f.root, "selected configuration.json");
    const bytes = '{ "host": "127.0.0.1", "port": 0 }\n';
    writeFileSync(config, bytes);
    await expect(f.execute("install", "--config", config)).resolves.toMatchObject({
      state: "installed",
    });
    const registration = readServiceRegistration(f.prefix)!;
    expect(registration.configPath).toBe(config);
    expect(readFileSync(registration.definition.locator, "utf8")).toContain(
      config.replace(/\\/gu, "\\\\"),
    );
    expect(readFileSync(config, "utf8")).toBe(bytes);
    expect(f.calls.some(([action]) => action === "start")).toBe(false);
  });
  it("recovers the same prepared configuration file without retargeting or starting it", async () => {
    const f = fixture();
    const config = join(f.root, "selected configuration.json");
    writeFileSync(config, '{"port":0}\n');
    f.onCommand((args) => {
      if (args[0] === "enable") throw new Error("controlled enable failure");
    });
    await expect(f.execute("install", "--config", config)).rejects.toThrow(
      "controlled enable failure",
    );
    const prepared = readServiceRegistration(f.prefix)!;
    expect(prepared.state).toBe("prepared");
    f.onCommand(() => {});
    const changed = join(f.root, "different configuration.json");
    writeFileSync(changed, '{"port":1}\n');
    const before = readFileSync(join(f.prefix, SERVER_SERVICE_REGISTRATION_FILE), "utf8");
    await expect(f.execute("install", "--recover", "--config", changed)).rejects.toThrow(
      "cannot retarget",
    );
    expect(readFileSync(join(f.prefix, SERVER_SERVICE_REGISTRATION_FILE), "utf8")).toBe(before);
    await expect(f.execute("install", "--recover", "--config", config)).resolves.toMatchObject({
      state: "installed",
    });
    expect(readServiceRegistration(f.prefix)).toMatchObject({
      configPath: config,
      registrationNonce: prepared.registrationNonce,
    });
    expect(f.calls.some(([action]) => action === "start")).toBe(false);
  });
  it("refuses a directory as a configuration file without publishing a registration", async () => {
    const f = fixture();
    await expect(f.execute("install", "--config", f.home)).rejects.toThrow("configPath");
    expect(readServiceRegistration(f.prefix)).toBeNull();
    expect(f.calls.every(([action]) => action === "show")).toBe(true);
  });
  it("validates canonical file paths separately from directory namespaces", async () => {
    const f = fixture();
    await f.execute("install");
    const registration = readServiceRegistration(f.prefix)!;
    expect(serverServiceRegistrationSchema.safeParse(registration).success).toBe(true);
    for (const nodeExecutable of [f.root, "relative-node", `${f.root}/../node`])
      expect(
        serverServiceRegistrationSchema.safeParse({ ...registration, nodeExecutable }).success,
      ).toBe(false);
    expect(
      serverServiceRegistrationSchema.safeParse({
        ...registration,
        profileNamespace: process.execPath,
      }).success,
    ).toBe(false);
    const definition = { ...registration.definition, locator: f.root };
    expect(serverServiceRegistrationSchema.safeParse({ ...registration, definition }).success).toBe(
      false,
    );
  });
  it("refuses another profile/account on the selected prefix without rewriting it", async () => {
    const f = fixture();
    await f.execute("install");
    const before = readFileSync(join(f.prefix, SERVER_SERVICE_REGISTRATION_FILE));
    f.calls.length = 0;
    await expect(
      runServerService(join(f.root, "other"), f.options("install"), f.deps),
    ).rejects.toThrow("One managed registration");
    await expect(
      runServerService(f.profile, f.options("uninstall"), { ...f.deps, uid: () => 1001 }),
    ).rejects.toThrow("another service profile/account");
    expect(f.calls).toEqual([]);
    expect(readFileSync(join(f.prefix, SERVER_SERVICE_REGISTRATION_FILE))).toEqual(before);
  });
  it("preserves a prepared registration across enable failure and explicitly recovers its nonce", async () => {
    const f = fixture();
    let fail = true;
    f.onCommand(([action]) => {
      if (action === "enable" && fail) throw new Error("controlled enable failure");
    });
    await expect(f.execute("install")).rejects.toThrow("controlled enable failure");
    const before = readServiceRegistration(f.prefix)!;
    expect(before.state).toBe("prepared");
    await expect(f.execute("install")).rejects.toThrow("--recover");
    fail = false;
    await f.execute("install", "--recover");
    expect(readServiceRegistration(f.prefix)).toMatchObject({
      state: "installed",
      registrationNonce: before.registrationNonce,
    });
  });
  it.each(["DropInPaths", "NeedDaemonReload", "FragmentPath", "Restart", "User"])(
    "refuses edited loaded %s before start/shutdown",
    async (property) => {
      const f = fixture();
      await f.execute("install");
      f.calls.length = 0;
      f.manager.set(property, "unqualified");
      await expect(f.execute("start")).rejects.toThrow(property);
      expect(f.shutdown).not.toHaveBeenCalled();
      expect(f.calls.every(([action]) => action === "show")).toBe(true);
    },
  );
  it("refuses desktop and mismatched builds without shutdown or manager stop", async () => {
    const f = fixture();
    await f.execute("install");
    f.startOwner();
    f.setOwner({ ...f.owner!, kind: "desktop" });
    await expect(f.execute("stop")).rejects.toThrow("desktop/older");
    f.startOwner();
    f.setOwner({
      ...f.owner!,
      status: {
        ...f.owner!.status!,
        build: { ...f.owner!.status!.build, root: join(f.root, "other-build") },
      },
    });
    await expect(f.execute("restart")).rejects.toThrow("build.root");
    expect(f.shutdown).not.toHaveBeenCalled();
    expect(f.calls.some(([action]) => ["stop", "restart", "kill"].includes(action!))).toBe(false);
  });
  it("starts, proves the fresh owner, joins shutdown and removes only its registration", async () => {
    const f = fixture();
    await f.execute("install");
    await expect(f.execute("start")).resolves.toMatchObject({
      state: "running",
      ownerGeneration: expect.any(String),
    });
    expect(f.probe).toHaveBeenCalledWith(resolveHostRootPaths(f.profile), { pinGeneration: true });
    const generation = f.owner!.generation;
    await expect(f.execute("stop")).resolves.toMatchObject({ state: "stopped" });
    expect(f.shutdown).toHaveBeenCalledWith(
      resolveHostRootPaths(f.profile),
      generation,
      expect.objectContaining({ call: expect.any(Function) }),
    );
    await expect(f.execute("uninstall")).resolves.toMatchObject({ state: "not-installed" });
    expect(readServiceRegistration(f.prefix)).toBeNull();
    expect(existsSync(f.release)).toBe(true);
  });
  it("refuses restart/removal while the retired owner's kernel lease remains held", async () => {
    const f = fixture();
    await f.execute("install");
    f.startOwner();
    f.shutdown.mockImplementationOnce(async () => {
      f.setRecord({ ...f.record!, phase: "stopped" });
      f.setOwner(null);
      f.setNative("0", "inactive");
      return "accepted";
    });
    await expect(f.execute("restart")).rejects.toThrow("not joined");
    expect(f.calls.some(([action]) => action === "start")).toBe(false);
    expect(readServiceRegistration(f.prefix)?.state).toBe("installed");
  });
  it("refuses an owner replacement after shutdown rather than stopping it", async () => {
    const f = fixture();
    await f.execute("install");
    f.startOwner();
    f.shutdown.mockImplementationOnce(async () => {
      f.startOwner();
      return "accepted";
    });
    await expect(f.execute("uninstall")).rejects.toThrow("different owner");
    expect(readServiceRegistration(f.prefix)?.state).toBe("installed");
    expect(f.shutdown).toHaveBeenCalledTimes(1);
  });
  it("retains removing metadata after unlink/reload interruption and explicitly finishes recovery", async () => {
    const f = fixture();
    await f.execute("install");
    let fail = true;
    f.onCommand(([action]) => {
      const r = readServiceRegistration(f.prefix);
      if (action === "daemon-reload" && r?.state === "removing" && fail)
        throw new Error("controlled reload failure");
    });
    await expect(f.execute("uninstall")).rejects.toThrow("controlled reload failure");
    expect(readServiceRegistration(f.prefix)?.state).toBe("removing");
    fail = false;
    await expect(f.execute("uninstall", "--recover")).resolves.toMatchObject({
      state: "not-installed",
    });
  });
  it("serializes service mutations against the unchanged prefix-upgrade lock", async () => {
    const f = fixture();
    const lock = acquireServerUpgradeLock({ prefix: f.prefix, releaseId: "release-selected" });
    try {
      await expect(f.execute("install")).rejects.toThrow("already in progress");
      expect(f.calls).toEqual([]);
    } finally {
      lock.release();
    }
  });
  it("refuses control characters in a profile before writing registration/unit contents", async () => {
    const f = fixture();
    await expect(
      runServerService(join(f.root, "profile\n[Service]"), f.options("install"), f.deps),
    ).rejects.toThrow("control characters");
    expect(readServiceRegistration(f.prefix)).toBeNull();
    expect(f.calls.every(([action]) => action === "show")).toBe(true);
  });
  it("refuses source definition drift rather than accepting a matching friendly name", async () => {
    const f = fixture();
    await f.execute("install");
    const registration = readServiceRegistration(f.prefix)!;
    writeFileSync(
      registration.definition.locator,
      renderServiceDefinition(registration) + "Environment=UNOWNED=value\n",
    );
    expect(() => qualifyLoadedService(registration, f.deps)).toThrow("replaced or edited");
  });
});

describe("registered upgrade custody", () => {
  it("returns the exact unchanged IO when no registration exists", async () => {
    const f = fixture();
    const lock = { assertHeld: vi.fn<() => void>() };
    expect(
      await registeredServiceUpgradeIo(defaultUpgradeIo, f.prefix, f.profile, lock, f.deps),
    ).toBe(defaultUpgradeIo);
    expect(lock.assertHeld).not.toHaveBeenCalled();
    expect(f.calls).toEqual([]);
  });
  it("refuses mismatched profiles/future formats before legacy stage/stop/start", async () => {
    const f = fixture();
    await f.execute("install");
    const legacy = {
      ...defaultUpgradeIo,
      stage: vi.fn<typeof defaultUpgradeIo.stage>(),
      stopOwner: vi.fn<typeof defaultUpgradeIo.stopOwner>(),
      startCandidate: vi.fn<typeof defaultUpgradeIo.startCandidate>(),
    };
    await expect(
      registeredServiceUpgradeIo(
        legacy,
        f.prefix,
        join(f.root, "other"),
        { assertHeld() {} },
        f.deps,
      ),
    ).rejects.toThrow("another service profile/account");
    writeFileSync(join(f.prefix, SERVER_SERVICE_REGISTRATION_FILE), '{"formatVersion":99}');
    await expect(
      registeredServiceUpgradeIo(legacy, f.prefix, f.profile, { assertHeld() {} }, f.deps),
    ).rejects.toThrow("compatible CLI");
    expect(legacy.stage).not.toHaveBeenCalled();
    expect(legacy.stopOwner).not.toHaveBeenCalled();
    expect(legacy.startCandidate).not.toHaveBeenCalled();
  });
  it("never falls back to legacy start/stop and refuses rollback with an unjoined lease", async () => {
    const f = fixture();
    await f.execute("install");
    const legacy = {
      ...defaultUpgradeIo,
      writeCurrent: vi.fn<typeof defaultUpgradeIo.writeCurrent>(),
      startCandidate: vi.fn<typeof defaultUpgradeIo.startCandidate>(),
      stopCandidate: vi.fn<typeof defaultUpgradeIo.stopCandidate>(),
    };
    const lock = { assertHeld: vi.fn<() => void>() };
    const io = await registeredServiceUpgradeIo(legacy, f.prefix, f.profile, lock, f.deps);
    const handle = await io.startCandidate({ prefix: f.prefix, staging: true });
    expect(handle).toMatchObject({ child: null, target: { kind: "registered" } });
    expect(legacy.startCandidate).not.toHaveBeenCalled();
    f.setLease(true);
    expect(() => io.writeCurrent(f.prefix, f.release)).toThrow("retirement is unconfirmed");
    expect(legacy.writeCurrent).not.toHaveBeenCalled();
    await io.stopCandidate(handle);
    expect(legacy.stopCandidate).not.toHaveBeenCalled();
    expect(lock.assertHeld).toHaveBeenCalled();
  });
  it("fences a lost lock and preserves the registration/current target", async () => {
    const f = fixture();
    await f.execute("install");
    let lost = false;
    const io = await registeredServiceUpgradeIo(
      defaultUpgradeIo,
      f.prefix,
      f.profile,
      {
        assertHeld() {
          if (lost) throw new Error("controlled lost lock");
        },
      },
      f.deps,
    );
    lost = true;
    await expect(io.startCandidate({ prefix: f.prefix, staging: true })).rejects.toThrow(
      "controlled lost lock",
    );
    expect(f.calls.some(([action]) => action === "start")).toBe(false);
    expect(readInstalledServiceRelease(f.prefix).releaseDir).toBe(f.release);
    expect(readServiceRegistration(f.prefix)?.state).toBe("installed");
  });
});

describe("version-2 Windows registered service custody", () => {
  it("refuses an existing foreign task before publishing prefix metadata", async () => {
    const f = fixture("win32");
    const windowsRun: WindowsServiceRun = (request) => {
      const result = f.deps.windowsRun!(request);
      return request.operation === "inspect"
        ? {
            ...result,
            task: {
              found: true,
              qualified: false,
              enabled: true,
              instances: 0,
              wrapperPid: 0,
              hostPid: 0,
              phase: "inactive",
              lastResult: 0,
            },
          }
        : result;
    };
    await expect(
      runServerService(f.profile, f.options("install"), { ...f.deps, windowsRun }),
    ).rejects.toThrow("overwrite/adopt");
    expect(readServiceRegistration(f.prefix)).toBeNull();
    expect(existsSync(join(f.prefix, "service-launcher-v1.exe"))).toBe(false);
    expect(f.windowsCalls.some((call) => call.operation === "register")).toBe(false);
  });

  it("refuses another Windows account before inspecting or changing the native task", async () => {
    const f = fixture("win32");
    await f.execute("install");
    f.windowsCalls.length = 0;
    const before = readFileSync(join(f.prefix, SERVER_SERVICE_REGISTRATION_FILE));
    const windowsRun: WindowsServiceRun = (request) => {
      const result = f.deps.windowsRun!(request);
      return { ...result, account: { ...result.account, sid: "S-1-5-21-1000-2000-3000-1002" } };
    };
    await expect(
      runServerService(f.profile, f.options("uninstall"), { ...f.deps, windowsRun }),
    ).rejects.toThrow("another service profile/account");
    expect(f.windowsCalls.every((call) => call.operation === "context")).toBe(true);
    expect(readFileSync(join(f.prefix, SERVER_SERVICE_REGISTRATION_FILE))).toEqual(before);
  });

  it("installs without starting and reuses authenticated start/stop before exact removal", async () => {
    const f = fixture("win32");
    await expect(f.execute("install")).resolves.toMatchObject({
      state: "installed",
      registration: { formatVersion: 2, manager: "windows-task" },
    });
    const registration = readServiceRegistration(f.prefix)!;
    expect(serverServiceRegistrationV1Schema.safeParse(registration).success).toBe(false);
    expect(f.windowsCalls.some((call) => call.operation === "start")).toBe(false);
    expect(f.calls).toEqual([]);
    await expect(f.execute("start")).resolves.toMatchObject({ state: "running" });
    const generation = f.owner!.generation;
    await expect(f.execute("stop")).resolves.toMatchObject({ state: "stopped" });
    expect(f.shutdown).toHaveBeenCalledWith(
      resolveHostRootPaths(f.profile),
      generation,
      expect.any(Object),
    );
    await expect(f.execute("uninstall")).resolves.toMatchObject({ state: "not-installed" });
    expect(readServiceRegistration(f.prefix)).toBeNull();
    expect(existsSync(join(f.prefix, "service-launcher-v1.exe"))).toBe(false);
    expect(existsSync(f.release)).toBe(true);
  });

  it("keeps prepared nonce/helper/config across failure and refuses recovery retargeting", async () => {
    const f = fixture("win32"),
      config = join(f.root, "selected config.json");
    writeFileSync(config, '{"port":0}\n');
    f.onWindowsRequest((request) => {
      if (request.operation === "enable") throw new Error("controlled enable failure");
    });
    await expect(f.execute("install", "--config", config)).rejects.toThrow(
      "controlled enable failure",
    );
    const before = readServiceRegistration(f.prefix)!;
    expect(before.state).toBe("prepared");
    f.onWindowsRequest(() => {});
    await expect(
      f.execute("install", "--recover", "--config", join(f.root, "other.json")),
    ).rejects.toThrow("cannot retarget");
    await f.execute("install", "--recover", "--config", config);
    expect(readServiceRegistration(f.prefix)).toMatchObject({
      registrationNonce: before.registrationNonce,
      launcher: before.launcher,
      configPath: config,
      state: "installed",
    });
    expect(f.windowsCalls.some((call) => call.operation === "start")).toBe(false);
  });

  it("cleans an explicitly recovered prepared install with no native task or helper", async () => {
    const f = fixture("win32");
    f.onWindowsRequest((request) => {
      if (request.operation === "register") throw new Error("controlled registration failure");
    });
    await expect(f.execute("install")).rejects.toThrow("controlled registration failure");
    unlinkSync(join(f.prefix, "service-launcher-v1.exe"));
    f.onWindowsRequest(() => {});
    await expect(f.execute("uninstall", "--recover")).resolves.toMatchObject({
      state: "not-installed",
    });
    expect(readServiceRegistration(f.prefix)).toBeNull();
    expect(existsSync(join(f.prefix, "service-definition-v1.json"))).toBe(false);
  });

  it("refuses changed launcher bytes before native start/removal", async () => {
    const f = fixture("win32");
    await f.execute("install");
    const path = join(f.prefix, "service-launcher-v1.exe"),
      bytes = readFileSync(path);
    bytes[400] = 1;
    writeFileSync(path, bytes);
    f.windowsCalls.length = 0;
    await expect(f.execute("start")).rejects.toThrow("launcher");
    await expect(f.execute("uninstall")).rejects.toThrow("launcher");
    expect(f.windowsCalls.every((call) => ["context", "inspect"].includes(call.operation))).toBe(
      true,
    );
    expect(f.shutdown).not.toHaveBeenCalled();
    expect(readServiceRegistration(f.prefix)?.state).toBe("installed");
  });

  it("preserves future registration/helper versions without native effects", async () => {
    const f = fixture("win32");
    await f.execute("install");
    const registration = readServiceRegistration(f.prefix)!;
    for (const value of [
      { ...registration, formatVersion: 3 },
      { ...registration, launcher: { ...registration.launcher, protocolVersion: 2 } },
    ]) {
      const path = join(f.prefix, SERVER_SERVICE_REGISTRATION_FILE),
        before = JSON.stringify(value);
      writeFileSync(path, before);
      f.windowsCalls.length = 0;
      await expect(f.execute("uninstall", "--recover")).rejects.toThrow("compatible CLI");
      expect(readFileSync(path, "utf8")).toBe(before);
      expect(f.windowsCalls.every((call) => call.operation === "context")).toBe(true);
    }
  });

  it("refuses a desktop owner before disabling or shutting down the registered task", async () => {
    const f = fixture("win32");
    await f.execute("install");
    f.startOwner();
    f.setOwner({ ...f.owner!, kind: "desktop" });
    f.windowsCalls.length = 0;
    await expect(f.execute("uninstall")).rejects.toThrow("desktop/older");
    expect(f.shutdown).not.toHaveBeenCalled();
    expect(f.windowsCalls.every((call) => ["context", "inspect"].includes(call.operation))).toBe(
      true,
    );
    expect(readServiceRegistration(f.prefix)?.state).toBe("installed");
  });

  it("retains removal evidence while a wrapper/task remains after owner shutdown", async () => {
    const f = fixture("win32");
    await f.execute("install");
    f.startOwner();
    let heldWrapper = false;
    const shutdown = f.shutdown.getMockImplementation()!;
    f.shutdown.mockImplementation(async (...args) => {
      const result = await shutdown(...args);
      heldWrapper = true;
      return result;
    });
    const windowsRun: WindowsServiceRun = (request) => {
      const value = f.deps.windowsRun!(request);
      return heldWrapper && value.task
        ? {
            ...value,
            task: { ...value.task, wrapperPid: 12344, instances: 1, phase: "activating" },
          }
        : value;
    };
    await expect(
      runServerService(f.profile, f.options("uninstall"), { ...f.deps, windowsRun }),
    ).rejects.toThrow("not joined");
    expect(f.windowsCalls.some((call) => call.operation === "remove")).toBe(false);
    expect(readServiceRegistration(f.prefix)?.state).toBe("removing");
  });

  it("checks the existing prefix fence after preparation and before native registration", async () => {
    const f = fixture("win32");
    let stolen = false;
    f.onWindowsRequest((request) => {
      if (
        !stolen &&
        request.operation === "context" &&
        existsSync(join(f.prefix, "service-definition-v1.json"))
      ) {
        const record = readServerUpgradeLockRecord(f.prefix)!;
        stolen = true;
        writeFileSync(
          join(f.prefix, SERVER_UPGRADE_LOCK_FILE),
          JSON.stringify({ ...record, token: "replacement-token-held-by-fixture" }),
        );
      }
    });
    await expect(f.execute("install")).rejects.toThrow("no longer holds the lock");
    expect(stolen).toBe(true);
    expect(
      f.windowsCalls.some((call) => ["register", "enable", "start"].includes(call.operation)),
    ).toBe(false);
    expect(readServiceRegistration(f.prefix)?.state).toBe("prepared");
  });

  it("keeps the registered launcher immutable and uses the registered upgrade path", async () => {
    const f = fixture("win32");
    await f.execute("install");
    const path = join(f.prefix, "service-launcher-v1.exe"),
      before = readFileSync(path),
      registration = readServiceRegistration(f.prefix)!;
    const legacy = {
      ...defaultUpgradeIo,
      startCandidate: vi.fn<typeof defaultUpgradeIo.startCandidate>(),
    };
    const io = await registeredServiceUpgradeIo(
      legacy,
      f.prefix,
      f.profile,
      { assertHeld() {} },
      f.deps,
    );
    await io.startCandidate({ prefix: f.prefix, staging: true });
    expect(legacy.startCandidate).not.toHaveBeenCalled();
    expect(readFileSync(path)).toEqual(before);
    expect(readServiceRegistration(f.prefix)?.launcher).toEqual(registration.launcher);
    expect(f.windowsCalls.some((call) => call.operation === "start")).toBe(true);
  });
});
