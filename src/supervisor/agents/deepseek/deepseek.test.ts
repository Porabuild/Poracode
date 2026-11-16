import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { pathToFileURL } from "node:url";
import type { ProjectLocation, ThreadConfig } from "@/shared/contracts";
import * as atomicFileAsync from "@/shared/atomicFileAsync";
import { resolveSharedUpdateCommand } from "@/shared/agents/updateResolver";
import { AcpStructuredSession } from "../acp/session";
import { createAcpStructuredSession, probeAcpCapabilities, type AcpSessionOverrides } from "../acp";
import type { CommandSpec, CreateStructuredSessionInput } from "../base";
import { AcpSessionRequests } from "../acp/sessionRequests";
import { createAcpMapperState } from "../acp/canonicalMapping";
import { primeWslLaunchEnvironment } from "../base";
import * as base from "../base";
import * as binaryResolver from "../binaryResolver";
import * as launchFiles from "../base/launchFiles";
import {
  createDeepSeekPolicyHome,
  createDeepSeekSessionPolicyWriter,
  DEEPSEEK_SESSION_POLICY,
  deepSeekSessionPolicy,
  normalizeDeepSeekConfig,
  stageDeepSeekPolicyFiles,
} from "./permissions";
import * as permissions from "./permissions";
import { createDeepSeekAdapter } from ".";
import { buildDeepSeekCommand } from "./argv";
import { buildDeepSeekProbeCapabilities, deepSeekDetectionSpec } from "./detection";

const acpMocks = vi.hoisted(() => ({
  createSharedAcpStructuredSession: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  shutdownSharedAcpProcesses: vi.fn<(...args: unknown[]) => Promise<void>>(),
}));

vi.mock("../acp", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../acp")>()),
  createSharedAcpStructuredSession: acpMocks.createSharedAcpStructuredSession,
  shutdownSharedAcpProcesses: acpMocks.shutdownSharedAcpProcesses,
  probeAcpCapabilities: vi.fn<typeof probeAcpCapabilities>(),
}));

beforeEach(() => {
  // Delegate the shared factory to the dedicated one so `AcpStructuredSession.create`
  // spies keep controlling the session while the shared mock records scope/overrides.
  acpMocks.createSharedAcpStructuredSession
    .mockReset()
    .mockImplementation(
      async (command: unknown, input: unknown, _shared: unknown, overrides: unknown) =>
        createAcpStructuredSession(
          command as CommandSpec,
          input as CreateStructuredSessionInput,
          overrides as AcpSessionOverrides | undefined,
        ),
    );
  acpMocks.shutdownSharedAcpProcesses.mockReset().mockResolvedValue(undefined);
});

afterEach(() => vi.restoreAllMocks());

const model = '["deepseek-official","deepseek-v4-flash"]';
const location: ProjectLocation = {
  kind: process.platform === "win32" ? "windows" : "posix",
  path: process.cwd(),
};
const wslLocation: ProjectLocation = {
  kind: "wsl",
  distro: "Ubuntu",
  linuxPath: "/home/test/repo",
  uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\test\\repo",
};

const makeFakeSession = () => {
  const dispose = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const openThread = vi.fn<AcpStructuredSession["openThread"]>();
  const startTurn = vi.fn<AcpStructuredSession["startTurn"]>().mockResolvedValue(undefined);
  const interruptTurn = vi.fn<AcpStructuredSession["interruptTurn"]>().mockResolvedValue(undefined);
  const getSessionRef = vi.fn<AcpStructuredSession["getSessionRef"]>().mockReturnValue(undefined);
  const session = {
    dispose,
    openThread,
    startTurn,
    interruptTurn,
    getSessionRef,
  } as unknown as AcpStructuredSession;
  return { session, dispose, openThread, startTurn, interruptTurn, getSessionRef };
};

const guiInput = (
  overrides: Partial<CreateStructuredSessionInput> = {},
): CreateStructuredSessionInput => ({
  threadId: "deepseek-thread",
  projectLocation: location,
  presentationMode: "gui",
  config: { model } as ThreadConfig,
  mcpServers: [],
  ...overrides,
});

const armBinaryResolver = () =>
  vi.spyOn(binaryResolver, "resolveAgentBinaryPath").mockReturnValue(process.execPath);

const sharedPatchDir = (callIndex: number): string => {
  const command = acpMocks.createSharedAcpStructuredSession.mock.calls[callIndex]![0] as {
    args: string[];
  };
  return dirname(command.args[2]!);
};

