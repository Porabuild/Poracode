import { describe, expect, it } from "vitest";
import { makeConfigSyncSession } from "../acp/sessionTestFixture";
import type { AcpSessionConfigSync } from "../acp/sessionConfigSync";

const FLASH = '["deepseek-official","deepseek-v4-flash"]';
const PRO = '["deepseek-official","deepseek-v4-pro"]';

// Wire shape observed from @deepseek-ai/dsh 0.2.1-rc.2. The route strings are
// opaque ACP values, not slash-separated ids or JSON to rewrite on transport.
function configOptions(model = FLASH, effort = "high") {
  return [
    {
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: model,
      options: [
        {
          group: "deepseek-official",
          name: "DeepSeek",
          options: [
            { value: FLASH, name: "deepseek-v4-flash" },
            { value: PRO, name: "deepseek-v4-pro" },
          ],
        },
      ],
    },
    {
      id: "reasoning_effort",
      name: "Reasoning effort",
      category: "thought_level",
      type: "select",
      currentValue: effort,
      options: ["off", "low", "high", "max"].map((value) => ({ value, name: value })),
    },
  ];
}

describe("DeepSeek Harness ACP compatibility", () => {
  it("switches the exact model route and reasoning option before sending the next prompt", async () => {
    const config = {
      model: FLASH,
      effort: "high",
      mode: "agent" as const,
      approvalPolicy: "default",
    };
    const { session, connection } = makeConfigSyncSession({ currentConfig: config });
    const internals = session as unknown as { sessionConfigSync: AcpSessionConfigSync };
    internals.sessionConfigSync.rememberOptions([], configOptions());
    connection.setSessionConfigOption.mockImplementation(async ({ configId, value }) => ({
      configOptions: configId === "model" ? configOptions(value) : configOptions(PRO, value),
    }));
    await session.startTurn("DSH_FOLLOWUP", { ...config, model: PRO, effort: "low" });
    expect(
      connection.setSessionConfigOption.mock.calls.map(([value]) => [value.configId, value.value]),
    ).toEqual([
      ["model", PRO],
      ["reasoning_effort", "low"],
    ]);
    expect(connection.prompt).toHaveBeenCalledWith({
      sessionId: "session-1",
      prompt: [{ type: "text", text: "DSH_FOLLOWUP" }],
    });
  });

  it("reopens a persisted session with session/resume when session/load is absent", async () => {
    const config = { model: FLASH, effort: "high", approvalPolicy: "default" };
    const { session, connection } = makeConfigSyncSession({ currentConfig: config });
    Object.assign(session, {
      agentSessionCapabilities: { resume: {}, close: {}, list: {} },
      agentCapabilities: { loadSession: false },
    });
    connection.resumeSession.mockResolvedValue({ configOptions: configOptions() });
    expect(
      await session.openThread(config, {
        providerSessionId: "harness-persisted",
        discoveredAt: "2026-10-17T00:00:00Z",
      }),
    ).toBe("harness-persisted");
    expect(connection.resumeSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "harness-persisted" }),
    );
    expect(connection.loadSession).not.toHaveBeenCalled();
  });

  it.each(["never", "default"])(
    "honors the %s permission policy with Harness's one-shot choices",
    async (approvalPolicy) => {
      const config = { model: FLASH, mode: "agent" as const, approvalPolicy };
      const { session, connection, listener } = makeConfigSyncSession({ currentConfig: config });
      const request = {
        sessionId: "session-1",
        toolCall: { toolCallId: "dsh-tool" },
        options: [
          { optionId: "allow-once", name: "Allow once", kind: "allow_once" as const },
          { optionId: "reject-once", name: "Reject", kind: "reject_once" as const },
        ],
      };
      const pending = session.handlePermissionRequest(request);
      const opened = listener.onRuntimeEvent.mock.calls.flatMap(([event]) => {
        const value = event as { type?: string; requestId?: string };
        return value.type === "request.opened" && value.requestId ? [value.requestId] : [];
      });
      if (opened[0]) await session.resolveServerRequest(opened[0], { optionId: "reject-once" });
      expect(await pending).toEqual({
        outcome: {
          outcome: "selected",
          optionId: approvalPolicy === "never" ? "allow-once" : "reject-once",
        },
      });
      expect(opened).toHaveLength(approvalPolicy === "never" ? 0 : 1);
      expect(connection.prompt).not.toHaveBeenCalled();
    },
  );
});
