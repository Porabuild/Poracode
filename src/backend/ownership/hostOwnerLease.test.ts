import Database from "better-sqlite3";
import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { HostOwnerLease, HostRootInUseError, readHostOwnerRecord } from "./hostOwnerLease";
import { resolveHostRootPaths } from "./hostRootPaths";

const directories: string[] = [];
const leases: HostOwnerLease[] = [];
const children: ChildProcess[] = [];

function namespace(): string {
  const parent = mkdtempSync(join(tmpdir(), "poracode-owner-lease-"));
  directories.push(parent);
  return join(realpathSync.native(parent), "profile");
}

function own(profile: string, kind: "desktop" | "headless" = "desktop") {
  const lease = HostOwnerLease.acquire(resolveHostRootPaths(profile), kind);
  leases.push(lease);
  return lease;
}

async function contender(profile: string, kind: "desktop" | "headless") {
  const child = fork(
    fileURLToPath(new URL("./fixtures/leaseProcess.mjs", import.meta.url)),
    [profile, kind],
    {
      execArgv: [
        "--expose-gc",
        "--experimental-transform-types",
        "--disable-warning=ExperimentalWarning",
        "--import",
        fileURLToPath(new URL("../../../scripts/remote-v3-ts-register.mjs", import.meta.url)),
      ],
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    },
  );
  children.push(child);
  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const result = await Promise.race([
    once(child, "message").then(
      ([message]) => message as { status: string; code?: string; generation?: string },
    ),
    once(child, "exit").then(() => {
      throw new Error(`Lease child exited before replying: ${stderr}`);
    }),
  ]);
  return { child, result };
}

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    await exited;
  }
  for (const lease of leases.splice(0)) lease.release();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("host profile namespace", () => {
  it("maps explicit and not-yet-created namespaces to separate literal sibling roots", () => {
    const profile = namespace();
    const paths = resolveHostRootPaths(profile);
    expect(paths.dataRoot).toBe(`${profile}.host-v1`);
    expect(paths.electronUserDataRoot).toBe(`${profile}.client-v1`);
    expect(dirname(paths.leasePath)).toBe(dirname(profile));
    expect(paths.leasePath.startsWith(`${paths.dataRoot}/`)).toBe(false);
  });

  it("maps aliases of an existing directory to one ownership identity", () => {
    const profile = namespace();
    mkdirSync(profile);
    const alias = `${profile}-alias`;
    symlinkSync(profile, alias, process.platform === "win32" ? "junction" : "dir");
    expect(resolveHostRootPaths(alias)).toEqual(resolveHostRootPaths(profile));
  });

  it("rejects relative namespaces, filesystem roots and accidental owned-root nesting", () => {
    expect(() => resolveHostRootPaths("relative-profile")).toThrow(/absolute/u);
    expect(() => resolveHostRootPaths(parse(namespace()).root)).toThrow(/filesystem root/u);
    expect(() => resolveHostRootPaths(`${namespace()}.host-v1`)).toThrow(/not an owned/u);
  });

  it.each(["alias-first", "physical-first"] as const)(
    "cannot give one physical data root two ownership identities (%s)",
    (order) => {
      const physical = namespace();
      const alias = namespace();
      const physicalPaths = resolveHostRootPaths(physical);
      const aliasPaths = resolveHostRootPaths(alias);
      mkdirSync(physicalPaths.dataRoot);
      symlinkSync(
        physicalPaths.dataRoot,
        aliasPaths.dataRoot,
        process.platform === "win32" ? "junction" : "dir",
      );
      if (order === "physical-first") own(physical);
      expect(() => own(alias)).toThrow(/owned root.*symbolic link/u);
      if (order === "alias-first") own(physical);
    },
  );

  it.each(["legacy", "server"] as const)(
    "rejects a client directory alias into %s state",
    (target) => {
      const profile = namespace();
      const paths = resolveHostRootPaths(profile);
      const destination = target === "legacy" ? profile : paths.dataRoot;
      mkdirSync(destination);
      symlinkSync(
        destination,
        paths.electronUserDataRoot,
        process.platform === "win32" ? "junction" : "dir",
      );
      expect(() => resolveHostRootPaths(profile)).toThrow(/client root.*symbolic link/u);
    },
  );
});

