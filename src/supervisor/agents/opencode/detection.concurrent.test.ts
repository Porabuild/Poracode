import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import type { DetectProbeCtx } from "../base";
import type { OpenCodeSdkInventory } from "./sdkProbe";

const probeOpenCodeInventoryViaSdk = vi.hoisted(() =>
  vi.fn<
    (location: ProjectLocation, signal?: AbortSignal) => Promise<OpenCodeSdkInventory | undefined>
  >(),
);

vi.mock("./sdkProbe", () => ({ probeOpenCodeInventoryViaSdk }));

const readAgentCommandOutput = vi.hoisted(() =>
  vi.fn<typeof import("../base").readAgentCommandOutput>(),
);
vi.mock("../base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../base")>()),
  readAgentCommandOutput,
}));

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
  readAgentCommandOutput.mockReset().mockResolvedValue({ ok: true, stdout: "", stderr: "" });
});

afterEach(() => vi.restoreAllMocks());

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
    expect(readAgentCommandOutput).toHaveBeenCalledExactlyOnceWith(
      ctx.location,
      "opencode",
      ["models", "--refresh"],
      expect.objectContaining({ signal, timeoutMs: 15_000 }),
    );
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

  it("waits for cache refresh before reading the updated SDK inventory", async () => {
    let finishRefresh: (() => void) | undefined;
    readAgentCommandOutput.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRefresh = () => resolve({ ok: true, stdout: "Models cache refreshed", stderr: "" });
        }),
    );
    probeOpenCodeInventoryViaSdk.mockResolvedValue({
      providers: [
        {
          id: "opencode",
          name: "OpenCode",
          models: [{ id: "new-model", name: "New Model", variants: ["high"] }],
        },
      ],
      connected: ["opencode"],
      agents: [],
    });
    const ctx = probeContext({ kind: "posix", path: "/refresh" }, new AbortController().signal);
    const probe = opencodeDetectionSpec.capabilitiesProbe!(ctx);
    expect(probeOpenCodeInventoryViaSdk).not.toHaveBeenCalled();
    finishRefresh?.();
    expect(await probe).toMatchObject({
      models: [{ id: "opencode/new-model", label: "New Model" }],
    });
  });

  it("keeps cached inventory available after a failed refresh", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    readAgentCommandOutput.mockResolvedValue({ ok: false, stdout: "", stderr: "offline" });
    probeOpenCodeInventoryViaSdk.mockResolvedValue(inventory);
    const ctx = probeContext({ kind: "posix", path: "/offline" }, new AbortController().signal);
    await expect(opencodeDetectionSpec.capabilitiesProbe!(ctx)).resolves.toMatchObject({
      models: [],
    });
    expect(probeOpenCodeInventoryViaSdk).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("model cache refresh failed"));
  });

  it("does not start a server when detection is cancelled during refresh", async () => {
    const abort = new AbortController();
    readAgentCommandOutput.mockImplementationOnce(async () => {
      abort.abort(new Error("cancelled"));
      return { ok: false, stdout: "", stderr: "aborted" };
    });
    const ctx = probeContext({ kind: "posix", path: "/cancelled" }, abort.signal);
    await expect(opencodeDetectionSpec.capabilitiesProbe!(ctx)).rejects.toThrow("cancelled");
    expect(probeOpenCodeInventoryViaSdk).not.toHaveBeenCalled();
  });

  it("refreshes in the detected WSL environment using its executable and probe env", async () => {
    probeOpenCodeInventoryViaSdk.mockResolvedValue(inventory);
    const ctx = {
      ...probeContext(
        {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/home/test",
          uncPath: "\\\\wsl$\\Ubuntu\\home\\test",
        },
        new AbortController().signal,
      ),
      executablePath: "/home/test/bin/opencode",
      probeEnv: { OPENCODE_CONFIG_DIR: "/home/test/config" },
    };
    await opencodeDetectionSpec.capabilitiesProbe!(ctx);
    expect(readAgentCommandOutput).toHaveBeenCalledWith(
      ctx.location,
      ctx.executablePath,
      ["models", "--refresh"],
      expect.objectContaining({ env: ctx.probeEnv, signal: ctx.signal }),
    );
  });
});
