import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ElicitationRequest,
  Options,
  SDKMessage,
  query,
} from "@anthropic-ai/claude-agent-sdk";
import type { RuntimeEvent, ThreadServerRequestId } from "@/shared/contracts";
import type { CreateStructuredSessionInput, StructuredSessionUpdate } from "../base";
import { ClaudeSdkSession } from "./sdkSession";
import { createClaudeTestQuery, flushSdkMessages, resultMessage } from "./sdkSessionTestHarness";

const sdk = vi.hoisted(() => ({ query: vi.fn<typeof query>() }));
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({ query: sdk.query }));
vi.mock("../binaryResolver", () => ({ resolveAgentBinaryPath: () => "/mock/claude" }));
const sessions: ClaudeSdkSession[] = [];
async function createSession(input: Partial<CreateStructuredSessionInput> = {}) {
  const fake = createClaudeTestQuery();
  sdk.query.mockReturnValue(fake.runtime);
  const session = await ClaudeSdkSession.create({
    threadId: "features-test",
    projectLocation: { kind: "posix", path: "/fixture" },
    config: { model: "sonnet" },
    agentSettings: { chromeIntegration: false },
    presentationMode: "gui",
    ...input,
  });
  sessions.push(session);
  const events: RuntimeEvent[] = [];
  const updates: StructuredSessionUpdate[] = [];
  session.setListener({
    onUpdate: (update) => updates.push(update),
    onError: () => {},
    onClose: () => {},
    onRuntimeEvent: (event) => events.push(event),
  });
  const sessionId = await session.openThread(input.config ?? { model: "sonnet" });
  const options = sdk.query.mock.calls.at(-1)![0].options as Options;
  return { session, sessionId, options, events, updates, fake };
}
afterEach(async () => {
  for (const session of sessions.splice(0)) await session.dispose();
  vi.clearAllMocks();
});
const request: ElicitationRequest = {
  serverName: "fixture",
  message: "Choose a marker",
  requestedSchema: {
    type: "object",
    properties: { marker: { type: "string", enum: ["A", "B"] } },
    required: ["marker"],
  },
};
function opened(events: RuntimeEvent[]) {
  const found = events.find((event) => event.type === "request.opened");
  if (!found || found.type !== "request.opened") throw new Error("Missing input request");
  return found;
}

