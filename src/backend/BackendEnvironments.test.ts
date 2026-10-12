import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import type { BackendHostInitializePayload } from "@/shared/backendHostProtocol";
import { HostDataFence } from "./ownership/hostDataFence";
import { composeBackendEnvironments } from "./BackendEnvironments";

function payload(root: string): BackendHostInitializePayload {
  return {
    baseDir: root,
    dbPath: join(root, "state.sqlite"),
    supervisor: {
      appVersion: "test",
      isDev: true,
      supervisorPath: join(root, "supervisor.cjs"),
      wslHelpersDir: join(root, "wsl"),
      secretStorageKey: "fixture",
    },
    desktop: {
      channel: "stable",
      settingsPath: join(root, "settings.json"),
      environmentAssets: { agentPluginsDir: join(root, "plugins") },
    },
  };
}

it("keeps an older initialize payload without environment assets compatible", async () => {
  const initialize = payload("/unused");
  delete initialize.desktop!.environmentAssets;
  const getDataCustody = vi.fn<() => null>(() => null);
  expect(await composeBackendEnvironments(initialize, { getDataCustody })).toBeNull();
  expect(getDataCustody).not.toHaveBeenCalled();
});

it("refuses declared host environment assets without actual root custody", async () => {
  await expect(
    composeBackendEnvironments(payload("/unused"), {
      getDataCustody: () => null,
    }),
  ).rejects.toThrow("data fence");
});

it("uses the existing data fence and never acquires or releases a second root owner", async () => {
  const root = await mkdtemp(join(tmpdir(), "poracode-backend-environments-"));
  const fencePath = join(root, "custody.sqlite");
  const fence = HostDataFence.acquire(fencePath);
  let composition: Awaited<ReturnType<typeof composeBackendEnvironments>> = null;
  try {
    composition = await composeBackendEnvironments(payload(root), { getDataCustody: () => fence });
    expect(composition?.ownsSshManager).toBe(true);
    expect(composition?.runtimeService.listPublic()).toEqual([]);
    await composition?.dispose();
    // Environment disposal joins its resources; only Core may release custody.
    expect(() => fence.assertActive(fence.generation)).not.toThrow();
    expect(() => HostDataFence.acquire(fencePath)).toThrow("held by the backend");
  } finally {
    await composition?.dispose();
    fence.release();
    await rm(root, { recursive: true, force: true });
  }
});
