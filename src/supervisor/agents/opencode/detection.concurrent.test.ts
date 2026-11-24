import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import type { DetectProbeCtx } from "../base";

const acquireOpenCodeServer = vi.hoisted(() =>
  vi.fn<(input: { projectLocation: ProjectLocation }) => Promise<never>>(),
);

vi.mock("./client", () => ({
  listOpenCodeLegacyOAuthCredentials: vi
    .fn<typeof import("./client").listOpenCodeLegacyOAuthCredentials>()
    .mockResolvedValue([]),
  acquireOpenCodeServer,
  resolveOpenCodeSessionDirectory: (location: ProjectLocation) =>
    location.kind === "wsl" ? location.linuxPath : location.path,
}));

import { openCodeDetectionSpec } from "./detection";

function probeContext(location: ProjectLocation): DetectProbeCtx {
  return {
    location,
    executablePath: "opencode",
    version: "2.4.1",
  };
}

beforeEach(() => {
  acquireOpenCodeServer.mockReset().mockRejectedValue(new Error("probe closed"));
});

describe("OpenCode detection probe sharing", () => {
  it("shares one pooled sidecar across concurrent detections of the same target", async () => {
    const location: ProjectLocation = { kind: "posix", path: "/same-target" };

    await Promise.all([
      openCodeDetectionSpec.capabilitiesProbe?.(probeContext(location)),
      openCodeDetectionSpec.capabilitiesProbe?.(probeContext(location)),
    ]);

    expect(acquireOpenCodeServer).toHaveBeenCalledOnce();
  });

  it("does not share pending work between different detection targets", async () => {
    await Promise.all([
      openCodeDetectionSpec.capabilitiesProbe?.(probeContext({ kind: "posix", path: "/first" })),
      openCodeDetectionSpec.capabilitiesProbe?.(probeContext({ kind: "posix", path: "/second" })),
    ]);

    expect(acquireOpenCodeServer).toHaveBeenCalledTimes(2);
  });

  it("keeps the default capabilities when the probe fails", async () => {
    const result = await openCodeDetectionSpec.capabilitiesProbe?.(
      probeContext({ kind: "posix", path: "/failing" }),
    );

    // `undefined` means "no capability override", so the spec defaults win.
    expect(result).toBeUndefined();
    expect(acquireOpenCodeServer).toHaveBeenCalledOnce();
  });

  it("does not launch an incompatible pre-permissions beta", async () => {
    await openCodeDetectionSpec.capabilitiesProbe?.({
      ...probeContext({ kind: "posix", path: "/old" }),
      version: "0.0.0-beta-19425",
    });
    expect(acquireOpenCodeServer).not.toHaveBeenCalled();
  });

  it("skips the probe when no executable was resolved", async () => {
    const result = await openCodeDetectionSpec.capabilitiesProbe?.({
      location: { kind: "posix", path: "/missing" },
      executablePath: undefined,
    });

    expect(result).toBeUndefined();
    expect(acquireOpenCodeServer).not.toHaveBeenCalled();
  });
});