describe("host owner kernel lease", () => {
  it("retains abandoned ownership until the process exits instead of releasing through GC", async () => {
    const profile = namespace();
    const holder = await contender(profile, "headless");
    expect(holder.result.status).toBe("owned");
    const abandoned = once(holder.child, "message");
    holder.child.send("abandon");
    await abandoned;
    expect((await contender(profile, "desktop")).result).toMatchObject({
      status: "refused",
      code: "HOST_ROOT_IN_USE",
    });
    const exited = once(holder.child, "exit");
    holder.child.kill("SIGKILL");
    await exited;
    expect((await contender(profile, "desktop")).result.status).toBe("owned");
  });

  it("admits exactly one owner when desktop and headless launch together", async () => {
    const profile = namespace();
    const attempts = await Promise.all([
      contender(profile, "desktop"),
      contender(profile, "headless"),
    ]);
    expect(attempts.map(({ result }) => result.status).sort()).toEqual(["owned", "refused"]);
    expect(attempts.find(({ result }) => result.status === "refused")?.result.code).toBe(
      "HOST_ROOT_IN_USE",
    );
  });

  it.each([
    ["desktop", "headless"],
    ["headless", "desktop"],
  ] as const)(
    "excludes a %s then %s startup before the second can own state",
    async (first, second) => {
      const profile = namespace();
      const lease = own(profile, first);
      const other = await contender(profile, second);
      expect(other.result).toMatchObject({ status: "refused", code: "HOST_ROOT_IN_USE" });
      expect(readHostOwnerRecord(lease.paths)?.generation).toBe(lease.generation);
    },
  );

  it("does not reclaim live ownership from empty, corrupt or dead-PID metadata", async () => {
    const profile = namespace();
    const lease = own(profile);
    for (const metadata of ["", "invalid-json", JSON.stringify({ pid: 999_999_999 })]) {
      writeFileSync(lease.paths.ownerRecordPath, metadata);
      expect((await contender(profile, "headless")).result).toMatchObject({
        status: "refused",
        code: "HOST_ROOT_IN_USE",
      });
    }
  });

  it.each([0, 20_000])("does not follow metadata symlinks (extra bytes: %s)", (padding) => {
    const lease = own(namespace());
    const metadata = readHostOwnerRecord(lease.paths);
    const target = `${lease.paths.ownerRecordPath}.target`;
    writeFileSync(target, JSON.stringify({ ...metadata, padding: "x".repeat(padding) }));
    rmSync(lease.paths.ownerRecordPath);
    symlinkSync(target, lease.paths.ownerRecordPath, "file");
    expect(readHostOwnerRecord(lease.paths)).toBeNull();
  });

  it("keeps ownership while an import replaces the data directory", async () => {
    const profile = namespace();
    const lease = own(profile);
    mkdirSync(lease.paths.dataRoot);
    renameSync(lease.paths.dataRoot, `${lease.paths.dataRoot}.backup`);
    mkdirSync(lease.paths.dataRoot);
    expect((await contender(profile, "headless")).result).toMatchObject({
      status: "refused",
      code: "HOST_ROOT_IN_USE",
    });
  });

  it("recovers after owner death without unlinking the lease or trusting its PID", async () => {
    const profile = namespace();
    const first = await contender(profile, "desktop");
    expect(first.result.status).toBe("owned");
    const exited = once(first.child, "exit");
    first.child.kill("SIGKILL");
    await exited;
    const lease = own(profile, "headless");
    expect(lease.generation).not.toBe(first.result.generation);
    expect(readHostOwnerRecord(lease.paths)?.generation).toBe(lease.generation);
  });

  it("does not let an old generation release or initialize a replacement owner", () => {
    const profile = namespace();
    const first = own(profile);
    first.release();
    const second = own(profile);
    first.release();
    expect(() => first.assertActive()).toThrow(/no longer active/u);
    expect(() => second.assertActive(first.generation)).toThrow(/no longer active/u);
    expect(readHostOwnerRecord(second.paths)?.generation).toBe(second.generation);
    expect(() => own(profile)).toThrow(HostRootInUseError);
  });

  it("keeps its kernel lock after a duplicate acquisition in the same process", async () => {
    const profile = namespace();
    const lease = own(profile);
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(() => own(profile)).toThrow(HostRootInUseError);
      expect((await contender(profile, "headless")).result).toMatchObject({
        status: "refused",
        code: "HOST_ROOT_IN_USE",
      });
    }
    lease.assertActive();
  });

  it("does not overwrite an unsupported future lease format", () => {
    const profile = namespace();
    const paths = resolveHostRootPaths(profile);
    const database = new Database(paths.leasePath);
    database.pragma("user_version = 2");
    database.close();
    expect(() => own(profile)).toThrow(/unsupported format/u);
    const unchanged = new Database(paths.leasePath, { readonly: true });
    try {
      expect(unchanged.pragma("user_version", { simple: true })).toBe(2);
    } finally {
      unchanged.close();
    }
  });

  it("allows independent namespaces and leaves discovery metadata after release", () => {
    const first = own(namespace());
    const second = own(namespace(), "headless");
    first.setPhase("ready");
    first.release();
    expect(JSON.parse(readFileSync(first.paths.ownerRecordPath, "utf8"))).toMatchObject({
      phase: "stopped",
    });
    expect(readHostOwnerRecord(second.paths)?.phase).toBe("preparing");
  });
});
