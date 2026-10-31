import { RequestError } from "@agentclientprotocol/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation, ThreadConfig } from "@/shared/contracts";
import { AcpStructuredSession } from "../acp/session";
import type { AcpSessionConfigSync } from "../acp/sessionConfigSync";
import { makeConfigSyncSession } from "../acp/sessionTestFixture";
import * as binaryResolver from "../binaryResolver";
import { createCommandCodeAdapter } from ".";
import {
  buildCommandCodeAcpCommand,
  commandCodeSupportsAcp,
  resolveCommandCodeAcpMode,
  resolveCommandCodePromptErrorReason,
} from "./acp";
import { buildCommandCodeArgs } from "./argv";
import { normalizeCommandCodePermissionRequest } from "./acpRequests";
import { normalizeCommandCodeSessionUpdate } from "./acpUpdates";

afterEach(() => vi.restoreAllMocks());

describe("Command Code native ACP", () => {
  const modes = ["default", "auto-accept", "plan", "dont-ask", "bypass"];

  it.each([
    [undefined, false],
    ["unknown", false],
    ["1.70.0", false],
    ["1.73.4", false],
    ["1.74.0", true],
    ["1.79.2", true],
    ["2.0.0", true],
  ])("gates native ACP for version %s", (version, supported) => {
    expect(commandCodeSupportsAcp(version)).toBe(supported);
  });

  it.each([
    ["default", "default"],
    ["auto_edit", "auto-accept"],
    ["auto-accept", "auto-accept"],
    ["dont-ask", "dont-ask"],
    ["yolo", "bypass"],
    ["never", "bypass"],
    ["bypass", "bypass"],
  ])("maps saved policy %s to ACP %s", (approvalPolicy, expected) => {
    expect(resolveCommandCodeAcpMode({ model: "", approvalPolicy }, modes)).toBe(expected);
    expect(resolveCommandCodeAcpMode({ model: "", approvalPolicy, mode: "plan" }, modes)).toBe(
      "plan",
    );
  });

  it("refuses unadvertised modes instead of silently weakening permission intent", () => {
    expect(
      resolveCommandCodeAcpMode({ model: "", approvalPolicy: "yolo" }, ["default"]),
    ).toBeUndefined();
    expect(resolveCommandCodeAcpMode({ model: "" }, modes)).toBe("default");
  });

  it.each(["rejected plan mode", "unadvertised model"])(
    "does not send a prompt after %s and retains the confirmed native config",
    async (scenario) => {
      const previous: ThreadConfig = {
        model: "deepseek/deepseek-v4.1-flash",
        effort: "low",
        mode: "agent",
        approvalPolicy: "bypass",
      };
      const { session, connection, listener } = makeConfigSyncSession({
        currentConfig: previous,
        behavior: { strictConfigSelection: true },
      });
      const native = session as unknown as {
        resolveMode: typeof resolveCommandCodeAcpMode;
        sessionConfigSync: AcpSessionConfigSync;
      };
      native.resolveMode = resolveCommandCodeAcpMode;
      native.sessionConfigSync.rememberOptions(modes, [
        {
          id: "model",
          category: "model",
          type: "select",
          currentValue: previous.model,
          options: [{ value: previous.model, name: "DeepSeek V4.1 Flash" }],
        },
      ]);
      native.sessionConfigSync.rememberCurrentMode("bypass");
      connection.setSessionMode.mockRejectedValue(new Error("native mode rejected"));
      const next: ThreadConfig =
        scenario === "rejected plan mode"
          ? { ...previous, mode: "plan" }
          : { ...previous, model: "missing-model" };
      await expect(session.startTurn("must never reach the agent", next)).rejects.toMatchObject({
        name: "AcpConfigSelectionError",
        confirmedConfig: previous,
      });
      expect(connection.setSessionMode).toHaveBeenCalledTimes(
        scenario === "rejected plan mode" ? 1 : 0,
      );
      expect(connection.prompt).not.toHaveBeenCalled();
      expect(listener.onUpdate).toHaveBeenCalledWith(expect.objectContaining({ config: previous }));
    },
  );

  it("maps native ACP policies back to terminal flags on presentation changes", () => {
    expect(buildCommandCodeArgs({ model: "", approvalPolicy: "auto-accept" }, "")).toContain(
      "auto-accept",
    );
    expect(buildCommandCodeArgs({ model: "", approvalPolicy: "bypass" }, "")).not.toContain(
      "--permission-mode",
    );
    expect(buildCommandCodeArgs({ model: "", approvalPolicy: "bypass" }, "")).toContain("--yolo");
  });

  it("uses the resolved native binary with stdio ACP and no terminal launch flags", () => {
    const location: ProjectLocation = { kind: "windows", path: "C:\\project" };
    expect(buildCommandCodeAcpCommand(location, "C:\\bin\\command-code.exe")).toMatchObject({
      command: "C:\\bin\\command-code.exe",
      args: ["acp"],
    });
  });

  it.each([undefined, "terminal"] as const)(
    "does not preallocate an ACP session for %s presentation",
    async (presentationMode) => {
      const created = vi.spyOn(AcpStructuredSession, "create");
      const adapter = createCommandCodeAdapter();
      const session = await adapter.createStructuredSession?.({
        threadId: "terminal-thread",
        projectLocation: { kind: "posix", path: "/tmp" },
        config: { model: "" },
        ...(presentationMode ? { presentationMode } : {}),
      });
      expect(session).toBeUndefined();
      expect(created).not.toHaveBeenCalled();
    },
  );

  it("creates the shared GUI session with the native mode resolver and updater suppression", async () => {
    vi.spyOn(binaryResolver, "resolveAgentBinaryPath").mockReturnValue(process.execPath);
    const fake = {
      sessionId: "native-session",
    } as unknown as AcpStructuredSession;
    const created = vi.spyOn(AcpStructuredSession, "create").mockReturnValue(fake);
    const adapter = createCommandCodeAdapter();
    expect(adapter.mcpRequiresStdioCwdProxy).toBe(true);
    const handle = await adapter.createStructuredSession?.({
      threadId: "thread-1",
      projectLocation: {
        kind: process.platform === "win32" ? "windows" : "posix",
        path: process.cwd(),
      },
      presentationMode: "gui",
      config: { model: "gpt-5.4", approvalPolicy: "yolo" },
      ...(adapter.baseSpawnEnv ? { baseSpawnEnv: adapter.baseSpawnEnv } : {}),
      mcpServers: [],
    });
    expect(handle).toBe(fake);
    expect(created.mock.calls[0]?.[0]).toMatchObject({
      args: ["acp"],
      env: { COMMANDCODE_SKIP_UPDATES: "1" },
    });
    expect(created.mock.calls[0]?.[3]).toMatchObject({
      resolveMode: resolveCommandCodeAcpMode,
      permissionRequestTransform: normalizeCommandCodePermissionRequest,
      promptErrorReason: resolveCommandCodePromptErrorReason,
      sessionUpdateTransform: normalizeCommandCodeSessionUpdate,
      behavior: { promptUsageReportsContext: false, strictConfigSelection: true },
      fsTextCapability: false,
      terminalCapability: false,
      mcpServers: [],
    });
  });
});

