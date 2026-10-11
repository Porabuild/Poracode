import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildDesktopBackendInitialize } from "./desktopBackendInitialize";
import { resolveDesktopHostRootPaths } from "@/backend/ownership/hostRootPaths";

describe("buildDesktopBackendInitialize", () => {
  const cleanup: Promise<unknown>[] = [];
  afterEach(() => Promise.allSettled(cleanup.splice(0)));

  async function baseDir(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "poracode-backend-init-"));
    cleanup.push(rm(root, { recursive: true, force: true }));
    return root;
  }

  it("hands the admission lease's data-custody fence to the child verbatim", async () => {
    const root = await baseDir();
    // Since the data-root unification the prepared baseDir is the OWNED
    // `.host-v1` root; the fence path comes from the lease's canonical
    // mapping, passed explicitly instead of re-derived (re-deriving refuses
    // literal owned-root inputs by design — the nesting guard).
    const leasePaths = resolveDesktopHostRootPaths(root);
    const payload = buildDesktopBackendInitialize({
      baseDir: leasePaths.dataRoot,
      dbPath: join(leasePaths.dataRoot, "state.sqlite"),
      channel: "stable",
      settingsPath: join(leasePaths.dataRoot, "settings.json"),
      devServerUrl: undefined,
      dataFencePath: leasePaths.dataFencePath,
      environmentAssets: {
        agentPluginsDir: "/assets/agent-plugins",
        preassembledArchiveDir: "/assets/ssh-runtime-archive",
      },
      supervisor: {
        appVersion: "1.0.0",
        isDev: false,
        supervisorPath: join(leasePaths.dataRoot, "supervisor.cjs"),
        wslHelpersDir: join(leasePaths.dataRoot, "wsl"),
        secretStorageKey: "fixture",
      },
    });
    // The child acquires this fence before opening SQLite (BackendHostCore);
    // dropping the field would silently disable data custody in production.
    expect(payload.desktop?.dataFencePath).toBe(leasePaths.dataFencePath);
    expect(payload.desktop?.dataFencePath).toMatch(/\.host-data\.sqlite$/u);
    expect(payload.desktop?.settingsPath).toBe(join(leasePaths.dataRoot, "settings.json"));
    expect(payload.desktop?.channel).toBe("stable");
    expect(payload.baseDir).toBe(leasePaths.dataRoot);
    expect(payload.dbPath).toBe(join(leasePaths.dataRoot, "state.sqlite"));
    expect(payload.supervisor.secretStorageKey).toBe("fixture");
    expect(payload.desktop?.environmentAssets).toEqual({
      agentPluginsDir: "/assets/agent-plugins",
      preassembledArchiveDir: "/assets/ssh-runtime-archive",
    });
  });

  it("carries the dev server URL only when one is set", async () => {
    const root = await baseDir();
    const leasePaths = resolveDesktopHostRootPaths(root);
    const base = {
      baseDir: leasePaths.dataRoot,
      dbPath: join(leasePaths.dataRoot, "state.sqlite"),
      channel: "nightly" as const,
      settingsPath: join(leasePaths.dataRoot, "settings.json"),
      dataFencePath: leasePaths.dataFencePath,
      supervisor: {
        appVersion: "1.0.0",
        isDev: true,
        supervisorPath: join(leasePaths.dataRoot, "supervisor.cjs"),
        wslHelpersDir: join(leasePaths.dataRoot, "wsl"),
        secretStorageKey: "fixture",
      },
    };
    expect(buildDesktopBackendInitialize({ ...base, devServerUrl: undefined }).desktop).toEqual({
      channel: "nightly",
      settingsPath: join(leasePaths.dataRoot, "settings.json"),
      dataFencePath: leasePaths.dataFencePath,
    });
    expect(
      buildDesktopBackendInitialize({ ...base, devServerUrl: "http://localhost:5173" }).desktop,
    ).toMatchObject({ devServerUrl: "http://localhost:5173" });
  });
});
