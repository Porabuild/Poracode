import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import { assertServiceProfileAvailable } from "./cliServiceProfileAdmission";
import { serviceRegistrationId } from "./serverServiceRegistration";
import { HostOwnerLease } from "@/backend/ownership/hostOwnerLease";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { prepareOwnedHostRoot } from "@/backend/ownership/hostRootManifest";
import { writeHostCredentialState } from "@/backend/ownership/hostCredentialState";

function fakeDoctor(
  home: string,
  checks: readonly unknown[] = [{ name: "fixture", status: "ok" }],
) {
  const candidate = join(home, "candidate");
  mkdirSync(join(candidate, "lib"), { recursive: true });
  writeFileSync(
    join(candidate, "lib", "server.cjs"),
    `console.log(JSON.stringify(${JSON.stringify({ checks, migrations: { latestSchemaVersion: 71, registry: [{ version: 71, name: "fixture", rollback: "forward-only" }] } })}));`,
  );
  return candidate;
}

describe("service destination profile admission", () => {
  it("accepts a free profile but refuses an owner or existing native definition", async () => {
    const home = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-profile-admission-")));
    try {
      const profile = join(home, ".poracode-nightly");
      const account = { kind: "uid" as const, id: "1000" };
      const candidate = fakeDoctor(home);
      const deps = {
        platform: "linux" as const,
        home,
        uid: () => 1000,
        probe: async () => null,
        lease: () => ({ state: "free" as const, detail: "fixture" }),
        run: () => "LoadState=not-found\n",
      };
      const lease = await assertServiceProfileAvailable(profile, account, candidate, deps);
      lease.release();
      await expect(
        assertServiceProfileAvailable(profile, account, candidate, {
          ...deps,
          probe: async () => ({}) as never,
        }),
      ).rejects.toThrow(/in use/u);
      const directory = join(home, ".config", "systemd", "user");
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        join(
          directory,
          `${serviceRegistrationId(resolveHostRootPaths(profile).profileNamespace, account)}.service`,
        ),
        "foreign",
      );
      const unexpected = await assertServiceProfileAvailable(
        profile,
        account,
        candidate,
        deps,
      ).then(
        (result) => {
          result.release();
          return null;
        },
        (error: unknown) => error,
      );
      expect(unexpected).toBeInstanceOf(Error);
      expect(String(unexpected)).toMatch(/already exists/u);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("refuses a legacy desktop profile and an OS-sealed owned profile before migration", async () => {
    const home = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-profile-desktop-")));
    try {
      const account = { kind: "uid" as const, id: "1000" };
      const candidate = fakeDoctor(home);
      const deps = {
        platform: "linux" as const,
        home,
        uid: () => 1000,
        probe: async () => null,
        lease: () => ({ state: "free" as const, detail: "fixture" }),
        run: () => "LoadState=not-found\n",
      };
      const legacy = join(home, "legacy");
      mkdirSync(legacy);
      writeFileSync(join(legacy, "state.sqlite"), "desktop data");
      await expect(assertServiceProfileAvailable(legacy, account, candidate, deps)).rejects.toThrow(
        /offline backup import/u,
      );
      const profile = join(home, "sealed");
      const paths = resolveHostRootPaths(profile);
      const lease = HostOwnerLease.acquire(paths, "desktop");
      prepareOwnedHostRoot(lease);
      writeHostCredentialState(lease, "os-sealed", Buffer.alloc(32, 3).toString("base64"));
      lease.release();
      await expect(
        assertServiceProfileAvailable(profile, account, candidate, deps),
      ).rejects.toThrow(/explicit activation/u);
      expect(readFileSync(join(legacy, "state.sqlite"), "utf8")).toBe("desktop data");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("refuses both a pending migration and a newer schema in existing nightly data", async () => {
    const home = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-profile-schema-")));
    try {
      const profile = join(home, "nightly");
      const paths = resolveHostRootPaths(profile);
      const lease = HostOwnerLease.acquire(paths, "headless");
      prepareOwnedHostRoot(lease);
      const key = Buffer.alloc(32, 7).toString("base64");
      writeFileSync(join(paths.dataRoot, "secret-key.headless"), key);
      writeHostCredentialState(lease, "headless-file", key);
      lease.release();
      const db = new Database(join(paths.dataRoot, "state.sqlite"));
      db.exec("CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT)");
      db.prepare("INSERT INTO app_state VALUES ('schema_version', ?)").run("70");
      db.close();
      const candidate = fakeDoctor(home);
      const account = { kind: "uid" as const, id: "1000" };
      const deps = {
        platform: "linux" as const,
        home,
        uid: () => 1000,
        probe: async () => null,
        lease: () => ({ state: "free" as const, detail: "fixture" }),
        run: () => "LoadState=not-found\n",
      };
      await expect(
        assertServiceProfileAvailable(profile, account, candidate, deps),
      ).rejects.toThrow(/explicit backup and upgrade/u);
      const updated = new Database(join(paths.dataRoot, "state.sqlite"));
      updated.prepare("UPDATE app_state SET value='72' WHERE key='schema_version'").run();
      updated.close();
      await expect(
        assertServiceProfileAvailable(profile, account, candidate, deps),
      ).rejects.toThrow(/explicit backup and upgrade/u);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("refuses invalid destination configuration or candidate diagnostics before service retirement", async () => {
    const home = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-profile-config-")));
    try {
      const profile = join(home, "nightly");
      const account = { kind: "uid" as const, id: "1000" };
      const deps = {
        platform: "linux" as const,
        home,
        uid: () => 1000,
        probe: async () => null,
        lease: () => ({ state: "free" as const, detail: "fixture" }),
        run: () => "LoadState=not-found\n",
      };
      const candidate = fakeDoctor(home);
      writeFileSync(`${profile}.server.json`, "{invalid");
      await expect(
        assertServiceProfileAvailable(profile, account, candidate, deps),
      ).rejects.toThrow(/not valid JSON/u);
      writeFileSync(`${profile}.server.json`, "{}");
      fakeDoctor(home, [{ name: "fixture", status: "error" }]);
      await expect(
        assertServiceProfileAvailable(profile, account, candidate, deps),
      ).rejects.toThrow(/failed candidate diagnostics/u);
      fakeDoctor(home, [{}]);
      await expect(
        assertServiceProfileAvailable(profile, account, candidate, deps),
      ).rejects.toThrow(/failed candidate diagnostics/u);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("checks the systemd manager's inherited network environment", async () => {
    const home = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-profile-manager-env-")));
    try {
      const profile = join(home, "nightly");
      const candidate = fakeDoctor(home);
      const account = { kind: "uid" as const, id: "1000" };
      const deps = {
        platform: "linux" as const,
        home,
        uid: () => 1000,
        probe: async () => null,
        lease: () => ({ state: "free" as const, detail: "fixture" }),
        run: (args: readonly string[]) =>
          args[0] === "show-environment"
            ? "PORACODE_REMOTE_BIND_MODE=lan\n"
            : "LoadState=not-found\n",
      };
      await expect(
        assertServiceProfileAvailable(profile, account, candidate, deps),
      ).rejects.toThrow(/LAN exposure/u);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("requires the systemd manager's matching key for environment-backed credentials", async () => {
    const home = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-profile-env-key-")));
    try {
      const profile = join(home, "nightly");
      const paths = resolveHostRootPaths(profile);
      const key = Buffer.alloc(32, 7).toString("base64");
      const owner = HostOwnerLease.acquire(paths, "headless");
      prepareOwnedHostRoot(owner);
      writeHostCredentialState(owner, "headless-environment", key);
      owner.release();
      const candidate = fakeDoctor(home);
      const account = { kind: "uid" as const, id: "1000" };
      const deps = {
        platform: "linux" as const,
        home,
        uid: () => 1000,
        probe: async () => null,
        lease: () => ({ state: "free" as const, detail: "fixture" }),
        run: (args: readonly string[]) =>
          args[0] === "show-environment"
            ? `PORACODE_SECRET_STORAGE_KEY=${key}\n`
            : "LoadState=not-found\n",
      };
      const reservation = await assertServiceProfileAvailable(profile, account, candidate, deps);
      reservation.release();
      await expect(
        assertServiceProfileAvailable(profile, account, candidate, {
          ...deps,
          run: (args) => (args[0] === "show-environment" ? "" : "LoadState=not-found\n"),
        }),
      ).rejects.toThrow(/requires its environment credential key/u);
      await expect(
        assertServiceProfileAvailable(profile, account, candidate, {
          ...deps,
          run: (args) =>
            args[0] === "show-environment"
              ? `PORACODE_SECRET_STORAGE_KEY=${Buffer.alloc(32, 8).toString("base64")}\n`
              : "LoadState=not-found\n",
        }),
      ).rejects.toThrow(/does not match/u);
      writeFileSync(join(paths.dataRoot, "secret-key.headless"), key);
      await expect(
        assertServiceProfileAvailable(profile, account, candidate, deps),
      ).rejects.toThrow(/without stored key files/u);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("does not treat the invoking Windows shell's key as the task environment", async () => {
    const home = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-profile-win-env-")));
    try {
      const profile = join(home, "nightly");
      const paths = resolveHostRootPaths(profile);
      const key = Buffer.alloc(32, 7).toString("base64");
      const owner = HostOwnerLease.acquire(paths, "headless");
      prepareOwnedHostRoot(owner);
      writeHostCredentialState(owner, "headless-environment", key);
      owner.release();
      vi.stubEnv("PORACODE_SECRET_STORAGE_KEY", key);
      const account = { kind: "sid" as const, id: "S-1-5-21-1-2-3-1001" };
      const deps = {
        platform: "win32" as const,
        probe: async () => null,
        lease: () => ({ state: "free" as const, detail: "fixture" }),
        windowsRun: () => ({ version: 1 as const, account: { sid: account.id, home }, task: null }),
      };
      await expect(
        assertServiceProfileAvailable(profile, account, fakeDoctor(home), deps),
      ).rejects.toThrow(/Windows task environment cannot be verified/u);
    } finally {
      vi.unstubAllEnvs();
      rmSync(home, { recursive: true, force: true });
    }
  });
});
