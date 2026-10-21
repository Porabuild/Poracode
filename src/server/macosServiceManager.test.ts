import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, sep } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { hostServiceCapabilities } from "@/shared/hostControlProtocol";
import {
  parseServiceCliOptions,
  runServerService,
  type ServiceLifecycleDeps,
} from "./serverService";
import {
  macosServiceArguments,
  mutateMacosService,
  readMacosServiceState,
  type MacosServiceRun,
} from "./macosServiceManager";
import { serviceManagerContext } from "./serverServiceManager";
import { readInstalledServiceRelease, readServiceRegistration } from "./serverServiceRegistration";
import type { RunningOwnerProbe } from "./serverUpgradeIdentity";

const roots: string[] = [];
afterEach(() => {
  if (roots.length === 0) return;
  const scratch = realpathSync.native(join(process.cwd(), "tmp"));
  for (const root of roots.splice(0)) {
    if (!realpathSync.native(root).startsWith(`${scratch}${sep}`))
      throw new Error("Refusing cleanup outside the owned fixture root.");
    rmSync(root, { recursive: true, force: true });
  }
});
function fixture() {
  mkdirSync("tmp", { recursive: true });
  const root = realpathSync.native(mkdtempSync(join(process.cwd(), "tmp", "macos-service-")));
  roots.push(root);
  const prefix = join(root, "prefix"),
    profile = join(root, "profile"),
    home = join(root, "home"),
    release = join(prefix, "releases", "fixture-release");
  mkdirSync(join(release, "lib"), { recursive: true });
  mkdirSync(join(release, "resources"));
  mkdirSync(home);
  writeFileSync(join(release, "lib", "server.cjs"), "// service fixture\n");
  writeFileSync(join(release, "package.json"), JSON.stringify({ version: "1.0.0" }));
  symlinkSync(release, join(prefix, "current"), "junction");
  let loaded = false,
    pid = 0,
    owner: RunningOwnerProbe | null = null,
    held = false;
  const calls: { executable: string; args: readonly string[] }[] = [];
  let override: Record<string, unknown> = {};
  let loadedArguments: string[] = [];
  const start = () => {
    const selected = readInstalledServiceRelease(prefix),
      paths = resolveHostRootPaths(profile);
    pid = 12345;
    held = true;
    owner = {
      paths,
      generation: randomUUID(),
      pid,
      processIdentity: "fixture",
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
  };
  const shutdown = vi.fn<NonNullable<ServiceLifecycleDeps["shutdown"]>>(async () => {
    pid = 0;
    held = false;
    owner = null;
    return "accepted" as const;
  });
  const deps: ServiceLifecycleDeps = {
    platform: "darwin",
    uid: () => 501,
    home,
    macosRun: (executable, args) => {
      calls.push({ executable, args });
      const registration = readServiceRegistration(prefix);
      if (executable === "/usr/bin/osascript")
        return JSON.stringify({
          version: 1,
          job: loaded
            ? {
                label: registration!.registrationId,
                program: "/usr/bin/env",
                arguments: loadedArguments,
                pid,
                lastExitStatus: 0,
                onDemand: true,
                session: "Aqua",
                ...override,
              }
            : null,
        });
      if (args[0] === "bootstrap" || args[0] === "kickstart") {
        loaded = true;
        loadedArguments = macosServiceArguments(registration!, home);
        start();
      }
      if (args[0] === "bootout") loaded = false;
      return "";
    },
    probe: async () => owner,
    readOwner: () => null,
    lease: () => ({ state: held ? "locked" : "free", detail: "fixture" }),
    shutdown,
  };
  const execute = (action: string, ...extra: string[]) =>
    runServerService(profile, parseServiceCliOptions([action, "--prefix", prefix, ...extra]), deps);
  return {
    prefix,
    profile,
    home,
    deps,
    calls,
    shutdown,
    execute,
    get owner() {
      return owner;
    },
    setOverride: (value: Record<string, unknown>) => {
      override = value;
    },
    setHeld: (value: boolean) => {
      held = value;
    },
  };
}
describe("macOS user services", () => {
  it("installs without loading RunAtLoad, binds the existing v1 identity, then explicitly starts, retires and removes", async () => {
    const f = fixture();
    await f.execute("install");
    const registration = readServiceRegistration(f.prefix)!;
    expect(registration).toMatchObject({
      formatVersion: 1,
      manager: "launchd-agent",
      account: { kind: "uid", id: "501" },
      launcher: null,
    });
    expect(f.calls.filter((c) => c.executable === "/bin/launchctl").map((c) => c.args[0])).toEqual([
      "enable",
    ]);
    expect(readFileSync(registration.definition.locator, "utf8")).toContain(
      "<key>RunAtLoad</key><true/>",
    );
    await f.execute("start");
    const generation = f.owner!.generation;
    await f.execute("restart");
    expect(f.owner!.generation).not.toBe(generation);
    expect(f.shutdown).toHaveBeenCalledTimes(1);
    await f.execute("uninstall");
    expect(f.shutdown).toHaveBeenCalledTimes(2);
    expect(readServiceRegistration(f.prefix)).toBeNull();
    expect(existsSync(registration.definition.locator)).toBe(false);
    expect(existsSync(join(f.prefix, "releases", "fixture-release", "lib", "server.cjs"))).toBe(
      true,
    );
    expect(f.calls.filter((c) => c.executable === "/bin/launchctl").map((c) => c.args[0])).toEqual([
      "enable",
      "bootstrap",
      "kickstart",
      "disable",
      "bootout",
    ]);
    expect(f.calls.flatMap((c) => c.args)).not.toContain("-k");
  });
  it.each(["arguments", "program", "onDemand", "session"])(
    "refuses a mismatched loaded %s before shutdown or native effects",
    async (key) => {
      const f = fixture();
      await f.execute("install");
      await f.execute("start");
      const effects = f.calls.filter((c) => c.executable === "/bin/launchctl").length;
      f.setOverride({ [key]: key === "arguments" ? [] : key === "onDemand" ? false : "foreign" });
      await expect(f.execute("uninstall")).rejects.toThrow("differs");
      expect(f.shutdown).not.toHaveBeenCalled();
      expect(f.calls.filter((c) => c.executable === "/bin/launchctl")).toHaveLength(effects);
      expect(readServiceRegistration(f.prefix)!.state).toBe("installed");
    },
  );
  it("preserves a replaced definition and a future registration without effects", async () => {
    const f = fixture();
    await f.execute("install");
    const r = readServiceRegistration(f.prefix)!;
    writeFileSync(r.definition.locator, "foreign");
    await expect(f.execute("start")).rejects.toThrow("replaced or edited");
    expect(readFileSync(r.definition.locator, "utf8")).toBe("foreign");
    const future = '{"formatVersion":99,"opaque":"keep"}\n';
    writeFileSync(join(f.prefix, "service-registration.json"), future);
    await expect(f.execute("uninstall", "--recover")).rejects.toThrow("compatible CLI");
    expect(readFileSync(join(f.prefix, "service-registration.json"), "utf8")).toBe(future);
  });
  it("refuses another profile/account and an owner lease outside the job", async () => {
    const f = fixture();
    await f.execute("install");
    await expect(
      runServerService(
        `${f.profile}-other`,
        parseServiceCliOptions(["start", "--prefix", f.prefix]),
        f.deps,
      ),
    ).rejects.toThrow("profile");
    await expect(
      runServerService(f.profile, parseServiceCliOptions(["start", "--prefix", f.prefix]), {
        ...f.deps,
        uid: () => 502,
      }),
    ).rejects.toThrow("account");
    f.setHeld(true);
    await expect(f.execute("start")).rejects.toThrow("second start");
    expect(f.shutdown).not.toHaveBeenCalled();
  });
  it("requires the actual non-root graphical user before filesystem or manager effects", () => {
    const macosRun = vi.fn<MacosServiceRun>();
    expect(() => serviceManagerContext({ platform: "darwin", uid: () => 0, macosRun })).toThrow(
      "graphical login",
    );
    expect(macosRun).not.toHaveBeenCalled();
  });
  it("preserves registration edits made while authenticated retirement is joining", async () => {
    const f = fixture();
    await f.execute("install");
    await f.execute("start");
    const original = f.deps.shutdown!;
    const shutdown: NonNullable<ServiceLifecycleDeps["shutdown"]> = async (...args) => {
      const result = await original(...args);
      const r = readServiceRegistration(f.prefix)!;
      writeFileSync(
        join(f.prefix, "service-registration.json"),
        JSON.stringify({ ...r, registrationNonce: "f".repeat(48) }),
      );
      return result;
    };
    await expect(
      runServerService(f.profile, parseServiceCliOptions(["uninstall", "--prefix", f.prefix]), {
        ...f.deps,
        shutdown,
      }),
    ).rejects.toThrow("changed during retirement");
    expect(readServiceRegistration(f.prefix)!.registrationNonce).toBe("f".repeat(48));
    expect(f.calls.filter((c) => c.executable === "/bin/launchctl").map((c) => c.args[0])).toEqual([
      "enable",
      "bootstrap",
    ]);
  });
  it("recovers a prepared install without starting or changing its config", async () => {
    const f = fixture(),
      run = f.deps.macosRun!;
    await expect(
      runServerService(f.profile, parseServiceCliOptions(["install", "--prefix", f.prefix]), {
        ...f.deps,
        macosRun: (executable, args) => {
          if (executable === "/bin/launchctl" && args[0] === "enable")
            throw Error("fixture enable failure");
          return run(executable, args);
        },
      }),
    ).rejects.toThrow("fixture enable failure");
    const prepared = readServiceRegistration(f.prefix)!;
    expect(prepared.state).toBe("prepared");
    await expect(
      f.execute("install", "--recover", "--config", join(f.home, "another-config.json")),
    ).rejects.toThrow("cannot retarget");
    expect(readServiceRegistration(f.prefix)).toEqual(prepared);
    await f.execute("install", "--recover");
    expect(readServiceRegistration(f.prefix)!.state).toBe("installed");
    expect(f.owner).toBeNull();
    expect(f.calls.filter((c) => c.executable === "/bin/launchctl").map((c) => c.args[0])).toEqual([
      "enable",
    ]);
    unlinkSync(prepared.definition.locator);
    await f.execute("uninstall", "--recover");
    expect(readServiceRegistration(f.prefix)).toBeNull();
  });
  it("refuses unknown worker versions before launchctl and lost fencing before native effects", async () => {
    const f = fixture();
    await f.execute("install");
    const r = readServiceRegistration(f.prefix)!;
    expect(() =>
      readMacosServiceState(r.registrationId, f.home, r, () => '{"version":2,"job":null}'),
    ).toThrow("supported identity");
    const run = vi.fn<MacosServiceRun>(() => '{"version":1,"job":null}');
    expect(() =>
      mutateMacosService(
        "start",
        r,
        f.home,
        {
          assertHeld: () => {
            throw Error("lost lock");
          },
        },
        run,
      ),
    ).toThrow("lost lock");
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0]).toBe("/usr/bin/osascript");
  });
});