describe("Claude SDK native features", () => {
  it("applies declared provider settings while keeping explicit profile environment overrides", async () => {
    const h = await createSession({
      agentSettings: { chromeIntegration: false, noFlicker: true, scrollSpeed: "8" },
      env: { CLAUDE_CODE_SCROLL_SPEED: "3" },
    });
    expect(h.options.env).toMatchObject({
      CLAUDE_CODE_NO_FLICKER: "1",
      CLAUDE_CODE_SCROLL_SPEED: "3",
    });
    expect(h.options.env?.CLAUDE_CODE_USE_POWERSHELL_TOOL).toBeUndefined();
  });
  it("enables native browser access by default and keeps native settings and the default tool surface", async () => {
    const h = await createSession({
      agentSettings: {},
    });
    expect(h.options).toMatchObject({
      extraArgs: { chrome: null, "replay-user-messages": null },
      settingSources: ["user", "project", "local"],
      systemPrompt: { type: "preset", preset: "claude_code" },
    });
    expect(h.options.allowedTools).toBeUndefined();
    expect(h.options.disallowedTools).toBeUndefined();
    expect(h.options.strictMcpConfig).toBeUndefined();
    expect(h.options.maxTurns).toBeUndefined();
    expect(h.options.skills).toBeUndefined();
  });

  it("presents MCP forms, rejects an empty answer without settling, and returns the selected value once", async () => {
    const h = await createSession();
    const reply = h.options.onElicitation!(request, {
      signal: new AbortController().signal,
      requestId: "native-form",
    });
    const inputRequest = opened(h.events);
    expect(inputRequest.payload.details).toEqual({ mcpElicitation: { ...request, mode: "form" } });
    await expect(
      h.session.resolveServerRequest(inputRequest.requestId as ThreadServerRequestId, {
        action: "accept",
        content: {},
      }),
    ).rejects.toThrow("invalid value");
    expect(h.events.filter((event) => event.type === "request.resolved")).toHaveLength(0);
    await h.session.resolveServerRequest(inputRequest.requestId as ThreadServerRequestId, {
      action: "accept",
      content: { marker: "A", extra: "ignored" },
    });
    expect(await reply).toEqual({ action: "accept", content: { marker: "A" } });
    await h.session.resolveServerRequest(inputRequest.requestId as ThreadServerRequestId, {
      action: "accept",
      content: { marker: "B" },
    });
    expect(h.events.filter((event) => event.type === "request.resolved")).toHaveLength(1);
  });

  it.each(["decline", "cancel"])("returns MCP %s decisions", async (action) => {
    const h = await createSession();
    const reply = h.options.onElicitation!(request, {
      signal: new AbortController().signal,
      requestId: "native-form",
    });
    await h.session.resolveServerRequest(opened(h.events).requestId as ThreadServerRequestId, {
      action,
    });
    expect(await reply).toEqual({ action });
  });

  it("renders URL authentication and cancels unsafe URLs", async () => {
    const h = await createSession();
    const auth: ElicitationRequest = {
      serverName: "fixture",
      message: "Authorize fixture",
      mode: "url",
      url: "https://example.com/authorize",
      elicitationId: "fixture-auth",
    };
    const reply = h.options.onElicitation!(auth, {
      signal: new AbortController().signal,
      requestId: "native-auth",
    });
    expect(opened(h.events).payload.details).toEqual({ mcpElicitation: auth });
    await h.session.resolveServerRequest(opened(h.events).requestId as ThreadServerRequestId, {
      action: "accept",
    });
    expect(await reply).toEqual({ action: "accept" });
    expect(
      await h.options.onElicitation!(
        { ...auth, url: "javascript:alert(1)" },
        { signal: new AbortController().signal, requestId: "unsafe-auth" },
      ),
    ).toEqual({ action: "cancel" });
  });

  it("settles a pending MCP form exactly once on SDK abort", async () => {
    const h = await createSession();
    await h.session.startTurn("Run fixture", { model: "sonnet" });
    const controller = new AbortController();
    const reply = h.options.onElicitation!(request, {
      signal: controller.signal,
      requestId: "native-abort",
    });
    controller.abort();
    expect(await reply).toEqual({ action: "cancel" });
    expect(h.updates.at(-1)).toMatchObject({ status: "working", attention: "working" });
    await h.session.dispose();
    expect(h.events.filter((event) => event.type === "request.resolved")).toHaveLength(1);
  });

  it("keeps attention on concurrent MCP requests until the last one settles", async () => {
    const h = await createSession();
    await h.session.startTurn("Run fixture", { model: "sonnet" });
    const first = h.options.onElicitation!(request, {
      signal: new AbortController().signal,
      requestId: "first",
    });
    const controller = new AbortController();
    const second = h.options.onElicitation!(request, {
      signal: controller.signal,
      requestId: "second",
    });
    await h.session.resolveServerRequest(opened(h.events).requestId as ThreadServerRequestId, {
      action: "decline",
    });
    expect(await first).toEqual({ action: "decline" });
    expect(h.updates.at(-1)).toMatchObject({ status: "needs_reply", attention: "needs_reply" });
    controller.abort();
    expect(await second).toEqual({ action: "cancel" });
    expect(h.updates.at(-1)).toMatchObject({ status: "working", attention: "working" });
  });

  it("keeps permission attention when an MCP form settles before a pending tool approval", async () => {
    const h = await createSession();
    await h.session.startTurn("Run fixture", { model: "sonnet" });
    const form = h.options.onElicitation!(request, {
      signal: new AbortController().signal,
      requestId: "form",
    });
    const permission = h.options.canUseTool!(
      "Bash",
      { command: "pwd" },
      {
        signal: new AbortController().signal,
        toolUseID: "permission",
        requestId: "permission",
      },
    );
    await h.session.resolveServerRequest(opened(h.events).requestId as ThreadServerRequestId, {
      action: "cancel",
    });
    expect(await form).toEqual({ action: "cancel" });
    expect(h.updates.at(-1)).toMatchObject({
      status: "needs_approval",
      attention: "needs_approval",
    });
    const approval = h.events.find(
      (event) =>
        event.type === "request.opened" && event.requestType === "command_execution_approval",
    );
    if (!approval || approval.type !== "request.opened")
      throw new Error("Missing approval request");
    await h.session.resolveServerRequest(approval.requestId as ThreadServerRequestId, {
      optionId: "decline",
    });
    expect(await permission).toMatchObject({ behavior: "deny" });
    expect(h.updates.at(-1)).toMatchObject({ status: "working", attention: "working" });
  });

  it("settles matching URL auth completions once without settling another server's identical ID", async () => {
    const h = await createSession();
    const auth: ElicitationRequest = {
      serverName: "fixture",
      message: "Authorize fixture",
      mode: "url",
      url: "https://example.com/authorize",
      elicitationId: "auth",
    };
    const reply = h.options.onElicitation!(auth, {
      signal: new AbortController().signal,
      requestId: "first-auth",
    });
    const otherController = new AbortController();
    const other = h.options.onElicitation!(
      { ...auth, serverName: "other" },
      {
        signal: otherController.signal,
        requestId: "other-auth",
      },
    );
    const completion: SDKMessage = {
      type: "system",
      subtype: "elicitation_complete",
      mcp_server_name: "fixture",
      elicitation_id: "auth",
      uuid: "00000000-0000-4000-8000-000000000001",
      session_id: "fixture-session",
    };
    h.fake.output.write(completion);
    await flushSdkMessages();
    expect(await reply).toEqual({ action: "accept" });
    expect(h.events.filter((event) => event.type === "request.resolved")).toHaveLength(1);
    expect(h.updates.at(-1)).toMatchObject({ status: "needs_reply", attention: "needs_reply" });
    h.fake.output.write(completion);
    await flushSdkMessages();
    expect(h.events.filter((event) => event.type === "request.resolved")).toHaveLength(1);
    otherController.abort();
    expect(await other).toEqual({ action: "cancel" });
    expect(h.events.filter((event) => event.type === "request.resolved")).toHaveLength(2);
  });

  it.each(["Bash", "AskUserQuestion"])(
    "closes an aborted %s request and keeps attention on the remaining MCP form",
    async (toolName) => {
      const h = await createSession();
      await h.session.startTurn("Run fixture", { model: "sonnet" });
      const controller = new AbortController();
      const tool = h.options.canUseTool!(
        toolName,
        toolName === "Bash"
          ? { command: "pwd" }
          : {
              questions: [
                {
                  question: "Choose marker",
                  header: "Marker",
                  options: [
                    { label: "A", description: "Marker A" },
                    { label: "B", description: "Marker B" },
                  ],
                },
              ],
            },
        {
          signal: controller.signal,
          toolUseID: "tool",
          requestId: "tool",
        },
      );
      const firstId = opened(h.events).requestId;
      const form = h.options.onElicitation!(request, {
        signal: new AbortController().signal,
        requestId: "form",
      });
      controller.abort();
      expect(await tool).toMatchObject({ behavior: "deny" });
      expect(
        h.events.filter(
          (event) => event.type === "request.resolved" && event.requestId === firstId,
        ),
      ).toHaveLength(1);
      expect(h.updates.at(-1)).toMatchObject({ status: "needs_reply", attention: "needs_reply" });
      const remaining = h.events.find(
        (event) => event.type === "request.opened" && event.requestId !== firstId,
      );
      if (!remaining || remaining.type !== "request.opened")
        throw new Error("Missing remaining form");
      await h.session.resolveServerRequest(remaining.requestId as ThreadServerRequestId, {
        action: "decline",
      });
      expect(await form).toEqual({ action: "decline" });
      expect(h.updates.at(-1)).toMatchObject({ status: "working", attention: "working" });
    },
  );

  it.each(["stop", "dispose"])(
    "cancels pending MCP input on %s without waiting for CLI cancellation",
    async (action) => {
      const h = await createSession();
      const reply = h.options.onElicitation!(request, {
        signal: new AbortController().signal,
        requestId: "native-pending",
      });
      if (action === "stop") await h.session.interruptTurn();
      else await h.session.dispose();
      expect(await reply).toEqual({ action: "cancel" });
      expect(h.events.filter((event) => event.type === "request.resolved")).toHaveLength(1);
    },
  );

  it.each(["answer", "abort"])(
    "restores idle after a server-initiated MCP request settles via %s between turns",
    async (action) => {
      const h = await createSession();
      const controller = new AbortController();
      const reply = h.options.onElicitation!(request, {
        signal: controller.signal,
        requestId: "between-turns",
      });
      expect(h.updates.at(-1)).toMatchObject({ status: "needs_reply" });
      if (action === "answer") {
        await h.session.resolveServerRequest(opened(h.events).requestId as ThreadServerRequestId, {
          action: "accept",
          content: { marker: "A" },
        });
      } else {
        controller.abort();
      }
      await reply;
      expect(h.updates.at(-1)).toMatchObject({ status: "idle", attention: "none" });
    },
  );

  it("keeps a deferred turn working when its MCP request settles while background work is live", async () => {
    const h = await createSession();
    await h.session.startTurn("Run background fixture", { model: "sonnet" });
    h.fake.output.write({
      type: "system",
      subtype: "task_started",
      session_id: h.sessionId,
      uuid: "background-started",
      task_id: "background-task",
      tool_use_id: "background-tool",
      subagent_type: "general-purpose",
    } as unknown as SDKMessage);
    h.fake.output.write(resultMessage(h.sessionId));
    await flushSdkMessages();
    expect(h.updates.at(-1)).toMatchObject({ status: "working" });
    const reply = h.options.onElicitation!(request, {
      signal: new AbortController().signal,
      requestId: "background-form",
    });
    await h.session.resolveServerRequest(opened(h.events).requestId as ThreadServerRequestId, {
      action: "accept",
      content: { marker: "A" },
    });
    await reply;
    expect(h.updates.at(-1)).toMatchObject({ status: "working", attention: "working" });
  });

  it.each(["stop", "force-complete", "dispose"])(
    "reports the correct reason when %s cancels a pending permission",
    async (action) => {
      const h = await createSession();
      await h.session.startTurn("Run fixture", { model: "sonnet" });
      const permission = h.options.canUseTool!(
        "Bash",
        { command: "pwd" },
        {
          signal: new AbortController().signal,
          toolUseID: "pending-permission",
          requestId: "pending-permission",
        },
      );
      if (action === "stop") await h.session.interruptTurn();
      else if (action === "force-complete") h.session.forceCompleteTurn();
      else await h.session.dispose();
      expect(await permission).toMatchObject({
        behavior: "deny",
        message: action === "dispose" ? "Session closed." : "User cancelled tool execution.",
      });
    },
  );
});
