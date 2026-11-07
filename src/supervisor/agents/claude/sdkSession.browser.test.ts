import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  McpSetServersResult,
  SDKMessage,
  SDKUserMessage,
  query,
  resolveSettings,
} from "@anthropic-ai/claude-agent-sdk";
import type { ResolvedMcpServer, RuntimeEvent, ThreadConfig } from "@/shared/contracts";
import type { CreateStructuredSessionInput } from "../base";
import { ClaudeSdkSession } from "./sdkSession";
import {
  assistantMessage,
  createClaudeTestQuery,
  flushSdkMessages,
  resultMessage,
} from "./sdkSessionTestHarness";

const sdk = vi.hoisted(() => ({
  query: vi.fn<typeof query>(),
  resolveSettings: vi
    .fn<typeof resolveSettings>()
    .mockResolvedValue({ effective: {}, provenance: {}, sources: [] }),
}));
vi.mock("@anthropic-ai/claude-agent-sdk", () => sdk);
vi.mock("../binaryResolver", () => ({ resolveAgentBinaryPath: () => "/mock/claude" }));

const config: ThreadConfig = { model: "sonnet" };
const chrome: ResolvedMcpServer = {
  id: "chrome",
  name: "chrome",
  transport: {
    type: "http",
    url: "http://127.0.0.1:12345/mcp?threadId=browser-test",
    headers: { Authorization: "Bearer fixture" },
  },
  timeoutMs: 30_000,
};
const sessions: ClaudeSdkSession[] = [];

async function createSession(input: Partial<CreateStructuredSessionInput> = {}) {
  const fake = createClaudeTestQuery();
  const setMcpServers = vi.fn<ReturnType<typeof query>["setMcpServers"]>().mockResolvedValue({
    added: [],
    removed: [],
    errors: {},
  });
  const reconnectMcpServer = vi
    .fn<ReturnType<typeof query>["reconnectMcpServer"]>()
    .mockResolvedValue(undefined);
  Object.assign(fake.runtime, { setMcpServers, reconnectMcpServer });
  sdk.query.mockReturnValue(fake.runtime);
  const session = await ClaudeSdkSession.create({
    threadId: "browser-test",
    projectLocation: { kind: "posix", path: "/fixture" },
    config,
    presentationMode: "gui",
    ...input,
  });
  sessions.push(session);
  const sessionId = await session.openThread(input.config ?? config);
  const queryInput = sdk.query.mock.calls.at(-1)![0];
  return { session, sessionId, fake, setMcpServers, reconnectMcpServer, queryInput };
}

afterEach(async () => {
  for (const session of sessions.splice(0)) await session.dispose();
  vi.clearAllMocks();
  sdk.resolveSettings.mockReset().mockResolvedValue({ effective: {}, provenance: {}, sources: [] });
});

