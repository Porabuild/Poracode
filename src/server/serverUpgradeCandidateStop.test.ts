import { describe, expect, it, vi } from "vitest";
import type { HostRootPaths } from "@/backend/ownership/hostRootPaths";
import { stopUpgradeCandidate } from "./serverUpgradeCandidateStop";
import type { UpgradeCandidateHandle } from "./serverUpgradeContract";
import type { RunningOwnerProbe } from "./serverUpgradeIdentity";

const paths = { profileNamespace: "/p", dataRoot: "/p.host-v1" } as HostRootPaths;
const probe = { generation: "g", pid: 1 } as RunningOwnerProbe;

function setup(platform: NodeJS.Platform, childAlive: boolean) {
  const order: string[] = [];
  const child = {
    exitCode: childAlive ? null : 0,
    kill: vi.fn<() => void>(() => {
      order.push("kill");
      child.exitCode = 0;
    }),
  };
  const handle = {
    child,
    target: { kind: "direct", unit: null },
  } as unknown as UpgradeCandidateHandle;
  const deps = {
    platform,
    paths: () => paths,
    probeOwner: vi.fn<() => Promise<RunningOwnerProbe>>(async () => probe),
    stopOwner: vi.fn<() => Promise<void>>(async () => {
      order.push("owner");
      if (platform === "win32") child.exitCode = 0;
    }),
    sleep: async () => undefined,
  };
  return { order, child, handle, deps };
}

describe("stopUpgradeCandidate", () => {
  it("on win32 stops through the authenticated owner first and skips the kill once it exited", async () => {
    const { order, child, handle, deps } = setup("win32", true);
    await stopUpgradeCandidate(handle, deps);
    expect(order).toEqual(["owner"]);
    expect(child.kill).not.toHaveBeenCalled();
  });

  it("on win32 still terminates a child that survived the owner stop", async () => {
    const { order, child, handle, deps } = setup("win32", true);
    deps.stopOwner.mockImplementation(async () => {
      order.push("owner");
    });
    await stopUpgradeCandidate(handle, deps);
    expect(order).toEqual(["owner", "kill"]);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("on POSIX keeps the signal first, then the authenticated owner stop", async () => {
    const { order, handle, deps } = setup("linux", true);
    await stopUpgradeCandidate(handle, deps);
    expect(order).toEqual(["kill", "owner"]);
  });

  it("swallows a failing owner stop and tolerates a missing handle", async () => {
    const { handle, deps } = setup("win32", false);
    deps.probeOwner.mockRejectedValue(new Error("unreachable"));
    await expect(stopUpgradeCandidate(handle, deps)).resolves.toBeUndefined();
    await expect(stopUpgradeCandidate(null, deps)).resolves.toBeUndefined();
  });
});
