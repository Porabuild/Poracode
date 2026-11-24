import { afterEach, describe, expect, it, vi } from "vitest";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";

const localBridge = vi.hoisted(() => ({
  platform: "win32",
  scanSkills: vi.fn<() => Promise<{ skills: never[]; canLinkToGlobal: boolean }>>(async () => ({
    skills: [],
    canLinkToGlobal: true,
  })),
  setSkillEnabled: vi.fn<() => Promise<void>>(async () => undefined),
  deleteSkill: vi.fn<() => Promise<void>>(async () => undefined),
  importSkills: vi.fn<() => Promise<{ imported: never[]; skipped: never[] }>>(async () => ({
    imported: [],
    skipped: [],
  })),
  listSkillMarketplace: vi.fn<() => Promise<{ marketplace: string; skills: never[] }>>(
    async () => ({ marketplace: "skills-sh", skills: [] }),
  ),
  installMarketplaceSkill: vi.fn<() => Promise<{ installedPath: string }>>(async () => ({
    installedPath: "/tmp/skill",
  })),
  readExternalFile: vi.fn<() => Promise<{ status: "ready"; content: string }>>(async () => ({
    status: "ready" as const,
    content: "local",
  })),
  writeExternalFile: vi.fn<() => Promise<{ modifiedAtMs: number }>>(async () => ({
    modifiedAtMs: 1,
  })),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => localBridge,
}));

import {
  deleteSkillForHost,
  resolveSkillHostPlatform,
  scanSkillsForHost,
  setSkillEnabledForHost,
} from "./skillHostBridge";

const originalWithClient = useRemoteServersStore.getState().withClient;

afterEach(() => {
  vi.clearAllMocks();
  useRemoteServersStore.setState({ withClient: originalWithClient });
});

describe("skillHostBridge", () => {
  it("routes skill procedures to the paired remote host when connectionKey is set", async () => {
    const callRemoteProcedure = vi.fn<
      (
        procedure: string,
        payload: unknown,
      ) => Promise<{ skills: never[]; canLinkToGlobal: boolean }>
    >(async () => ({ skills: [], canLinkToGlobal: false }));
    useRemoteServersStore.setState({
      withClient: async (key, fn) => {
        expect(key).toBe("remote-mac");
        return fn({ callRemoteProcedure } as unknown as RemoteDesktopClient);
      },
    });

    const projectLocation = {
      kind: "posix" as const,
      path: "/Users/dev/app",
      remoteServerId: "remote-mac",
    };
    await scanSkillsForHost("remote-mac", { projectLocation });
    await setSkillEnabledForHost("remote-mac", {
      absolutePath: "/Users/dev/.agents/skills/review",
      enabled: false,
      projectLocation,
    });
    await deleteSkillForHost("remote-mac", {
      absolutePath: "/Users/dev/.agents/skills/review",
      projectLocation,
    });

    // Host procedures receive host-local coordinates; the mirrored project's
    // `remoteServerId` must not reach the owning host.
    expect(callRemoteProcedure).toHaveBeenCalledWith("scanSkills", {
      projectLocation: { kind: "posix", path: "/Users/dev/app" },
    });
    expect(callRemoteProcedure).toHaveBeenCalledWith("setSkillEnabled", {
      absolutePath: "/Users/dev/.agents/skills/review",
      enabled: false,
      projectLocation: { kind: "posix", path: "/Users/dev/app" },
    });
    expect(callRemoteProcedure).toHaveBeenCalledWith("deleteSkill", {
      absolutePath: "/Users/dev/.agents/skills/review",
      projectLocation: { kind: "posix", path: "/Users/dev/app" },
    });
    expect(localBridge.scanSkills).not.toHaveBeenCalled();
    expect(localBridge.setSkillEnabled).not.toHaveBeenCalled();
    expect(localBridge.deleteSkill).not.toHaveBeenCalled();
  });

  it("uses local readBridge when connectionKey is omitted", async () => {
    await scanSkillsForHost(undefined, {});
    expect(localBridge.scanSkills).toHaveBeenCalledWith({});
    expect(resolveSkillHostPlatform("darwin")).toBe("darwin");
    expect(resolveSkillHostPlatform(undefined)).toBe("win32");
  });
});