describe("Command Code sign-in failures", () => {
  // Captured from command-code 1.82.4 `acp` with a rejected stored key.
  const rejectedKey = new RequestError(
    -32603,
    "POST /alpha/generate → 401 error: Invalid 'Authorization' header or token.",
    { status: 401 },
  );

  it("maps a 401 prompt rejection to auth_required from its structured status", () => {
    expect(resolveCommandCodePromptErrorReason(rejectedKey)).toBe("auth_required");
    expect(
      resolveCommandCodePromptErrorReason(JSON.parse(JSON.stringify(rejectedKey)) as unknown),
    ).toBe("auth_required");
  });

  it.each<[string, unknown]>([
    [
      "insufficient credits",
      new RequestError(-32603, "POST /alpha/generate → 400", { status: 400 }),
    ],
    ["server errors", new RequestError(-32603, "POST /alpha/generate → 500", { status: 500 })],
    ["a string status", new RequestError(-32603, "401", { status: "401" })],
    ["no data", new RequestError(-32603, "Invalid 'Authorization' header or token.")],
    ["a plain error", new Error("401 Invalid 'Authorization' header or token.")],
    ["a non-object", "401"],
  ])("leaves %s without a reason", (_label, error) => {
    expect(resolveCommandCodePromptErrorReason(error)).toBeUndefined();
  });
});
