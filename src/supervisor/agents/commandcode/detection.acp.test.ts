import { afterEach, describe, expect, it, vi } from "vitest";
import * as acp from "../acp";
import * as base from "../base";
import { commandCodeDetectionSpec } from "./detection";

const { fetchMock } = vi.hoisted(() => {
  const fetchStub = vi.fn<typeof fetch>(async () => ({ ok: false }) as Response);
  vi.stubGlobal("fetch", fetchStub);
  return { fetchMock: fetchStub };
});

afterEach(() => vi.restoreAllMocks());

describe("Command Code ACP capability discovery", () => {
  const context = {
    location: { kind: "posix" as const, path: "/tmp" },
    executablePath: "/bin/command-code",
    version: "1.79.2",
    probeEnv: { COMMANDCODE_SKIP_UPDATES: "1" },
  };

  function mockCatalog(
    stdout = "Open Source\n  plain-model  Fast (default)\n  reasoning-model  Reasoning",
  ) {
    return vi.spyOn(base, "readAgentCommandOutput").mockResolvedValue({
      ok: true,
      stdout,
      stderr: "",
    });
  }

  it("observes cancelled model-name loading while native probe cleanup is pending", async () => {
    let finishFetch: ((response: Response) => void) | undefined;
    let finishAcp: (() => void) | undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFetch = resolve;
        }),
    );
    mockCatalog("Open Source\ncancel-model  Fast");
    vi.spyOn(acp, "probeAcpCapabilities").mockImplementation(
      () =>
        new Promise((resolve) => {
          finishAcp = () => resolve(undefined);
        }),
    );
    const controller = new AbortController();
    const failure = new Error("cancel capability discovery");
    const result = commandCodeDetectionSpec
      .capabilitiesProbe?.({ ...context, signal: controller.signal })
      ?.catch((error: unknown) => error);
    try {
      await vi.waitFor(() => expect(finishFetch).toBeDefined());
      controller.abort(failure);
      await expect(result).resolves.toBe(failure);
    } finally {
      finishAcp?.();
      finishFetch?.({ ok: false } as Response);
    }
  });

  it("negotiates Chat choices separately and keeps confirmed empty effort lists", async () => {
    const cli = mockCatalog();
    const probe = vi.spyOn(acp, "probeAcpCapabilities").mockResolvedValue({
      sessionEstablished: true,
      authState: "authenticated",
      supportsResume: true,
      models: [{ id: "reasoning-model", label: "Live Model" }],
      modelEfforts: { "plain-model": [], "reasoning-model": ["low", "high"] },
      modelDefaultEfforts: { "reasoning-model": "high" },
      approvalPolicies: [{ id: "bypass", label: "Bypass Permissions" }],
      slashCommands: [{ id: "acp", label: "/acp", description: "ACP setup" }],
    });
    const result = await commandCodeDetectionSpec.capabilitiesProbe?.(context);
    expect(result).toMatchObject({
      authState: "authenticated",
      preferTerminalLogin: true,
      reportsSkillCatalog: true,
      presentationModes: ["terminal", "gui"],
      mcpScope: { terminal: "launch", gui: "launch" },
      presentationCapabilities: {
        gui: {
          liveInputMode: "server",
          models: [{ id: "reasoning-model", label: "Live Model" }],
          efforts: [],
          modelEfforts: { "plain-model": [], "reasoning-model": ["low", "high"] },
          modelDefaultEfforts: { "reasoning-model": "high" },
          supportsResume: true,
          approvalPolicies: [{ id: "bypass", label: "Bypass Permissions" }],
          defaultApprovalPolicy: "bypass",
          slashCommands: [{ id: "acp", label: "/acp", description: "ACP setup" }],
        },
      },
    });
    expect(result?.models?.map((model) => model.id)).toEqual(["plain-model", "reasoning-model"]);
    // Terminal-probed ladders start at "low"; the declared default keeps new
    // drafts at medium wherever a model lists it.
    expect(result?.defaultEffort).toBe("medium");
    expect(cli).toHaveBeenCalledTimes(1);
    expect(probe.mock.calls[0]?.[1]).toEqual(["acp"]);
    expect(probe.mock.calls[0]?.[3]).toMatchObject({
      env: { COMMANDCODE_SKIP_UPDATES: "1" },
      preserveEmptyModelEfforts: true,
    });
  });

  it("keeps old installations terminal-only without attempting ACP", async () => {
    mockCatalog("");
    const probe = vi.spyOn(acp, "probeAcpCapabilities");
    const result = await commandCodeDetectionSpec.capabilitiesProbe?.({
      ...context,
      version: "1.73.4",
    });
    expect(result).toMatchObject({
      presentationModes: ["terminal"],
      mcpScope: { terminal: "launch", gui: "none" },
      authMethods: [{ type: "terminal" }],
    });
    expect(result?.presentationCapabilities).toBeUndefined();
    expect(probe).not.toHaveBeenCalled();
  });

  it("preserves native casing while completing ladders beyond the ACP sweep", async () => {
    const cli = vi
      .spyOn(base, "readAgentCommandOutput")
      .mockImplementation(async (_location, _path, args) => ({
        ok: true,
        stderr: "",
        stdout: args.includes("--list-models")
          ? "Open Source\nmoonshotai/kimi-k3  Reasoning\nxai/grok-4.7  Reasoning\nmeta/muse-spark-1.3  Reasoning\ncli-only  Local"
          : args[1] === "meta/muse-spark-1.3"
            ? "Unknown effort. Supported: low, medium, high, xhigh, max."
            : "Unknown effort. Supported: low, medium, high, xhigh.",
      }));
    vi.spyOn(acp, "probeAcpCapabilities").mockResolvedValue({
      models: [
        { id: "moonshotai/Kimi-K3", label: "Kimi K3" },
        { id: "xai/grok-4.7", label: "Grok 4.7" },
        { id: "meta/muse-spark-1.3", label: "Muse Spark 1.3" },
      ],
      modelEfforts: { "moonshotai/Kimi-K3": ["low", "max"] },
    });
    const result = await commandCodeDetectionSpec.capabilitiesProbe?.(context);
    expect(result?.modelEfforts).toEqual({
      "moonshotai/kimi-k3": ["low", "max"],
      "xai/grok-4.7": ["low", "medium", "high", "xhigh"],
      "meta/muse-spark-1.3": ["low", "medium", "high", "xhigh", "max"],
      "cli-only": ["low", "medium", "high", "xhigh"],
    });
    expect(result?.presentationCapabilities?.gui?.modelEfforts).toEqual({
      "moonshotai/Kimi-K3": ["low", "max"],
      "xai/grok-4.7": ["low", "medium", "high", "xhigh"],
      "meta/muse-spark-1.3": ["low", "medium", "high", "xhigh", "max"],
    });
    expect(
      cli.mock.calls.filter(([, , args]) => args.includes("--effort")).map(([, , args]) => args[1]),
    ).toEqual(["xai/grok-4.7", "meta/muse-spark-1.3", "cli-only"]);
  });

  it("starts effort discovery without waiting for display names", async () => {
    let finishNames: ((response: Response) => void) | undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishNames = resolve;
        }),
    );
    const cli = vi
      .spyOn(base, "readAgentCommandOutput")
      .mockImplementation(async (_location, _path, args) => ({
        ok: true,
        stderr: "",
        stdout: args.includes("--list-models")
          ? "Open Source\nparallel-model  Reasoning"
          : "Unknown effort. Supported: low, high.",
      }));
    const result = commandCodeDetectionSpec.capabilitiesProbe?.({ ...context, version: "1.73.4" });
    try {
      await vi.waitFor(() => {
        expect(finishNames).toBeDefined();
        expect(cli.mock.calls.some(([, , args]) => args.includes("--effort"))).toBe(true);
      });
    } finally {
      finishNames?.({ ok: false } as Response);
    }
    expect((await result)?.modelEfforts).toEqual({ "parallel-model": ["low", "high"] });
  });

  it("retains native models when CLI catalog probing fails and reports missing authentication", async () => {
    mockCatalog("");
    vi.spyOn(acp, "probeAcpCapabilities").mockResolvedValue({
      authState: "missing",
      models: [{ id: "new-model", label: "New Model" }],
    });
    const result = await commandCodeDetectionSpec.capabilitiesProbe?.(context);
    expect(result?.authState).toBe("missing");
    expect(result?.presentationCapabilities?.gui?.models).toEqual([
      { id: "new-model", label: "New Model" },
    ]);
    expect(result?.authMethods).toEqual([
      { id: "commandcode-terminal-login", name: "Login", type: "terminal" },
    ]);
  });
});
