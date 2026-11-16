import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenCode2Adapter } from ".";
import {
  CROSSAGENT_PROVIDER_SESSION_ID_ARG,
  CrossagentMcpIngress,
} from "@/supervisor/crossagentMcp/CrossagentMcpIngress";
import type { SubagentRunManager } from "@/supervisor/crossagentMcp/SubagentRunManager";

describe("OpenCode 2 Crossagents routing", () => {
  const adapter = createOpenCode2Adapter();
  const sessions: Record<string, string> = {
    ses_first: "thread-first",
    ses_second: "thread-second",
    ses_child: "thread-first",
  };
  const listRuns = vi.fn<SubagentRunManager["listRuns"]>(() => []);
  let ingress: CrossagentMcpIngress;
  let url: string;
  let token: string;

  beforeEach(async () => {
    listRuns.mockClear();
    ingress = new CrossagentMcpIngress({
      runManager: { listRuns } as unknown as SubagentRunManager,
      getSpawnableAgents: async () => [],
      resolveProviderSessionThreadId: (sessionId) => sessions[sessionId],
      resolveProviderMcpThreadId: (metadata) => {
        const sessionId = adapter.readMcpSessionId?.(metadata);
        return sessionId ? sessions[sessionId] : undefined;
      },
    });
    await ingress.start();
    const config = ingress.registerProviderSessionThread("thread-first")!;
    ingress.registerProviderSessionThread("thread-second");
    url = config.url;
    token = config.token;
  });

  afterEach(() => ingress.dispose());

  async function call(params: Record<string, unknown>) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "list_runs", arguments: {}, ...params },
      }),
    });
    return (await response.json()).result;
  }

  it("routes native Code Mode metadata independently for concurrent root and child sessions", async () => {
    const results = await Promise.all(
      ["ses_first", "ses_second", "ses_child"].map((sessionId) =>
        call({ _meta: { "ai.opencode/sessionID": sessionId } }),
      ),
    );
    expect(results.every((result) => !result.isError)).toBe(true);
    expect(listRuns.mock.calls.map(([threadId]) => threadId).toSorted()).toEqual([
      "thread-first",
      "thread-first",
      "thread-second",
    ]);
  });

  it.each([
    { _meta: { threadId: "ses_first" } },
    { arguments: { [CROSSAGENT_PROVIDER_SESSION_ID_ARG]: "ses_first" } },
  ])("preserves the previous routing shape: %j", async (params) => {
    expect((await call(params)).isError).not.toBe(true);
    expect(listRuns).toHaveBeenCalledWith("thread-first");
  });

  it.each([undefined, null, "", 42, true, {}, [], "ses_unknown"])(
    "rejects missing, malformed, or stale native identities: %j",
    async (sessionId) => {
      expect((await call({ _meta: { "ai.opencode/sessionID": sessionId } })).isError).toBe(true);
      expect(listRuns).not.toHaveBeenCalled();
    },
  );

  it("does not fall back from an explicit stale identity to another metadata identity", async () => {
    const result = await call({
      arguments: { [CROSSAGENT_PROVIDER_SESSION_ID_ARG]: "ses_unknown" },
      _meta: { "ai.opencode/sessionID": "ses_first" },
    });
    expect(result.isError).toBe(true);
    expect(listRuns).not.toHaveBeenCalled();
  });

  it("enforces the resolved parent's tool restrictions and rejects unregistered parents", async () => {
    ingress.registerProviderSessionThread("thread-first", ["list_runs"]);
    expect((await call({ _meta: { "ai.opencode/sessionID": "ses_first" } })).isError).toBe(true);
    expect((await call({ _meta: { "ai.opencode/sessionID": "ses_second" } })).isError).not.toBe(
      true,
    );
    expect(listRuns).toHaveBeenCalledExactlyOnceWith("thread-second");

    ingress.unregisterThread("thread-second");
    expect((await call({ _meta: { "ai.opencode/sessionID": "ses_second" } })).isError).toBe(true);
    expect(listRuns).toHaveBeenCalledTimes(1);
  });
});
