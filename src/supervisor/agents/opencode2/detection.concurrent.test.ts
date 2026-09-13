import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import type { DetectProbeCtx } from "../base";

const acquireOpenCode2Server = vi.hoisted(() =>
  vi.fn<(input: { projectLocation: ProjectLocation }) => Promise<never>>(),
);

vi.mock("./client", () => ({
  acquireOpenCode2Server,
  resolveOpenCode2SessionDirectory: (location: ProjectLocation) =>
    location.kind === "wsl" ? location.linuxPath : location.path,
}));

import { openCode2DetectionSpec } from "./detection";

function probeContext(location: ProjectLocation): DetectProbeCtx {
  return {
    location,
    executablePath: "opencode2",
    version: "2.0.0",
  };
}

beforeEach(() => {
  acquireOpenCode2Server.mockReset().mockRejectedValue(new Error("probe closed"));
});

describe("OpenCode 2 detection probe sharing", () => {
  it("shares one pooled sidecar across concurrent detections of the same target", async () => {
    const location: ProjectLocation = { kind: "posix", path: "/same-target" };

    await Promise.all([
      openCode2DetectionSpec.capabilitiesProbe?.(probeContext(location)),
      openCode2DetectionSpec.capabilitiesProbe?.(probeContext(location)),
    ]);

    expect(acquireOpenCode2Server).toHaveBeenCalledOnce();
  });

  it("does not share pending work between different detection targets", async () => {
    await Promise.all([
      openCode2DetectionSpec.capabilitiesProbe?.(probeContext({ kind: "posix", path: "/first" })),
      openCode2DetectionSpec.capabilitiesProbe?.(probeContext({ kind: "posix", path: "/second" })),
    ]);

    expect(acquireOpenCode2Server).toHaveBeenCalledTimes(2);
  });

  it("keeps the default capabilities when the probe fails", async () => {
    const result = await openCode2DetectionSpec.capabilitiesProbe?.(
      probeContext({ kind: "posix", path: "/failing" }),
    );

    // `undefined` means "no capability override", so the spec defaults win.
    expect(result).toBeUndefined();
    expect(acquireOpenCode2Server).toHaveBeenCalledOnce();
  });

  it("does not launch an incompatible pre-permissions beta", async () => {
    await openCode2DetectionSpec.capabilitiesProbe?.({
      ...probeContext({ kind: "posix", path: "/old" }),
      version: "0.0.0-beta-19425",
    });
    expect(acquireOpenCode2Server).not.toHaveBeenCalled();
  });

  it("skips the probe when no executable was resolved", async () => {
    const result = await openCode2DetectionSpec.capabilitiesProbe?.({
      location: { kind: "posix", path: "/missing" },
      executablePath: undefined,
    });

    expect(result).toBeUndefined();
    expect(acquireOpenCode2Server).not.toHaveBeenCalled();
  });
});
