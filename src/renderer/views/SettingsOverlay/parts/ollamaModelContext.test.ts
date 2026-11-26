import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/shared/contracts";
import {
  buildOllamaContextCreatePayload,
  buildOllamaContextPreparationScript,
  OLLAMA_CONTEXT_ALIAS_COLLISION_MARKER,
  OLLAMA_CONTEXT_BASE_URL,
  OLLAMA_CONTEXT_BEGIN_MARKER,
  OLLAMA_CONTEXT_CREATE_FAILED_MARKER,
  OLLAMA_CONTEXT_SOURCE_MISSING_MARKER,
  OLLAMA_CONTEXT_SOURCE_UNSUPPORTED_MARKER,
  OLLAMA_CONTEXT_SUCCESS_MARKER,
  OLLAMA_CONTEXT_UNREACHABLE_MARKER,
  OllamaContextPreparationError,
  startOllamaContextPreparation,
  type OllamaContextPreparationCompletion,
} from "./ollamaModelContext";

type WriteScriptMock = (
  shellId: string,
  script: string,
  locationKind: string,
  onExit: (exitCode: number | null) => void,
  onCommandComplete?: (exitCode: number) => void,
  remoteServerId?: string,
  outputHandlers?: {
    onOutput: (output: string) => void;
    onReset: () => void;
    onSnapshot?: (snapshot: { data: string }) => void;
    onCommandCompletion?: (exitCode: number, source: string) => void;
  },
) => () => void;

const mocks = vi.hoisted(() => ({
  startShell: vi.fn<(payload: unknown) => Promise<void>>(),
  writeScript: vi.fn<WriteScriptMock>(),
  disposeSession: vi.fn<(shellId: string) => void>(),
  closeThread: vi.fn<(payload: { threadId: string }) => Promise<void>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ closeThread: mocks.closeThread }),
}));

vi.mock("@/renderer/utils/shellUtils", () => ({
  startShellWithCurrentSettings: mocks.startShell,
  writeScriptToShellThenExitOnSuccess: mocks.writeScript,
  disposeRoutedShellSession: mocks.disposeSession,
}));

const ALIAS = "poracode-ctx-65536-0123456789ab-0123456789abcdef";
const BASE = "inkling-2-mini:latest";

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "project",
    name: "Mac mini",
    disabled: false,
    createdAt: new Date(0).toISOString(),
    location: { kind: "posix", path: "~" },
    ...overrides,
  };
}

function start(
  onComplete = vi.fn<(completion: OllamaContextPreparationCompletion) => void>(),
  overrides: Partial<Parameters<typeof startOllamaContextPreparation>[0]> = {},
) {
  return {
    onComplete,
    handle: startOllamaContextPreparation({
      project: project(),
      baseModel: BASE,
      alias: ALIAS,
      contextLength: 65536,
      onComplete,
      ...overrides,
    }),
  };
}

function outputHandlers() {
  return mocks.writeScript.mock.calls[0]?.[6]!;
}