describe("Claude SDK browser access", () => {
  it.each(["environment", "native settings"])(
    "retains initial MCP tools with ToolSearch disabled through %s",
    async (source) => {
      sdk.resolveSettings.mockResolvedValueOnce({
        effective: source === "native settings" ? { env: { ENABLE_TOOL_SEARCH: "false" } } : {},
        provenance: {},
        sources: [],
      });
      const h = await createSession({
        mcpServers: [chrome],
        ...(source === "environment" ? { env: { ENABLE_TOOL_SEARCH: "false" } } : {}),
      });
      expect(h.queryInput.options?.mcpServers).toHaveProperty("chrome");
      h.fake.output.write({
        type: "system",
        subtype: "init",
        session_id: h.sessionId,
      } as unknown as SDKMessage);
      await flushSdkMessages();
      expect(h.setMcpServers).not.toHaveBeenCalled();
    },
  );

  it("streams a reply while initial MCP connection is still pending", async () => {
    const h = await createSession({
      mcpServers: [chrome],
      resolveMcpServersForTurn: async () => [chrome],
    });
    const connected = Promise.withResolvers<McpSetServersResult>();
    h.setMcpServers.mockReturnValueOnce(connected.promise);
    const onRuntimeEvent = vi.fn<(event: RuntimeEvent) => void>();
    h.session.setListener({
      onUpdate: vi.fn<() => void>(),
      onRuntimeEvent,
      onClose: vi.fn<() => void>(),
      onError: vi.fn<() => void>(),
    });
    expect(h.queryInput.options?.mcpServers).toBeUndefined();
    const inputs = (h.queryInput.prompt as AsyncIterable<SDKUserMessage>)[Symbol.asyncIterator]();
    await h.session.startTurn("Reply without tools", config);
    await inputs.next();
    expect(h.setMcpServers).not.toHaveBeenCalled();
    h.fake.output.write({
      type: "system",
      subtype: "init",
      session_id: h.sessionId,
    } as unknown as SDKMessage);
    await flushSdkMessages();
    expect(h.setMcpServers).toHaveBeenCalledOnce();
    h.fake.output.write(assistantMessage(h.sessionId, "fast-reply"));
    h.fake.output.write(resultMessage(h.sessionId));
    await flushSdkMessages();
    expect(onRuntimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "content.delta", delta: "fast-reply" }),
    );
    expect(onRuntimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "turn.completed" }),
    );
    await h.session.startTurn("Another reply without tools", config);
    expect((await inputs.next()).value.message.content).toBe("Another reply without tools");
    connected.resolve({ added: ["chrome"], removed: [], errors: {} });
    await flushSdkMessages();
  });

  it("does not apply MCP or sandbox controls after Stop during server resolution", async () => {
    const resolved = Promise.withResolvers<readonly ResolvedMcpServer[]>();
    const resolve = vi
      .fn<NonNullable<CreateStructuredSessionInput["resolveMcpServersForTurn"]>>()
      .mockReturnValue(resolved.promise);
    const h = await createSession({ resolveMcpServersForTurn: resolve });
    const start = h.session.startTurn("Cancelled launch", {
      ...config,
      approvalPolicy: "bypassPermissions",
    });
    await vi.waitFor(() => expect(resolve).toHaveBeenCalledOnce());
    await h.session.interruptTurn();
    resolved.resolve([chrome]);
    await start;
    expect(h.setMcpServers).not.toHaveBeenCalled();
    expect(h.fake.setPermissionMode).not.toHaveBeenCalled();
    expect(h.fake.applyFlagSettings).not.toHaveBeenCalled();
  });

  it("waits for Chrome connection before admitting a native steer", async () => {
    const connected = Promise.withResolvers<McpSetServersResult>();
    const resolve = vi
      .fn<NonNullable<CreateStructuredSessionInput["resolveMcpServersForTurn"]>>()
      .mockResolvedValue([]);
    const h = await createSession({ resolveMcpServersForTurn: resolve });
    h.fake.output.write({
      type: "system",
      subtype: "init",
      session_id: h.sessionId,
      capabilities: ["interrupt_cancel_queued_v1"],
    } as unknown as SDKMessage);
    await flushSdkMessages();
    const inputs = (h.queryInput.prompt as AsyncIterable<SDKUserMessage>)[Symbol.asyncIterator]();
    await h.session.startTurn("First turn", config);
    await inputs.next();
    resolve.mockResolvedValue([chrome]);
    h.setMcpServers.mockReturnValueOnce(connected.promise);
    const delivered = vi.fn<(result: IteratorResult<SDKUserMessage>) => void>();
    const next = inputs.next().then(delivered);
    const steer = h.session.steerTurn("Use Chrome during this turn", config);
    await vi.waitFor(() => expect(h.setMcpServers).toHaveBeenCalledOnce());
    expect(delivered).not.toHaveBeenCalled();
    connected.resolve({ added: ["chrome"], removed: [], errors: {} });
    await steer;
    await next;
    expect(delivered.mock.calls[0]![0].value.message.content).toBe("Use Chrome during this turn");
  });

  it("cancels a native steer while its MCP resolution is pending", async () => {
    const resolved = Promise.withResolvers<readonly ResolvedMcpServer[]>();
    const resolve = vi
      .fn<NonNullable<CreateStructuredSessionInput["resolveMcpServersForTurn"]>>()
      .mockResolvedValue([]);
    const h = await createSession({ resolveMcpServersForTurn: resolve });
    h.fake.output.write({
      type: "system",
      subtype: "init",
      session_id: h.sessionId,
      capabilities: ["interrupt_cancel_queued_v1"],
    } as unknown as SDKMessage);
    await flushSdkMessages();
    const inputs = (h.queryInput.prompt as AsyncIterable<SDKUserMessage>)[Symbol.asyncIterator]();
    await h.session.startTurn("First turn", config);
    await inputs.next();
    resolve.mockReturnValueOnce(resolved.promise);
    const steer = h.session.steerTurn("Cancelled browser steer", config);
    await vi.waitFor(() => expect(resolve).toHaveBeenCalledTimes(2));
    await h.session.interruptTurn();
    resolved.resolve([chrome]);
    await steer;
    expect(h.setMcpServers).not.toHaveBeenCalled();
    await h.session.startTurn("After Stop", config);
    expect((await inputs.next()).value.message.content).toBe("After Stop");
  });

  it("keeps a retry out of the prompt stream until the failed server reconnects", async () => {
    const h = await createSession({ resolveMcpServersForTurn: async () => [chrome] });
    h.setMcpServers.mockResolvedValueOnce({
      added: [],
      removed: [],
      errors: { chrome: "connection refused" },
    });
    await expect(h.session.startTurn("First failure", config)).rejects.toThrow(
      "Could not connect MCP servers: chrome",
    );
    h.reconnectMcpServer.mockRejectedValueOnce(new Error("still disconnected"));
    await expect(h.session.startTurn("Failed reconnect", config)).rejects.toThrow(
      "Could not connect MCP servers: chrome",
    );
    await h.session.startTurn("Connected retry", config);
    const inputs = (h.queryInput.prompt as AsyncIterable<SDKUserMessage>)[Symbol.asyncIterator]();
    expect((await inputs.next()).value.message.content).toBe("Connected retry");
    expect(h.reconnectMcpServer).toHaveBeenCalledTimes(2);
  });

  it("connects newly enabled Chrome before delivering input to an existing session", async () => {
    const connected = Promise.withResolvers<McpSetServersResult>();
    const resolveMcpServersForTurn = vi
      .fn<NonNullable<CreateStructuredSessionInput["resolveMcpServersForTurn"]>>()
      .mockResolvedValue([chrome]);
    // A saved thread from before Chrome was enabled has no chromeMcp flag or server.
    const h = await createSession({ resolveMcpServersForTurn });
    h.setMcpServers.mockReturnValueOnce(connected.promise);
    const prompt = (h.queryInput.prompt as AsyncIterable<SDKUserMessage>)[Symbol.asyncIterator]();
    const delivered = vi.fn<(result: IteratorResult<SDKUserMessage>) => void>();
    const next = prompt.next().then(delivered);
    const start = h.session.startTurn("Use Chrome", config);
    await flushSdkMessages();
    expect(h.setMcpServers).toHaveBeenCalledExactlyOnceWith({
      chrome: { ...chrome.transport, timeout: chrome.timeoutMs },
    });
    expect(delivered).not.toHaveBeenCalled();
    connected.resolve({ added: ["chrome"], removed: [], errors: {} });
    await start;
    await next;
    expect(delivered.mock.calls[0]![0].value.message.content).toBe("Use Chrome");

    h.fake.output.write(resultMessage(h.sessionId));
    await flushSdkMessages();
    await h.session.startTurn("Use Chrome again", config);
    expect(h.setMcpServers).toHaveBeenCalledTimes(1);
    expect(sdk.query).toHaveBeenCalledOnce();

    resolveMcpServersForTurn.mockResolvedValue([]);
    h.fake.output.write(resultMessage(h.sessionId));
    await flushSdkMessages();
    await h.session.startTurn("Chrome is disabled", config);
    expect(h.setMcpServers).toHaveBeenLastCalledWith({});
  });

  it("does not deliver a browser prompt after a failed connection and retries on the next turn", async () => {
    const h = await createSession({ resolveMcpServersForTurn: async () => [chrome] });
    h.setMcpServers.mockResolvedValueOnce({
      added: [],
      removed: [],
      errors: { chrome: "connection refused" },
    });
    await expect(h.session.startTurn("Failed browser prompt", config)).rejects.toThrow(
      "Could not connect MCP servers: chrome",
    );
    await h.session.startTurn("Retry browser prompt", config);
    expect(h.setMcpServers).toHaveBeenCalledTimes(2);
    expect(h.reconnectMcpServer).toHaveBeenCalledExactlyOnceWith("chrome");
    const prompt = (h.queryInput.prompt as AsyncIterable<SDKUserMessage>)[Symbol.asyncIterator]();
    expect((await prompt.next()).value.message.content).toBe("Retry browser prompt");
  });

  it("switches an initially ordinary session to Bypass and back without replacing the query", async () => {
    const ordinary: ThreadConfig = { ...config, approvalPolicy: "default" };
    const bypass: ThreadConfig = { ...config, approvalPolicy: "bypassPermissions" };
    const h = await createSession({ config: ordinary });
    expect(h.queryInput.options).toMatchObject({
      permissionMode: "default",
      allowDangerouslySkipPermissions: true,
    });
    expect(h.queryInput.options).not.toHaveProperty("sandbox");
    const inputs = (h.queryInput.prompt as AsyncIterable<SDKUserMessage>)[Symbol.asyncIterator]();

    await h.session.startTurn("Use ordinary permissions", ordinary);
    expect((await inputs.next()).value.message.content).toBe("Use ordinary permissions");
    expect(h.fake.setPermissionMode).not.toHaveBeenCalled();
    h.fake.output.write(resultMessage(h.sessionId));
    await flushSdkMessages();

    await h.session.startTurn("Launch Chromium in Bypass", bypass);
    expect(h.fake.setPermissionMode).toHaveBeenNthCalledWith(1, "bypassPermissions");
    expect(h.fake.applyFlagSettings).toHaveBeenCalledWith({ sandbox: { enabled: false } });
    expect((await inputs.next()).value.message.content).toBe("Launch Chromium in Bypass");
    h.fake.output.write(resultMessage(h.sessionId));
    await flushSdkMessages();

    await h.session.startTurn("Restore ordinary permissions", ordinary);
    expect(h.fake.setPermissionMode).toHaveBeenNthCalledWith(2, "default");
    expect(h.fake.applyFlagSettings).toHaveBeenCalledWith({ sandbox: null });
    expect((await inputs.next()).value.message.content).toBe("Restore ordinary permissions");
    expect(sdk.query).toHaveBeenCalledOnce();
  });

  it("overrides an inherited sandbox only in Bypass and restores it when leaving Bypass", async () => {
    const bypass: ThreadConfig = { ...config, approvalPolicy: "bypassPermissions" };
    const h = await createSession({ config: bypass });
    expect(h.queryInput.options).toMatchObject({
      settingSources: ["user", "project", "local"],
    });
    expect(h.queryInput.options).not.toHaveProperty("sandbox");
    await h.session.startTurn("Launch Chromium", bypass);
    expect(h.fake.setPermissionMode).toHaveBeenCalledExactlyOnceWith("bypassPermissions");
    expect(h.fake.applyFlagSettings).toHaveBeenCalledWith({ sandbox: { enabled: false } });
    expect(h.fake.setPermissionMode.mock.invocationCallOrder[0]).toBeLessThan(
      h.fake.applyFlagSettings.mock.invocationCallOrder[0]!,
    );
    h.fake.output.write(resultMessage(h.sessionId));
    await flushSdkMessages();
    await h.session.startTurn("Use ordinary permissions", config);
    expect(h.fake.applyFlagSettings).toHaveBeenCalledWith({ sandbox: null });
    h.fake.output.write(resultMessage(h.sessionId));
    await flushSdkMessages();
    await h.session.startTurn("Use Bypass again", bypass);
    expect(h.fake.applyFlagSettings).toHaveBeenCalledWith({ sandbox: { enabled: false } });
  });

  it("confirms an initial Bypass choice before overriding the sandbox or admitting input", async () => {
    const bypass: ThreadConfig = { ...config, approvalPolicy: "bypassPermissions" };
    const h = await createSession({ config: bypass });
    expect(h.queryInput.options).not.toHaveProperty("sandbox");
    h.fake.setPermissionMode.mockRejectedValueOnce(new Error("Bypass disabled by settings"));
    await expect(h.session.startTurn("Refused Bypass launch", bypass)).rejects.toThrow(
      "Bypass disabled by settings",
    );
    expect(h.fake.applyFlagSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ sandbox: expect.anything() }),
    );

    await h.session.startTurn("Retry after permission confirmation", bypass);
    const inputs = (h.queryInput.prompt as AsyncIterable<SDKUserMessage>)[Symbol.asyncIterator]();
    expect((await inputs.next()).value.message.content).toBe("Retry after permission confirmation");
    expect(h.fake.setPermissionMode).toHaveBeenCalledTimes(2);
    expect(sdk.query).toHaveBeenCalledOnce();
  });

  it.each([
    ["default", "bypassPermissions"],
    ["bypassPermissions", "default"],
  ])("does not change the sandbox or deliver input when %s → %s is refused", async (from, to) => {
    const selected: ThreadConfig = { ...config, approvalPolicy: to };
    const h = await createSession({ config: { ...config, approvalPolicy: from } });
    const inputs = (h.queryInput.prompt as AsyncIterable<SDKUserMessage>)[Symbol.asyncIterator]();
    const delivered = vi.fn<(result: IteratorResult<SDKUserMessage>) => void>();
    const next = inputs.next().then(delivered);
    h.fake.setPermissionMode.mockRejectedValueOnce(new Error("Permission mode unavailable"));

    await expect(h.session.startTurn("Refused change", selected)).rejects.toThrow(
      "Permission mode unavailable",
    );
    expect(delivered).not.toHaveBeenCalled();
    expect(h.fake.applyFlagSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ sandbox: expect.anything() }),
    );

    await h.session.startTurn("Retry after refusal", selected);
    await next;
    expect(delivered.mock.calls[0]![0].value.message.content).toBe("Retry after refusal");
    expect(h.fake.setPermissionMode).toHaveBeenCalledTimes(2);
    expect(sdk.query).toHaveBeenCalledOnce();
  });

  it.each(["default", "auto", "acceptEdits", "dontAsk"])(
    "preserves saved sandbox settings in %s mode",
    async (approvalPolicy) => {
      const h = await createSession({ config: { ...config, approvalPolicy } });
      expect(h.queryInput.options).not.toHaveProperty("sandbox");
    },
  );

  it("disables the saved sandbox in Plan + Bypass and restores it in Plan + Auto", async () => {
    const plan = { ...config, mode: "plan" as const, approvalPolicy: "bypassPermissions" };
    const h = await createSession({ config: plan });
    expect(h.queryInput.options).not.toHaveProperty("sandbox");
    await h.session.startTurn("Plan a browser task", plan);
    expect(h.fake.applyFlagSettings).toHaveBeenCalledWith({ sandbox: { enabled: false } });
    expect(h.fake.setPermissionMode.mock.invocationCallOrder[0]).toBeLessThan(
      h.fake.applyFlagSettings.mock.invocationCallOrder[0]!,
    );
    await h.session.startTurn("Plan with native checks", { ...plan, approvalPolicy: "auto" });
    expect(h.fake.applyFlagSettings).toHaveBeenCalledWith({ sandbox: null });
  });
});
