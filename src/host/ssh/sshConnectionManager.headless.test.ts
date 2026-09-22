import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultSharedSettings } from "@/shared/settings";
import { composeHostServices } from "@/host/hostServices/composeHostServices";
import { SshConnectionManager } from "./SshConnectionManager";
import type { SshEnvironmentController } from "./sshEnvironmentController";

const tempDirs: string[] = [];

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function createBaseDir(): string {
  const root = mkdtempSync(join(tmpdir(), "poracode-ssh-headless-"));
  tempDirs.push(root);
  return root;
}

describe("headless/backend SSH composition parity", () => {
  it("keeps the host-owned manager reusable in the shared composition", async () => {
    const baseDir = createBaseDir();
    const services = composeHostServices({
      baseDir,
      getSharedSettings: () => defaultSharedSettings,
      ssh: {
        mainBundleDir: join(baseDir, "main"),
        agentPluginsDir: join(baseDir, "agent-plugins"),
        wslHelpersDir: join(baseDir, "wsl-helpers"),
      },
      computerUse: null,
      nativeSecrets: false,
      portForward: true,
      autoUpdate: false,
      osNotifications: false,
    });
    try {
      expect(services.capabilities.ssh).toBe(true);
      const manager = services.sshConnectionManager;
      expect(manager).toBeInstanceOf(SshConnectionManager);
      // The in-process manager is the same controller surface the desktop
      // supervisor implements, so callers cannot tell the two compositions apart.
      const controller: SshEnvironmentController = manager!;
      expect(typeof controller.connect).toBe("function");
      expect(typeof controller.disconnect).toBe("function");
      const hosts = await controller.discoverHosts();
      expect(Array.isArray(hosts)).toBe(true);
      await controller.dispose();
    } finally {
      await services.dispose();
    }
  });

  it("declares ssh: false when the host composes no SSH inputs", async () => {
    const baseDir = createBaseDir();
    const services = composeHostServices({
      baseDir,
      getSharedSettings: () => defaultSharedSettings,
      ssh: null,
      computerUse: null,
      nativeSecrets: false,
      portForward: true,
      autoUpdate: false,
      osNotifications: false,
    });
    try {
      expect(services.sshConnectionManager).toBeNull();
      expect(services.capabilities.ssh).toBe(false);
    } finally {
      await services.dispose();
    }
  });
});
