import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import type { HostBuildIdentity, HostDescription } from "@/shared/hostControlProtocol";
import { RunningOwnerRefusedError } from "./serverUpgradeIdentity";
import { ensureCliOwner, type EnsureCliOwnerOptions } from "./cliOwner";
import { serverLogFilePath } from "./serverLogFile";

const status = {
  requestId: "request",
  ownerGeneration: "generation",
  description: {} as HostDescription,
};

function child() {
  return Object.assign(new EventEmitter(), {
    unref: vi.fn<() => void>(),
  }) as unknown as ChildProcess;
}

type OwnerSpawner = NonNullable<EnsureCliOwnerOptions["spawn"]>;
type OwnerStatusProbe = NonNullable<EnsureCliOwnerOptions["statusProbe"]>;

const capturedBuild: HostBuildIdentity = {
  version: "1.2.3",
  sourceRevision: null,
  root: "C:/Poracode",
  layoutKind: "prefix",
  entrypointSha256: "a".repeat(64),
};

describe("CLI background owner resolution", () => {
  it("uses an existing owner without spawning", async () => {
    const profile = await mkdtemp(join(tmpdir(), "poracode-cli-owner-"));
    try {
      const spawn = vi.fn<OwnerSpawner>(() => child());
      const result = await ensureCliOwner(profile, {
        statusProbe: async () => status,
        spawn,
      });
      expect(result).toBe(status);
      expect(spawn).not.toHaveBeenCalled();
    } finally {
      await rm(profile, { recursive: true, force: true });
    }
  });

  it("starts the same CLI entry detached, forwards an explicit base directory, and polls", async () => {
    const profile = await mkdtemp(join(tmpdir(), "poracode-cli-owner-"));
    const env = { PORACODE_BASE_DIR: profile };
    const processChild = child();
    let currentTime = 0;
    let probes = 0;
    const statusProbe = vi.fn<OwnerStatusProbe>(async () => {
      probes += 1;
      if (probes < 3) throw new Error("owner not ready");
      return status;
    });
    const spawn = vi.fn<OwnerSpawner>(() => processChild);
    const sleep = vi.fn<(milliseconds: number) => Promise<void>>(async (milliseconds) => {
      currentTime += milliseconds;
    });
    const writeStderr = vi.fn<(text: string) => void>();
    try {
      await ensureCliOwner(profile, {
        baseDir: profile,
        env,
        execPath: "node-fixture",
        execArgv: ["--conditions=fixture"],
        entrypoint: "server.cjs",
        now: () => currentTime,
        ownerProbe: async () => null,
        pollIntervalMs: 250,
        sleep,
        spawn,
        statusProbe,
        writeStderr,
      });

      expect(spawn).toHaveBeenCalledExactlyOnceWith(
        "node-fixture",
        ["--conditions=fixture", "server.cjs", "serve", "--base-dir", profile],
        { detached: true, env, stdio: "ignore", windowsHide: true },
      );
      expect(processChild.unref).toHaveBeenCalledOnce();
      expect(writeStderr).toHaveBeenCalledExactlyOnceWith("Starting Poracode background server:\n");
      expect(statusProbe).toHaveBeenCalledTimes(3);
      expect(sleep).toHaveBeenCalledExactlyOnceWith(250);
    } finally {
      await rm(profile, { recursive: true, force: true });
    }
  });

  it("reports a startup timeout with the owned server log path and doctor guidance", async () => {
    const profile = await mkdtemp(join(tmpdir(), "poracode-cli-owner-"));
    const spawn = vi.fn<OwnerSpawner>(() => child());
    let currentTime = 0;
    try {
      await expect(
        ensureCliOwner(profile, {
          ownerProbe: async () => null,
          spawn,
          statusProbe: async () => {
            throw new Error("owner not ready");
          },
          now: () => currentTime,
          sleep: async (milliseconds) => {
            currentTime += milliseconds;
          },
          pollIntervalMs: 250,
          timeoutMs: 500,
        }),
      ).rejects.toThrow(
        `${serverLogFilePath(resolveHostRootPaths(profile).dataRoot)} and run poracode doctor`,
      );
      expect(spawn).toHaveBeenCalledOnce();
    } finally {
      await rm(profile, { recursive: true, force: true });
    }
  });

  it("preserves owner refusals and only re-invokes a captured desktop bootstrap safely", async () => {
    const profile = await mkdtemp(join(tmpdir(), "poracode-cli-owner-"));
    const refusedSpawn = vi.fn<OwnerSpawner>(() => child());
    try {
      await expect(
        ensureCliOwner(profile, {
          statusProbe: async () => {
            throw new RunningOwnerRefusedError("owner is upgrading");
          },
          spawn: refusedSpawn,
        }),
      ).rejects.toThrow("owner is upgrading");
      expect(refusedSpawn).not.toHaveBeenCalled();

      await expect(
        ensureCliOwner(profile, {
          capturedBuild,
          ownerProbe: async () => null,
          statusProbe: async () => {
            throw new Error("owner absent");
          },
          spawn: refusedSpawn,
          entrypoint: "server.cjs",
          env: {},
        }),
      ).rejects.toThrow("cannot safely re-invoke its captured bootstrap");
      expect(refusedSpawn).not.toHaveBeenCalled();

      const processChild = child();
      const spawn = vi.fn<OwnerSpawner>(() => processChild);
      let probes = 0;
      await ensureCliOwner(profile, {
        capturedBuild,
        ownerProbe: async () => null,
        statusProbe: async () => {
          probes += 1;
          if (probes === 1) throw new Error("owner absent");
          return status;
        },
        entrypoint: join(profile, "resources", "desktop-cli", "bootstrap.mjs"),
        execPath: "electron",
        execArgv: ["--no-sandbox"],
        env: { ELECTRON_RUN_AS_NODE: "1", PORACODE_BASE_DIR: profile },
        spawn,
        writeStderr: () => undefined,
      });
      expect(spawn.mock.calls[0]).toMatchObject([
        "electron",
        ["--no-sandbox", join(profile, "resources", "desktop-cli", "bootstrap.mjs"), "serve"],
        { detached: true, stdio: "ignore", windowsHide: true },
      ]);
    } finally {
      await rm(profile, { recursive: true, force: true });
    }
  });
});