describe("Ollama context script", () => {
  it("shows the installed source before creating the derived alias on fixed loopback", () => {
    const script = buildOllamaContextPreparationScript(
      { baseModel: BASE, alias: ALIAS, contextLength: 65536 },
      "posix",
    );
    expect(script.indexOf(`${OLLAMA_CONTEXT_BASE_URL}/api/show`)).toBeGreaterThanOrEqual(0);
    expect(script.indexOf(`${OLLAMA_CONTEXT_BASE_URL}/api/create`)).toBeGreaterThan(
      script.indexOf(`${OLLAMA_CONTEXT_BASE_URL}/api/show`),
    );
    expect(script).toContain(`curl -q --noproxy '*'`);
    expect(script).toContain("--max-time 120");
    expect(script).toContain(`"model":"${ALIAS}"`);
    expect(script).toContain(`"from":"${BASE}"`);
    expect(script).toContain('"parameters":{"num_ctx":65536},"stream":false');
    expect(script).toContain('"capabilities":\\[[^]]*"completion"');
    expect(script).toContain('"remote_(host|model)"');
    expect(script).toContain('("parameters"[[:space:]]*:[[:space:]]*"|\\\\n)');
  });

  it("never lets the command echo contain a real marker string", () => {
    const script = buildOllamaContextPreparationScript(
      { baseModel: BASE, alias: ALIAS, contextLength: 65536 },
      "posix",
    );
    for (const marker of [
      OLLAMA_CONTEXT_BEGIN_MARKER,
      OLLAMA_CONTEXT_SUCCESS_MARKER,
      OLLAMA_CONTEXT_UNREACHABLE_MARKER,
      OLLAMA_CONTEXT_SOURCE_MISSING_MARKER,
      OLLAMA_CONTEXT_SOURCE_UNSUPPORTED_MARKER,
      OLLAMA_CONTEXT_ALIAS_COLLISION_MARKER,
      OLLAMA_CONTEXT_CREATE_FAILED_MARKER,
    ]) {
      expect(script).not.toContain(marker);
    }
  });

  it("uses a bounded, non-redirecting request on Windows", () => {
    const script = buildOllamaContextPreparationScript(
      { baseModel: BASE, alias: ALIAS, contextLength: 65536 },
      "windows",
    );
    expect(script).toContain("-MaximumRedirection 0");
    expect(script).toContain("-TimeoutSec 20");
    expect(script).toContain("-TimeoutSec 120");
    expect(script).toContain("$sourceModel.remote_host");
    expect(script).toContain("$sourceModel.remote_model");
    expect(script).not.toContain(OLLAMA_CONTEXT_SUCCESS_MARKER);
  });

  it("accepts arbitrary installed ids but rejects shell-unsafe ids", () => {
    expect(() =>
      buildOllamaContextPreparationScript(
        { baseModel: "Registry.Example:5000/Team/Model:Q4", alias: ALIAS, contextLength: 32768 },
        "posix",
      ),
    ).not.toThrow();
    expect(() =>
      buildOllamaContextPreparationScript(
        { baseModel: "model;rm -rf /", alias: ALIAS, contextLength: 32768 },
        "posix",
      ),
    ).toThrow(/Invalid Ollama model id/);
  });

  it("keeps a non-preset exact num_ctx in the shell create body", () => {
    const script = buildOllamaContextPreparationScript(
      { baseModel: BASE, alias: ALIAS, contextLength: 88000 },
      "posix",
    );
    expect(script).toContain('"parameters":{"num_ctx":88000},"stream":false');
    expect(script).not.toContain("86K");
  });

  it("reports an arbitrary count exactly instead of rounding it", () => {
    const error = new OllamaContextPreparationError("create-failed", BASE, 88000);
    expect(error.message).toContain(", 88000");
    expect(error.message).not.toContain("86K");
  });

  it("builds the exact create payload with the bounded integer", () => {
    expect(
      JSON.parse(
        buildOllamaContextCreatePayload({
          alias: ALIAS,
          baseModel: BASE,
          contextLength: 81920,
        }),
      ),
    ).toEqual({
      model: ALIAS,
      from: BASE,
      parameters: { num_ctx: 81920 },
      stream: false,
    });
  });
});