describe("DeepSeek Harness", () => {
  it.each([undefined, "never", "auto-review"])(
    "keeps native reviewer denials waiting for the user with saved policy %s",
    async (approvalPolicy) => {
      const config = normalizeDeepSeekConfig({
        model,
        ...(approvalPolicy ? { approvalPolicy } : {}),
      });
      expect(config.approvalPolicy).toBe("auto-review");
      const attention = vi.fn<(value: string) => void>();
      const requests = new AcpSessionRequests({
        threadId: "reviewed",
        getPermissionContext: () => ({ config, availableModeIds: [] }),
        ensureMapperState: () => createAcpMapperState("reviewed"),
        emitRuntimeEvents: () => {},
        setRequestAttention: attention,
        createRequestId: () => "review-denied",
      });
      const response = requests.requestPermission({
        sessionId: "native",
        toolCall: { toolCallId: "command", title: "Reviewer declined command", kind: "execute" },
        options: [{ optionId: "approve", name: "Allow once", kind: "allow_once" }],
      });
      expect(attention).toHaveBeenCalledWith("needs_approval");
      requests.resolve("review-denied", { action: "cancel" });
      await expect(response).resolves.toEqual({ outcome: { outcome: "cancelled" } });
    },
  );

  it("uses the detected default route for implicit one-shot generation", async () => {
    const adapter = createDeepSeekAdapter();
    expect(adapter.defaultOneShotModel).toBe('["deepseek-official","deepseek-flash"]');
    const detectInstall = vi.spyOn(base, "detectAgentInstall");
    for (const detectedModel of [
      '["deepseek-account","deepseek-flash"]',
      '["custom-route","custom-model"]',
    ]) {
      detectInstall.mockResolvedValue({
        kind: "deepseek",
        label: "DeepSeek Harness",
        installed: true,
        authState: "authenticated",
        capabilities: {
          ...adapter.capabilities,
          models: [{ id: detectedModel, label: "Available model" }],
        },
      });
      await adapter.detectInstall();
      expect(adapter.defaultOneShotModel).toBe(detectedModel);
    }
  });

  it("advertises the shipped ACP surface and headless utility lane without a terminal", () => {
    const adapter = createDeepSeekAdapter();
    expect(adapter).toMatchObject({ kind: "deepseek", label: "DeepSeek Harness", binary: "dsh" });
    expect(adapter.capabilities).toMatchObject({
      presentationMode: "gui",
      presentationModes: ["gui"],
      liveInputMode: "server",
      supportsResume: true,
      supportsOneShot: true,
      readsImageAttachmentsFromHost: false,
      modes: ["agent"],
      mcpScope: { gui: "launch" },
      defaultApprovalPolicy: "auto-review",
      bypassPermissions: { approvalPolicy: "bypassPermissions" },
    });
    expect(adapter.runOneShot).toBeTypeOf("function");
    expect(adapter.createInitialSessionRef()).toBeUndefined();
    expect(() => adapter.buildLaunchArgv(location, { model }, "", undefined)).toThrow("Chat");
    expect(() =>
      adapter.buildResumeArgv(location, { model }, "", {
        providerSessionId: "id",
        discoveredAt: "2026-10-17T00:00:00Z",
      }),
    ).toThrow("Chat");
    expect(adapter.mcpRequiresStdioCwdProxy).toBe(true);
    expect(adapter.skillSupport).toMatchObject({
      invocation: "prompt",
      roots: [
        { globalOverride: { env: "DSH_HOME", path: "skills" }, projectPath: ".dsh/skills" },
        {
          globalOverride: { env: "DSH_AGENTS_HOME", path: "skills" },
          projectPath: ".agents/skills",
        },
      ],
    });
  });

  it("launches the resolved ACP binary in the native project cwd", () => {
    expect(buildDeepSeekCommand(location, process.execPath)).toMatchObject({
      command: process.execPath,
      args: ["acp"],
      cwd: process.cwd(),
    });
  });

  it("routes WSL ACP through its native Linux cwd and resolved binary", () => {
    primeWslLaunchEnvironment("Ubuntu", { shellPath: "/bin/bash", home: "/home/test" });
    const command = buildDeepSeekCommand(
      {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/test/a project",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\test\\a project",
      },
      "/home/test/.local/bin/dsh",
    );
    expect(command.command).toMatch(/(?:^|[\\/])wsl\.exe$/);
    expect(command.args).toContain("/home/test/a project");
    expect(command.args.join(" ")).toContain("/home/test/.local/bin/dsh");
    expect(command.args.join(" ")).toContain("acp");
  });

  it.each(["posix", "windows", "wsl"] as const)(
    "uses the latest published release for %s updates",
    (envKind) => {
      const adapter = createDeepSeekAdapter();
      expect(
        resolveSharedUpdateCommand({
          update: adapter.update,
          executablePath: "/node_modules/.bin/dsh",
          envKind,
        }),
      ).toEqual({
        binary: "npm",
        args: ["install", "-g", "@deepseek-ai/dsh@latest"],
        strategy: "npm-global",
      });
      expect(adapter.update).toEqual({ npm: "@deepseek-ai/dsh" });
    },
  );

  it("preserves opaque model routes, grouping, and each model's reasoning choices", () => {
    const probe = buildDeepSeekProbeCapabilities({
      authState: "authenticated",
      authMethods: [],
      supportsResume: true,
      models: [{ id: model, label: "deepseek-v4-flash" }],
      subProviders: [{ id: "deepseek-official", label: "DeepSeek" }],
      modelSubProvider: { [model]: "deepseek-official" },
      efforts: ["off", "low", "high", "max"],
      defaultEffort: "high",
      modelEfforts: { [model]: ["off", "low", "high", "max"], custom: [] },
      modelDefaultEfforts: { [model]: "high" },
    });
    expect(probe).toMatchObject({
      models: [{ id: model, label: "DeepSeek V4 Flash" }],
      subProviders: [{ id: "deepseek-official", label: "DeepSeek" }],
      modelSubProvider: { [model]: "deepseek-official" },
      defaultEffort: "high",
      modelEfforts: { [model]: ["off", "low", "high", "max"], custom: [] },
      modelDefaultEfforts: { [model]: "high" },
      authMethods: [{ type: "terminal" }],
      preferTerminalLogin: true,
    });
    expect(probe).not.toHaveProperty("authState");
    expect(buildDeepSeekProbeCapabilities(undefined)).not.toHaveProperty("models");
    expect(deepSeekDetectionSpec.loginCommand).toBe("dsh web --port 0");
  });

  it("probes the ACP profile with its exact per-model option snapshots", async () => {
    vi.mocked(probeAcpCapabilities).mockResolvedValue({
      supportsResume: true,
      modelEfforts: { [model]: [] },
    });
    const result = await deepSeekDetectionSpec.capabilitiesProbe?.({
      location,
      executablePath: process.execPath,
    });
    expect(result?.modelEfforts).toEqual({ [model]: [] });
    expect(probeAcpCapabilities).toHaveBeenCalledWith(
      process.execPath,
      ["acp"],
      expect.any(String),
      expect.objectContaining({ preserveEmptyModelEfforts: true }),
    );
  });

  it("launches native GUI threads on the shared pool and WSL on the dedicated factory", async () => {
    armBinaryResolver();
    const adapter = createDeepSeekAdapter();
    const create = vi.spyOn(AcpStructuredSession, "create");

    const native = makeFakeSession();
    create.mockReturnValue(native.session);
    const nativeSession = await adapter.createStructuredSession!(guiInput());
    expect(nativeSession).toBe(native.session);
    expect(acpMocks.createSharedAcpStructuredSession).toHaveBeenCalledTimes(1);
    const [command, input, shared, overrides] =
      acpMocks.createSharedAcpStructuredSession.mock.calls[0]!;
    expect(command).toMatchObject({
      command: process.execPath,
      args: ["acp", "--patch", expect.stringContaining("permissions.json")],
      cwd: process.cwd(),
    });
    expect(input).toMatchObject({ threadId: "deepseek-thread" });
    expect(shared).toEqual({ scope: "deepseek" });
    expect(overrides).toMatchObject({
      behavior: { inlineImagePrompts: false },
      textStreamExtension: expect.objectContaining({ id: "deepseek-goals" }),
    });
    await nativeSession!.dispose();

    primeWslLaunchEnvironment("Ubuntu", { shellPath: "/bin/bash", home: "/home/test" });
    const cleanup = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const stage = vi.spyOn(launchFiles, "stageLaunchFiles").mockResolvedValue({
      directory: "/tmp/poracode-deepseek-session-wsl",
      cleanup,
    });
    const wsl = makeFakeSession();
    create.mockReturnValue(wsl.session);
    const wslSession = await adapter.createStructuredSession!(
      guiInput({ threadId: "deepseek-wsl", projectLocation: wslLocation }),
    );
    expect(wslSession).toBe(wsl.session);
    expect(acpMocks.createSharedAcpStructuredSession).toHaveBeenCalledTimes(1);
    expect(stage).toHaveBeenCalledWith(
      wslLocation,
      "deepseek-session",
      expect.objectContaining({ "policy.mjs": DEEPSEEK_SESSION_POLICY }),
    );
    await wslSession!.dispose();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("shares one staged policy directory across pooled sessions and restages after full release", async () => {
    armBinaryResolver();
    vi.spyOn(AcpStructuredSession, "create").mockImplementation(() => makeFakeSession().session);
    const adapter = createDeepSeekAdapter();

    const first = await adapter.createStructuredSession!(guiInput({ threadId: "pool-a" }));
    const second = await adapter.createStructuredSession!(guiInput({ threadId: "pool-b" }));
    const dirA = sharedPatchDir(0);
    const dirB = sharedPatchDir(1);
    expect(dirA).toBe(dirB);
    expect(existsSync(dirA)).toBe(true);

    await first!.dispose();
    expect(existsSync(dirA)).toBe(true);
    await second!.dispose();
    expect(existsSync(dirA)).toBe(false);

    const third = await adapter.createStructuredSession!(guiInput({ threadId: "pool-c" }));
    const dirC = sharedPatchDir(2);
    expect(dirC).not.toBe(dirA);
    expect(existsSync(dirC)).toBe(true);
    await third!.dispose();
    expect(existsSync(dirC)).toBe(false);
  });

  it("writes a per-session policy file after open and rewrites it before each turn", async () => {
    armBinaryResolver();
    const fake = makeFakeSession();
    vi.spyOn(AcpStructuredSession, "create").mockReturnValue(fake.session);
    const session = await createDeepSeekAdapter().createStructuredSession!(guiInput());
    const dir = sharedPatchDir(0);

    fake.openThread.mockResolvedValue("sess-1");
    await session!.openThread!({ model, approvalPolicy: "never" });
    expect(fake.openThread).toHaveBeenCalledWith(
      { model, approvalPolicy: "auto-review" },
      undefined,
    );
    expect(JSON.parse(readFileSync(join(dir, "session-sess-1.json"), "utf8"))).toEqual({
      sandboxMode: "danger-full-access",
      autoReview: true,
    });

    const sessionRef = { providerSessionId: "sess-1", discoveredAt: "2026-10-17T00:00:00Z" };
    fake.getSessionRef.mockReturnValue(sessionRef);
    let policyAtTurnStart: unknown;
    fake.startTurn.mockImplementation(async () => {
      policyAtTurnStart = JSON.parse(readFileSync(join(dir, "session-sess-1.json"), "utf8"));
    });
    await session!.startTurn!("review this", { model, approvalPolicy: "default" });
    expect(fake.startTurn).toHaveBeenCalledWith("review this", {
      model,
      approvalPolicy: "default",
    });
    expect(policyAtTurnStart).toEqual({ sandboxMode: "workspace-write", autoReview: false });
    expect(JSON.parse(readFileSync(join(dir, "session-sess-1.json"), "utf8"))).toEqual({
      sandboxMode: "workspace-write",
      autoReview: false,
    });
    await session!.dispose();
  });

  it("pins a resumed session's policy before the underlying open runs", async () => {
    armBinaryResolver();
    const fake = makeFakeSession();
    vi.spyOn(AcpStructuredSession, "create").mockReturnValue(fake.session);
    const session = await createDeepSeekAdapter().createStructuredSession!(guiInput());
    const dir = sharedPatchDir(0);
    const sessionRef = { providerSessionId: "sess-old", discoveredAt: "2026-10-17T00:00:00Z" };

    let policyDuringOpen: unknown;
    fake.openThread.mockImplementation(async () => {
      const file = join(dir, "session-sess-old.json");
      policyDuringOpen = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
      return "sess-old";
    });
    await session!.openThread!({ model, approvalPolicy: "bypassPermissions" }, sessionRef);
    expect(fake.openThread).toHaveBeenCalledWith(
      { model, approvalPolicy: "bypassPermissions" },
      sessionRef,
    );
    expect(policyDuringOpen).toEqual({ sandboxMode: "danger-full-access", autoReview: false });
    expect(JSON.parse(readFileSync(join(dir, "session-sess-old.json"), "utf8"))).toEqual({
      sandboxMode: "danger-full-access",
      autoReview: false,
    });
    await session!.dispose();
  });

  it("removes the previous session's policy file when a session re-opens under a new id", async () => {
    armBinaryResolver();
    const fake = makeFakeSession();
    vi.spyOn(AcpStructuredSession, "create").mockReturnValue(fake.session);
    const session = await createDeepSeekAdapter().createStructuredSession!(guiInput());
    const dir = sharedPatchDir(0);

    fake.openThread.mockResolvedValueOnce("sess-1").mockResolvedValueOnce("sess-2");
    await session!.openThread!({ model });
    expect(existsSync(join(dir, "session-sess-1.json"))).toBe(true);
    await session!.openThread!({ model });
    expect(existsSync(join(dir, "session-sess-1.json"))).toBe(false);
    expect(existsSync(join(dir, "session-sess-2.json"))).toBe(true);
    await session!.dispose();
    expect(existsSync(dir)).toBe(false);
  });

  it("removes only the disposed session's policy file while a pooled sibling stays", async () => {
    armBinaryResolver();
    const fakes: ReturnType<typeof makeFakeSession>[] = [];
    vi.spyOn(AcpStructuredSession, "create").mockImplementation(() => {
      const fake = makeFakeSession();
      fakes.push(fake);
      return fake.session;
    });
    const adapter = createDeepSeekAdapter();
    const first = await adapter.createStructuredSession!(guiInput({ threadId: "policy-a" }));
    const second = await adapter.createStructuredSession!(guiInput({ threadId: "policy-b" }));
    const dir = sharedPatchDir(0);
    expect(sharedPatchDir(1)).toBe(dir);

    fakes[0]!.openThread.mockResolvedValue("sess-A");
    fakes[1]!.openThread.mockResolvedValue("sess-B");
    await first!.openThread!({ model });
    await second!.openThread!({ model });
    expect(existsSync(join(dir, "session-sess-A.json"))).toBe(true);
    expect(existsSync(join(dir, "session-sess-B.json"))).toBe(true);

    await first!.dispose();
    expect(existsSync(join(dir, "session-sess-A.json"))).toBe(false);
    expect(existsSync(join(dir, "session-sess-B.json"))).toBe(true);
    expect(existsSync(dir)).toBe(true);

    await second!.dispose();
    expect(existsSync(dir)).toBe(false);
  });

  it("still releases the policy file and directory lease when dispose fails", async () => {
    armBinaryResolver();
    const fake = makeFakeSession();
    fake.dispose.mockRejectedValue(new Error("dispose failed"));
    vi.spyOn(AcpStructuredSession, "create").mockReturnValue(fake.session);
    const session = await createDeepSeekAdapter().createStructuredSession!(guiInput());
    const dir = sharedPatchDir(0);
    fake.openThread.mockResolvedValue("sess-x");
    await session!.openThread!({ model });
    expect(existsSync(join(dir, "session-sess-x.json"))).toBe(true);

    await expect(session!.dispose()).rejects.toThrow("dispose failed");
    expect(existsSync(join(dir, "session-sess-x.json"))).toBe(false);
    expect(existsSync(dir)).toBe(false);
  });

  it("leaves no policy file when dispose rejects during an in-flight turn write", async () => {
    armBinaryResolver();
    const fake = makeFakeSession();
    fake.dispose.mockRejectedValue(new Error("dispose failed"));
    fake.getSessionRef.mockReturnValue({
      providerSessionId: "sess-race",
      discoveredAt: "2026-10-17T00:00:00Z",
    });
    vi.spyOn(AcpStructuredSession, "create").mockReturnValue(fake.session);
    const session = await createDeepSeekAdapter().createStructuredSession!(guiInput());
    const dir = sharedPatchDir(0);
    fake.openThread.mockResolvedValue("sess-race");
    await session!.openThread!({ model });
    expect(existsSync(join(dir, "session-sess-race.json"))).toBe(true);

    // Gate the turn's policy write inside the atomic-file helper so dispose
    // runs while the write is still in flight.
    let releaseWrite!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const originalWrite = atomicFileAsync.writeFileAtomicAsync;
    const spy = vi
      .spyOn(atomicFileAsync, "writeFileAtomicAsync")
      .mockImplementation(async (filePath, data, options) => {
        await gate;
        return originalWrite(filePath, data, options);
      });

    const turn = session!.startTurn!("review this", { model, approvalPolicy: "default" });
    await vi.waitFor(() => expect(spy).toHaveBeenCalled());

    // dispose() rejects while the write is in flight: the queued clear still
    // removes the file afterwards and the policy-home lease is released.
    const disposePromise = session!.dispose();
    releaseWrite();
    await expect(disposePromise).rejects.toThrow("dispose failed");
    await turn;
    expect(fake.startTurn).not.toHaveBeenCalled();
    expect(existsSync(join(dir, "session-sess-race.json"))).toBe(false);
    expect(existsSync(dir)).toBe(false);
  });

  it("rejects policy writes for invalid session ids", async () => {
    const dir = mkdtempSync(join(tmpdir(), "deepseek-policy-"));
    try {
      const writer = createDeepSeekSessionPolicyWriter(location, dir);
      await expect(writer.write("../escape", { model })).rejects.toThrow(
        "Invalid DeepSeek session id",
      );
      await expect(writer.write("has space", { model })).rejects.toThrow(
        "Invalid DeepSeek session id",
      );
      await writer.write("sess-ok", { model, approvalPolicy: "default" });
      expect(JSON.parse(readFileSync(join(dir, "session-sess-ok.json"), "utf8"))).toEqual({
        sandboxMode: "workspace-write",
        autoReview: false,
      });
      await writer.clear();
      expect(existsSync(join(dir, "session-sess-ok.json"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    armBinaryResolver();
    const fake = makeFakeSession();
    vi.spyOn(AcpStructuredSession, "create").mockReturnValue(fake.session);
    const session = await createDeepSeekAdapter().createStructuredSession!(guiInput());
    fake.openThread.mockResolvedValue("../evil");
    await expect(session!.openThread!({ model })).rejects.toThrow("Invalid DeepSeek session id");
    await session!.dispose();
  });

  it("leaves no session file when clear() runs during an in-flight write", async () => {
    const dir = mkdtempSync(join(tmpdir(), "deepseek-policy-"));
    try {
      const writer = createDeepSeekSessionPolicyWriter(location, dir);
      let releaseWrite!: () => void;
      const gate = new Promise<void>((resolve) => {
        releaseWrite = resolve;
      });
      const originalWrite = atomicFileAsync.writeFileAtomicAsync;
      const spy = vi
        .spyOn(atomicFileAsync, "writeFileAtomicAsync")
        .mockImplementation(async (filePath, data, options) => {
          await gate;
          return originalWrite(filePath, data, options);
        });

      const writePromise = writer.write("sess-race", { model });
      await vi.waitFor(() => expect(spy).toHaveBeenCalled());
      const clearPromise = writer.clear();
      releaseWrite();
      await writePromise;
      await clearPromise;
      expect(existsSync(join(dir, "session-sess-race.json"))).toBe(false);
      expect(readdirSync(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("resolves writes after clear() without touching disk", async () => {
    const dir = mkdtempSync(join(tmpdir(), "deepseek-policy-"));
    try {
      const writer = createDeepSeekSessionPolicyWriter(location, dir);
      await writer.write("sess-1", { model });
      expect(existsSync(join(dir, "session-sess-1.json"))).toBe(true);
      await writer.clear();
      expect(existsSync(join(dir, "session-sess-1.json"))).toBe(false);

      await writer.write("sess-2", { model });
      await writer.write("sess-1", { model });
      expect(readdirSync(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each(["interrupt", "dispose"] as const)(
    "does not start a turn cancelled during policy staging (%s)",
    async (action) => {
      armBinaryResolver();
      const fake = makeFakeSession();
      fake.getSessionRef.mockReturnValue({
        providerSessionId: "sess-1",
        discoveredAt: "2026-10-17T00:00:00Z",
      });
      vi.spyOn(AcpStructuredSession, "create").mockReturnValue(fake.session);
      let release!: () => void;
      let entered!: () => void;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const blocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      const write = vi.fn<(sessionId: string, config: ThreadConfig) => Promise<void>>(async () => {
        entered();
        await blocked;
      });
      vi.spyOn(permissions, "createDeepSeekSessionPolicyWriter").mockReturnValue({
        write,
        clear: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      });
      const session = await createDeepSeekAdapter().createStructuredSession!(guiInput());
      const turn = session!.startTurn!("read only", { model });
      await started;
      const stopped = action === "interrupt" ? session!.interruptTurn!() : session!.dispose();
      release();
      await stopped;
      await turn;
      expect(fake.startTurn).not.toHaveBeenCalled();
      await session!.dispose();
    },
  );

  it.each([
    [{ kind: "posix", path: "/projects/app" }, "workspace-write"],
    [{ kind: "windows", path: "C:\\projects\\app" }, "workspace-write"],
    [{ kind: "windows", path: "C:\\Users\\test" }, "danger-full-access"],
    [{ kind: "posix", path: "/home/test" }, "danger-full-access"],
    [{ kind: "wsl", distro: "Ubuntu", linuxPath: "/home/test", uncPath: "" }, "danger-full-access"],
  ] satisfies Array<[ProjectLocation, string]>)(
    "pins Default sandbox policy for %j",
    async (projectLocation, expected) => {
      const stage = vi.spyOn(launchFiles, "stageLaunchFiles").mockResolvedValue({
        directory: "/staged",
        cleanup: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      });
      const staged = await stageDeepSeekPolicyFiles(projectLocation);
      expect(stage).toHaveBeenCalledWith(projectLocation, "deepseek-session", expect.anything());
      expect(staged.patchPath).toBe(
        projectLocation.kind === "wsl"
          ? posix.join("/staged", "permissions.json")
          : join("/staged", "permissions.json"),
      );
      const files = stage.mock.calls[0]![2];
      expect(files["policy.mjs"]).toBe(DEEPSEEK_SESSION_POLICY);
      expect(JSON.parse(files["permissions.json"]!)).toEqual([
        { id: "acp", inject: ["acpAppStartup", "poracodeSessionPolicy"] },
        {
          insert: [
            { id: "auto-review", name: "@deepseek-ai/dsh-experimental-auto-review" },
            {
              id: "poracode-session-policy",
              name: "./policy.mjs",
              config: { sessionPolicyDir: "./" },
            },
          ],
        },
      ]);
      expect(
        JSON.parse(
          deepSeekSessionPolicy(projectLocation, {
            model,
            approvalPolicy: "default",
            sandboxMode: "danger-full-access",
          }),
        ),
      ).toEqual({ sandboxMode: expected, autoReview: false });
    },
  );

  it("applies each session's own policy file inside one shared policy directory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "deepseek-plugin-"));
    try {
      const policy = await import(
        `data:text/javascript;base64,${Buffer.from(DEEPSEEK_SESSION_POLICY).toString("base64")}`
      );
      const writerA = createDeepSeekSessionPolicyWriter(location, dir);
      const writerB = createDeepSeekSessionPolicyWriter(location, dir);
      await writerA.write("sess-a", { model, approvalPolicy: "bypassPermissions" });
      await writerB.write("sess-b", { model, approvalPolicy: "default" });

      const listeners = new Map<string, (...args: unknown[]) => unknown>();
      const appends: Array<{ session: string; type: string; data: unknown }> = [];
      const presetSets: string[] = [];
      const ctx = {
        on: vi.fn<(name: string, listener: (...args: unknown[]) => unknown) => void>(
          (name, listener) => {
            listeners.set(name, listener);
          },
        ),
        provide: vi.fn<(name: string, value: unknown) => void>(),
        permissionPresets: {
          current: vi.fn<() => string>(() => "custom"),
          set: vi.fn<(session: unknown, preset: string) => void>((_session, preset) => {
            presetSets.push(preset);
          }),
        },
        sandboxPolicy: { resolve: vi.fn<() => { mode: string }>(() => ({ mode: "custom-mode" })) },
        approval: { effectivePolicy: vi.fn<() => string>(() => "never") },
      };
      policy.apply(ctx, { sessionPolicyDir: `${pathToFileURL(dir).href}/` });
      expect(ctx.provide).toHaveBeenCalledWith("poracodeSessionPolicy", { ready: true });

      const agentSession = (id: string, header: Record<string, unknown> = {}) => ({
        header: { id, ...header },
        append: vi.fn<(type: string, data: unknown) => void>((type, data) => {
          appends.push({ session: id, type, data });
        }),
      });
      const created = listeners.get("agent/created")!;
      const claimed = listeners.get("agent/inbox/claimed")!;
      const preStep = listeners.get("agent/pre-step")!;

      created({ agent: { session: agentSession("sess-a") } });
      created({ agent: { session: agentSession("sess-b") } });
      expect(appends).toEqual([
        { session: "sess-a", type: "sandbox/mode", data: { mode: "danger-full-access" } },
        { session: "sess-a", type: "approval/policy", data: { policy: "ask" } },
        { session: "sess-b", type: "sandbox/mode", data: { mode: "workspace-write" } },
        { session: "sess-b", type: "approval/policy", data: { policy: "ask" } },
      ]);

      // A rewritten file is re-read on the next inbox claim.
      appends.length = 0;
      await writerA.write("sess-a", { model, approvalPolicy: "default" });
      claimed({ agent: { session: agentSession("sess-a") } });
      expect(appends).toEqual([
        { session: "sess-a", type: "sandbox/mode", data: { mode: "workspace-write" } },
        { session: "sess-a", type: "approval/policy", data: { policy: "ask" } },
      ]);

      // autoReview pins the "auto" preset and skips sandbox/approval appends.
      appends.length = 0;
      presetSets.length = 0;
      await writerA.write("sess-a", { model });
      claimed({ agent: { session: agentSession("sess-a") } });
      expect(presetSets).toEqual(["auto"]);
      expect(appends).toEqual([]);

      // A session still on the "auto" preset is moved back to its sandbox mode.
      presetSets.length = 0;
      ctx.permissionPresets.current = vi.fn<() => string>(() => "auto");
      await writerA.write("sess-a", { model, approvalPolicy: "default" });
      claimed({ agent: { session: agentSession("sess-a") } });
      expect(presetSets).toEqual(["workspace-write"]);

      // A missing policy file is tolerated until the awaited pre-step, which
      // then fails closed without running the step.
      const missing = agentSession("sess-missing");
      created({ agent: { session: missing } });
      claimed({ agent: { session: missing } });
      expect(missing.append).not.toHaveBeenCalled();
      const next = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
      expect(() => preStep({ agent: { session: missing } }, next)).toThrow(
        "no policy for session sess-missing",
      );
      expect(next).not.toHaveBeenCalled();

      // Invalid native session ids are rejected before any file read.
      expect(() => created({ agent: { session: agentSession("../escape") } })).toThrow(
        "invalid session id",
      );

      // Subagent sessions never read or apply a Poracode policy.
      const subagent = agentSession("sess-sub", { origin: "subagent" });
      const subNext = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
      created({ agent: { session: subagent } });
      preStep({ agent: { session: subagent } }, subNext);
      expect(subagent.append).not.toHaveBeenCalled();
      expect(subNext).toHaveBeenCalledOnce();
      const child = agentSession("sess-child", { parentSession: "sess-a" });
      claimed({ agent: { session: child } });
      expect(child.append).not.toHaveBeenCalled();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("stages one policy directory for concurrent acquires and cleans up after the last release", async () => {
    const cleanup = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const stage = vi.spyOn(launchFiles, "stageLaunchFiles").mockResolvedValue({
      directory: "/staged-home",
      cleanup,
    });
    const home = createDeepSeekPolicyHome();
    const [first, second] = await Promise.all([home.acquire(location), home.acquire(location)]);
    expect(stage).toHaveBeenCalledTimes(1);
    expect(first.patchPath).toBe(second.patchPath);
    expect(first.directory).toBe("/staged-home");

    await first.release();
    await first.release();
    expect(cleanup).not.toHaveBeenCalled();
    await second.release();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("rejects a failed staging and restages on the next acquire", async () => {
    const cleanup = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const stage = vi
      .spyOn(launchFiles, "stageLaunchFiles")
      .mockRejectedValueOnce(new Error("stage failed"))
      .mockResolvedValue({ directory: "/staged-home", cleanup });
    const home = createDeepSeekPolicyHome();
    await expect(home.acquire(location)).rejects.toThrow("stage failed");

    const lease = await home.acquire(location);
    expect(stage).toHaveBeenCalledTimes(2);
    expect(lease.patchPath).toBe(join("/staged-home", "permissions.json"));
    await lease.release();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("shuts down the shared pool scoped to its own kind", async () => {
    await createDeepSeekAdapter().shutdown?.();
    expect(acpMocks.shutdownSharedAcpProcesses).toHaveBeenCalledExactlyOnceWith("deepseek");
  });
});
