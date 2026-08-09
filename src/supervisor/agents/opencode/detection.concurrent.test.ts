import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import type { DetectProbeCtx } from "../base";
import type { OpenCodeSdkInventory } from "./sdkProbe";

const probeOpenCodeInventoryViaSdk = vi.hoisted(() =>
  vi.fn<
    (location: ProjectLocation, signal?: AbortSignal) => Promise<OpenCodeSdkInventory | undefined>
  >(),
);

vi.mock("./sdkProbe", () => ({ probeOpenCodeInventoryViaSdk }));

import { opencodeDetectionSpec } from "./detection";

const inventory = { providers: [], connected: [], agents: [] };

function probeContext(location: ProjectLocation, signal: AbortSignal): DetectProbeCtx {
  return {
    location,
    executablePath: "opencode",
    version: "1.14.19",
    signal,
  };
}

beforeEach(() => {
  probeOpenCodeInventoryViaSdk.mockReset();
});

describe("OpenCode detection probe sharing", () => {
  it("shares status and capability work only when callers share a cancellation signal", async () => {
    probeOpenCodeInventoryViaSdk.mockResolvedValue(inventory);
    const signal = new AbortController().signal;
    const ctx = probeContext({ kind: "posix", path: "/same-signal" }, signal);

    await Promise.all([
      opencodeDetectionSpec.statusProbe?.(ctx),
      opencodeDetectionSpec.capabilitiesProbe?.(ctx),
    ]);

    expect(probeOpenCodeInventoryViaSdk).toHaveBeenCalledOnce();
  });

  it("does not share pending work between independently cancellable detections", async () => {
    let resolveFirst: ((value: typeof inventory) => void) | undefined;
    probeOpenCodeInventoryViaSdk
      .mockImplementationOnce(
        () =>
          new Promise<typeof inventory>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(inventory);
    const location: ProjectLocation = { kind: "posix", path: "/different-signals" };
    const first = opencodeDetectionSpec.statusProbe?.(
      probeContext(location, new AbortController().signal),
    );
    await vi.waitFor(() => expect(probeOpenCodeInventoryViaSdk).toHaveBeenCalledOnce());

    const second = opencodeDetectionSpec.statusProbe?.(
      probeContext(location, new AbortController().signal),
    );
    await vi.waitFor(() => expect(probeOpenCodeInventoryViaSdk).toHaveBeenCalledTimes(2));
    resolveFirst?.(inventory);

    await Promise.all([first, second]);
  });
});
