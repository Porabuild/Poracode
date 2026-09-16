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

  it("hands the data-custody fence resolved from the desktop root mapping to the child", async () => {
    const root = await baseDir();
    const payload = buildDesktopBackendInitialize({
      baseDir: root,
      dbPath: join(root, "state.sqlite"),
      channel: "stable",
      settingsPath: join(root, "settings.json"),
      devServerUrl: undefined,
      supervisor: {
        appVersion: "1.0.0",
        isDev: false,
        supervisorPath: join(root, "supervisor.cjs"),
        wslHelpersDir: join(root, "wsl"),
        secretStorageKey: "fixture",
      },
    });
    // The child acquires this fence before opening SQLite (BackendHostCore);
    // dropping the field would silently disable data custody in production.
    expect(payload.desktop?.dataFencePath).toBe(resolveDesktopHostRootPaths(root).dataFencePath);
    expect(payload.desktop?.dataFencePath).toMatch(/\.host-data\.sqlite$/u);
    expect(payload.desktop?.settingsPath).toBe(join(root, "settings.json"));
    expect(payload.desktop?.channel).toBe("stable");
    expect(payload.baseDir).toBe(root);
    expect(payload.dbPath).toBe(join(root, "state.sqlite"));
    expect(payload.supervisor.secretStorageKey).toBe("fixture");
  });

  it("carries the dev server URL only when one is set", async () => {
    const root = await baseDir();
    const base = {
      baseDir: root,
      dbPath: join(root, "state.sqlite"),
      channel: "nightly" as const,
      settingsPath: join(root, "settings.json"),
      supervisor: {
        appVersion: "1.0.0",
        isDev: true,
        supervisorPath: join(root, "supervisor.cjs"),
        wslHelpersDir: join(root, "wsl"),
        secretStorageKey: "fixture",
      },
    };
    expect(buildDesktopBackendInitialize({ ...base, devServerUrl: undefined }).desktop).toEqual({
      channel: "nightly",
      settingsPath: join(root, "settings.json"),
      dataFencePath: resolveDesktopHostRootPaths(root).dataFencePath,
    });
    expect(
      buildDesktopBackendInitialize({ ...base, devServerUrl: "http://localhost:5173" }).desktop,
    ).toMatchObject({ devServerUrl: "http://localhost:5173" });
  });
});