describe("startOllamaContextPreparation", () => {
  beforeEach(() => {
    mocks.startShell.mockReset().mockResolvedValue(undefined);
    mocks.writeScript.mockReset().mockReturnValue(() => undefined);
    mocks.disposeSession.mockReset();
    mocks.closeThread.mockReset().mockResolvedValue(undefined);
  });

  it("passes the exact selected remote owner through start and watcher routing", () => {
    const remoteProject = project({
      remoteServerId: "selected-connection",
      location: { kind: "posix", path: "~", remoteServerId: "stale-owner" },
    });
    start(undefined, { project: remoteProject, remoteServerId: "selected-connection" });

    expect(mocks.startShell).toHaveBeenCalledWith(
      expect.objectContaining({
        startInHome: true,
        projectLocation: expect.objectContaining({ remoteServerId: "selected-connection" }),
      }),
    );
    expect(mocks.writeScript.mock.calls[0]?.[5]).toBe("selected-connection");
  });

  it("uses PowerShell explicitly for native Windows hosts", () => {
    start(undefined, { project: project({ location: { kind: "windows", path: "." } }) });
    expect(mocks.startShell).toHaveBeenCalledWith(
      expect.objectContaining({ windowsShellRuntime: "powershell" }),
    );
  });

  it("ignores marker strings in the command echo and trusts only post-begin output", () => {
    const { onComplete } = start();
    const handlers = outputHandlers();

    handlers.onOutput(
      `echo '... ${OLLAMA_CONTEXT_SUCCESS_MARKER} ... ${OLLAMA_CONTEXT_SOURCE_MISSING_MARKER}'\r\n`,
    );
    handlers.onOutput(`${OLLAMA_CONTEXT_BEGIN_MARKER}\r\n`);
    handlers.onOutput(`${OLLAMA_CONTEXT_SOURCE_MISSING_MARKER}\r\n`);
    handlers.onCommandCompletion!(1, "marker");

    expect(onComplete).toHaveBeenCalledExactlyOnceWith({
      status: "failed",
      reason: "source-missing",
      exitCode: 1,
      detail: expect.stringContaining(OLLAMA_CONTEXT_SOURCE_MISSING_MARKER),
    });
  });

  it("reports success only with the real success line and a zero marker exit", () => {
    const { onComplete } = start();
    const handlers = outputHandlers();

    handlers.onOutput(`${OLLAMA_CONTEXT_BEGIN_MARKER}\r\n`);
    handlers.onOutput(`${OLLAMA_CONTEXT_SUCCESS_MARKER}\r\n`);
    handlers.onCommandCompletion!(0, "marker");

    expect(onComplete).toHaveBeenCalledExactlyOnceWith({ status: "success", alias: ALIAS });
  });

  it("recovers the alias from an authoritative reconnect snapshot", () => {
    const { onComplete } = start();
    const handlers = outputHandlers();

    handlers.onSnapshot?.({
      data: `$ command echo\r\n${OLLAMA_CONTEXT_BEGIN_MARKER}\r\n${OLLAMA_CONTEXT_SUCCESS_MARKER}\r\n`,
    });
    handlers.onCommandCompletion!(0, "marker");

    expect(onComplete).toHaveBeenCalledExactlyOnceWith({ status: "success", alias: ALIAS });
  });

  it("recovers a success marker from a snapshot whose begin line scrolled away", () => {
    const { onComplete } = start();
    const handlers = outputHandlers();

    handlers.onSnapshot?.({
      data: `retained tail without the begin line\r\n${OLLAMA_CONTEXT_SUCCESS_MARKER}\r\n`,
    });
    handlers.onCommandCompletion!(0, "marker");

    expect(onComplete).toHaveBeenCalledExactlyOnceWith({ status: "success", alias: ALIAS });
  });

  it("does not report success on exit zero without the emitted success marker", () => {
    const { onComplete } = start();
    const handlers = outputHandlers();

    handlers.onOutput(`${OLLAMA_CONTEXT_BEGIN_MARKER}\r\n`);
    handlers.onCommandCompletion!(0, "exit");

    expect(onComplete).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ status: "failed", exitCode: 0 }),
    );
  });

  it("maps a protected-alias collision to a refusal", () => {
    const { onComplete } = start();
    const handlers = outputHandlers();

    handlers.onOutput(`${OLLAMA_CONTEXT_BEGIN_MARKER}\r\n`);
    handlers.onOutput(`${OLLAMA_CONTEXT_ALIAS_COLLISION_MARKER}\r\n`);
    handlers.onCommandCompletion!(1, "marker");

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", reason: "alias-collision" }),
    );
  });

  it("maps an unreachable host and an unsupported source distinctly", () => {
    const unreachable = start();
    const first = outputHandlers();
    first.onOutput(`${OLLAMA_CONTEXT_BEGIN_MARKER}\r\n`);
    first.onOutput(`${OLLAMA_CONTEXT_UNREACHABLE_MARKER}\r\n`);
    first.onCommandCompletion!(1, "marker");
    expect(unreachable.onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "unreachable" }),
    );

    mocks.writeScript.mockClear();
    const unsupported = start();
    const second = outputHandlers();
    second.onOutput(`${OLLAMA_CONTEXT_BEGIN_MARKER}\r\n`);
    second.onOutput(`${OLLAMA_CONTEXT_SOURCE_UNSUPPORTED_MARKER}\r\n`);
    second.onCommandCompletion!(1, "marker");
    expect(unsupported.onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "source-unsupported" }),
    );
  });

  it("bounds a hung host instead of leaving preparation pending forever", async () => {
    mocks.startShell.mockReturnValue(new Promise<void>(() => undefined));
    const { prepareOllamaContextModel } = await import("./ollamaModelContext");
    await expect(
      prepareOllamaContextModel({
        project: project(),
        baseModel: BASE,
        alias: ALIAS,
        contextLength: 65536,
        timeoutMs: 10,
      }),
    ).rejects.toThrow(/did not finish/);
  });
});
