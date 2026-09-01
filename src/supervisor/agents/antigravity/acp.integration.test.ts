import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentInstanceConfig, ProjectLocation } from "@/shared/contracts";
import { createAntigravityAdapter } from ".";
import { ANTIGRAVITY_ACP_SESSION_BEHAVIOR, createAntigravityAcpRuntime } from "./acp";

const FIXTURE = fileURLToPath(new URL("../acp/fixtures/fake-acp-agent.mjs", import.meta.url));
const roots: string[] = [];

function projectLocation(): ProjectLocation {
  return process.platform === "win32"
    ? { kind: "windows", path: process.cwd() }
    : { kind: "posix", path: process.cwd() };
}

function acpInstance(env: Record<string, string> = {}): AgentInstanceConfig {
  return {
    id: "antigravity-acp",
    driver: "acp-generic",
    displayName: "Google Antigravity",
    version: "1.0.0",
    config: {
      binary: process.execPath,
      args: [FIXTURE],
      env,
      cwd: "project",
      authMode: "none",
    },
  };
}

async function waitForFile(path: string): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    try {
      await access(path);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error(`Timed out waiting for ${path}`);
}

function listener() {
  return {
    onClose: vi.fn<() => void>(),
    onError: vi.fn<(message: string) => void>(),
    onUpdate: vi.fn<(update: unknown) => void>(),
    onRuntimeEvent: vi.fn<(event: unknown) => void>(),
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Antigravity official ACP runtime", () => {
  it("probes server-owned modes/models/resume without synthesizing a permission picker", async () => {
    const adapter = createAntigravityAcpRuntime(
      acpInstance({
        FAKE_MODELS: "gemini-pro,gemini-flash",
        FAKE_SESSION_RESUME_CAPABILITY: "1",
      }),
    )!;

    const status = await adapter.detectInstall?.({
      envKind: process.platform === "win32" ? "windows" : "posix",
    });
    const gui = status?.capabilities;

    expect(status).toMatchObject({
      installed: true,
      version: "1.0.0",
    });
    expect(gui?.models.map((model) => model.id)).toEqual(["gemini-pro", "gemini-flash"]);
    expect(gui?.modes).toEqual(["agent"]);
    expect(gui?.approvalPolicies).toEqual([{ id: "default", label: "Default" }]);
    expect(gui?.supportsResume).toBe(true);
  }, 70_000);

  it("creates, resumes, cancels, and cleans up Chat through the shared ACP session", async () => {
    const root = await mkdtemp(join(tmpdir(), "poracode-antigravity-acp-session-"));
    roots.push(root);
    const resumeMarker = join(root, "resume.txt");
    const promptMarker = join(root, "prompt.txt");
    const cancelMarker = join(root, "cancel.txt");
    const adapter = createAntigravityAdapter(
      acpInstance({
        FAKE_SESSION_RESUME_CAPABILITY: "1",
        FAKE_SESSION_OPEN_MARKER: resumeMarker,
        FAKE_HANG_PROMPT: "1",
        FAKE_PROMPT_MARKER: promptMarker,
        FAKE_CANCEL_MARKER: cancelMarker,
      }),
    );
    const sessionRef = {
      providerSessionId: "existing-antigravity-session",
      discoveredAt: new Date().toISOString(),
    };
    const session = await adapter.createStructuredSession?.({
      threadId: "antigravity-thread",
      projectLocation: projectLocation(),
      config: { model: "gemini-pro" },
      sessionRef,
      presentationMode: "gui",
      baseSpawnEnv: { FAKE_BASE_ENV: "preserved" },
    });
    expect(session).toBeDefined();
    expect((session as unknown as { behavior: unknown }).behavior).toEqual(
      ANTIGRAVITY_ACP_SESSION_BEHAVIOR,
    );
    session!.setListener(listener());

    try {
      await session!.activate?.();
      await expect(session!.openThread?.({ model: "gemini-pro" }, sessionRef)).resolves.toBe(
        sessionRef.providerSessionId,
      );
      expect(await readFile(resumeMarker, "utf8")).toBe("session/resume");

      const turn = session!.startTurn?.("hello", { model: "gemini-pro" });
      await waitForFile(promptMarker);
      await session!.interruptTurn?.();
      await turn;
      expect(await readFile(cancelMarker, "utf8")).toBe("fake-session-1");
    } finally {
      await session!.dispose();
    }
  }, 30_000);

  it("goes idle at the background-wait stderr signal while the prompt stays held", async () => {
    // agy_acp_server keeps session/prompt unresolved while background tasks
    // run (STATE_WAITING_FOR_TASKS); the fixture reproduces the captured wire:
    // background command + reply + stderr diagnostic, then a late terminal
    // tool_call_update and end_turn.
    const adapter = createAntigravityAcpRuntime(acpInstance({ FAKE_BACKGROUND_HOLD_MS: "1500" }))!;
    const session = await adapter.createStructuredSession?.({
      threadId: "antigravity-bg-hold",
      projectLocation: projectLocation(),
      config: { model: "gemini-pro" },
      presentationMode: "gui",
    });
    expect(session).toBeDefined();
    const sessionListener = listener();
    session!.setListener(sessionListener);

    try {
      await session!.activate?.();
      await session!.openThread?.({ model: "gemini-pro" });
      const turn = session!.startTurn?.("run the server in the background", {
        model: "gemini-pro",
      });

      // The thread must go idle on the stderr signal, well before the held
      // prompt resolves — and the turn must complete exactly once.
      await vi.waitFor(
        () => {
          expect(sessionListener.onUpdate).toHaveBeenCalledWith({
            status: "idle",
            attention: "none",
          });
        },
        { timeout: 5_000 },
      );
      const completedTurns = () =>
        sessionListener.onRuntimeEvent.mock.calls
          .map(([event]) => event as { type?: string })
          .filter((event) => event.type === "turn.completed");
      expect(completedTurns()).toHaveLength(1);

      await turn;
      expect(completedTurns()).toHaveLength(1);
      // The background command row received its late terminal update.
      expect(sessionListener.onRuntimeEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "item.completed",
          payload: expect.objectContaining({ status: "success" }),
        }),
      );
    } finally {
      await session!.dispose();
    }
  }, 30_000);

  it("captures Antigravity diagnostics without flooding the parent console", async () => {
    const stderrMarker = "ANTIGRAVITY_CUMULATIVE_STREAM";
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const adapter = createAntigravityAcpRuntime(acpInstance({ FAKE_STDERR_TEXT: stderrMarker }))!;
    const session = await adapter.createStructuredSession?.({
      threadId: "antigravity-stderr",
      projectLocation: projectLocation(),
      config: { model: "gemini-pro" },
      presentationMode: "gui",
    });
    expect(session).toBeDefined();

    try {
      await vi.waitFor(() =>
        expect((session as unknown as { stderrChunks: string[] }).stderrChunks.join("")).toContain(
          stderrMarker,
        ),
      );
      expect(consoleLog).not.toHaveBeenCalledWith(
        "[acp stderr]",
        expect.stringContaining(stderrMarker),
      );
    } finally {
      await session!.dispose();
      consoleLog.mockRestore();
    }
  });
});
