import { describe, expect, it } from "vitest";
import commandRevise from "../fixtures/contracts/command-revise.json";
import hooksList from "../fixtures/contracts/hooks-list.json";
import malformed from "../fixtures/contracts/malformed-responses.json";
import mcpServersChanged from "../fixtures/contracts/mcp-servers-changed.json";
import rename from "../fixtures/contracts/session-rename.json";
import rulesList from "../fixtures/contracts/rules-list.json";
import setConfigErrors from "../fixtures/contracts/set-config-option-errors.json";
import {
  DEVIN_ACP_CLIENT_CAPABILITY_MANIFEST,
  DEVIN_ACP_EXTENSION_METHOD_MANIFEST,
  devinAcpClientCapabilitiesMeta,
  isImplementedDevinAcpExtensionMethod,
} from "./capabilityManifest";
import {
  DEVIN_ACP_MCP_SERVERS_CHANGED_NOTIFICATION,
  parseDevinAcpExtensionNotification,
  summarizeDevinAcpNotificationParams,
} from "./notifications";
import {
  createDevinAcpSessionActions,
  devinAcpSessionActionDescriptors,
  DEVIN_ACP_METHODS,
  DEVIN_ACP_SESSION_ACTION_IDS,
  DevinAcpActionError,
  toDevinAcpActionError,
} from "./sessionActions";

/** Transport replaying recorded responses and recording outbound params. */
function transportWith(response: (method: string, params: Record<string, unknown>) => unknown) {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const transport = {
    request: async (method: string, params: Record<string, unknown>) => {
      calls.push({ method, params });
      return response(method, params);
    },
  };
  return { calls, actions: createDevinAcpSessionActions(transport) };
}

describe("Devin confirmed session actions (sanitized 3000.11.3 fixtures)", () => {
  it("renames a session and accepts the confirmed empty response", async () => {
    const { calls, actions } = transportWith(() => rename.response);
    await actions.renameSession(rename.request.sessionId, `  ${rename.request.title}  `);
    expect(calls).toEqual([{ method: DEVIN_ACP_METHODS.sessionRename, params: rename.request }]);
  });
  it("rejects empty titles and non-object rename responses with typed errors", async () => {
    const { actions } = transportWith(() => "ok");
    await expect(actions.renameSession("fixture-session", "   ")).rejects.toMatchObject({
      name: "DevinAcpActionError",
      code: 0,
    });
    await expect(actions.renameSession("fixture-session", "t")).rejects.toMatchObject({
      code: 0,
      message: "Unexpected session/rename response shape",
    });
  });
  it("revises a command and returns the agent's revision verbatim", async () => {
    const { calls, actions } = transportWith(() => commandRevise.response);
    await expect(
      actions.reviseCommand(
        commandRevise.request.sessionId,
        commandRevise.request.command,
        commandRevise.request.note,
      ),
    ).resolves.toBe(commandRevise.response.command);
    expect(calls[0]).toEqual({
      method: DEVIN_ACP_METHODS.commandRevise,
      params: commandRevise.request,
    });
  });
  it("omits an absent note and refuses malformed revise responses", async () => {
    const { calls, actions } = transportWith(() => ({}));
    await expect(actions.reviseCommand("fixture-session", "ls")).rejects.toBeInstanceOf(
      DevinAcpActionError,
    );
    expect(calls[0]?.params).toEqual({ sessionId: "fixture-session", command: "ls" });
  });
  it("lists rules with extra fields preserved and rejects malformed entries", async () => {
    const { actions } = transportWith(() => rulesList.response);
    const rules = await actions.listRules(rulesList.request.sessionId);
    expect(rules).toEqual(rulesList.response.rules);
    // Dropping a rule would hide active policy: any malformed entry fails the
    // whole action instead of silently shrinking the list.
    const messy = transportWith(() => ({
      rules: [
        rulesList.response.rules[0],
        { name: "Extra", path: "/e", future: { nested: true } },
        { name: "orphan" },
      ],
    }));
    await expect(messy.actions.listRules("fixture-session")).rejects.toMatchObject({
      code: 0,
      message: "Malformed rules/list entry at index 2",
    });
    for (const response of malformed.rulesResponses) {
      const bad = transportWith(() => response);
      await expect(bad.actions.listRules("fixture-session")).rejects.toBeInstanceOf(
        DevinAcpActionError,
      );
    }
  });
  it("rejects rule and hook lists over the entry bound instead of truncating", async () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ name: `r${i}`, path: `/${i}` }));
    const rules = transportWith(() => ({ rules: many }));
    await expect(rules.actions.listRules("fixture-session")).rejects.toMatchObject({
      code: 0,
      message: "rules/list response exceeds the entry bound",
    });
    const hooks = transportWith(() => ({ hooks: many }));
    await expect(hooks.actions.listHooks("fixture-session")).rejects.toMatchObject({
      code: 0,
      message: "hooks/list response exceeds the entry bound",
    });
    const exactlyBound = transportWith(() => ({
      rules: Array.from({ length: 200 }, (_, i) => ({ name: `r${i}`, path: `/${i}` })),
    }));
    await expect(exactlyBound.actions.listRules("fixture-session")).resolves.toHaveLength(200);
  });
  it("rejects malformed hooks/list responses instead of fabricating an empty success", async () => {
    for (const response of malformed.hooksResponses) {
      // Earlier draft fixtures incorrectly classified opaque JSON entries
      // as malformed; only the response envelope has a known schema.
      if (
        response &&
        typeof response === "object" &&
        "hooks" in response &&
        Array.isArray(response.hooks)
      )
        continue;
      const bad = transportWith(() => response);
      await expect(bad.actions.listHooks("fixture-session")).rejects.toBeInstanceOf(
        DevinAcpActionError,
      );
    }
  });
  it("rejects over-bound and oversized agent responses before reading fields", async () => {
    // A revised command is executable text: truncation could change meaning,
    // so an over-bound result fails instead of being sliced.
    const long = "x".repeat(20_001);
    const revised = transportWith(() => ({ command: long }));
    await expect(revised.actions.reviseCommand("fixture-session", "ls")).rejects.toMatchObject({
      code: 0,
      message: "Revised command exceeds the wire bound",
    });
    const longCommand = transportWith(() => ({ command: "ls" }));
    await expect(longCommand.actions.reviseCommand("fixture-session", long)).rejects.toMatchObject({
      code: 0,
      message: "Command exceeds the wire bound",
    });
    const longNote = transportWith(() => ({ command: "ls" }));
    await expect(
      longNote.actions.reviseCommand("fixture-session", "ls", "n".repeat(2_001)),
    ).rejects.toMatchObject({ code: 0, message: "Revise note exceeds the wire bound" });
    // Serialized-size bound: a rules payload past 512 KiB is rejected whole.
    const huge = transportWith(() => ({
      rules: [{ name: "r", path: `/${"x".repeat(600 * 1024)}` }],
    }));
    await expect(huge.actions.listRules("fixture-session")).rejects.toMatchObject({
      code: 0,
      message: "rules/list response exceeds the serialized bound",
    });
  });
  it("never echoes unvalidated agent payloads through typed errors", async () => {
    // Locally-detected violations carry no response content at all.
    const leakingList = transportWith(() => ({
      rules: [{ leaked: "credential-like-value" }],
    }));
    await expect(leakingList.actions.listRules("fixture-session")).rejects.toSatisfy(
      (error: unknown) => {
        const typed = error as DevinAcpActionError;
        return typed instanceof DevinAcpActionError && typed.data === undefined;
      },
    );
    // Transport error data survives only when it is bounded plain JSON —
    // the recorded -32016 session_not_found shape is preserved…
    const notFound = transportWith(() => {
      // Exercise the native structured RPC rejection, which is not an Error instance.
      // oxlint-disable-next-line typescript/only-throw-error
      throw {
        code: -32016,
        message: "Session not found",
        data: { "cognition.ai/errorKind": "session_not_found", "cognition.ai/retryable": false },
      };
    });
    await expect(notFound.actions.listHooks("fixture-session")).rejects.toMatchObject({
      code: -32016,
      data: { "cognition.ai/errorKind": "session_not_found" },
    });
    // …while non-JSON, cyclic or oversized data is dropped. Small plain-JSON
    // data is kept on purpose: recorded typed error shapes (errorKind) are
    // provider contracts, and locally-detected failures never embed response
    // content in the first place.
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    for (const data of [
      cyclic,
      { blob: "x".repeat(5 * 1024) },
      { when: new Date("2026-10-07T00:00:00Z") },
    ]) {
      const bad = transportWith(() => {
        // Exercise the native structured RPC rejection, which is not an Error instance.
        // oxlint-disable-next-line typescript/only-throw-error
        throw { code: -32000, message: "boom", data };
      });
      await expect(bad.actions.listHooks("fixture-session")).rejects.toMatchObject({
        code: -32000,
        data: undefined,
      });
    }
  });
  it("keeps populated hook entries opaque instead of guessing a schema", async () => {
    const confirmed = transportWith(() => hooksList.response);
    await expect(confirmed.actions.listHooks(hooksList.request.sessionId)).resolves.toEqual([]);
    const entries = [{ kind: "unobserved" }, null, "opaque", 5, false, ["nested", null]];
    const { actions } = transportWith(() => ({ hooks: entries }));
    const hooks = await actions.listHooks("fixture-session");
    expect(hooks).toEqual(entries);
    expect(hooks).not.toBe(entries);
  });
  it("maps JSON-RPC failures to typed errors, including the recorded -32601 answer", async () => {
    const unsupported = setConfigErrors.errors.find(
      (entry) => entry.case === "unknown extension method",
    )!;
    const { actions } = transportWith(() => {
      // Exercise the captured native JSON-RPC rejection envelope.
      // oxlint-disable-next-line typescript/only-throw-error
      throw unsupported.error;
    });
    await expect(actions.listRules("fixture-session")).rejects.toSatisfy((error: unknown) => {
      const typed = toDevinAcpActionError(error);
      return typed instanceof DevinAcpActionError && typed.unsupported && typed.code === -32601;
    });
    const { actions: failing } = transportWith(() => {
      throw new Error("transport gone");
    });
    await expect(failing.listHooks("fixture-session")).rejects.toMatchObject({
      code: 0,
      message: "transport gone",
    });
  });
});

describe("Devin extension notification parsing", () => {
  it("types the confirmed mcp/serversChanged notification", () => {
    expect(
      parseDevinAcpExtensionNotification(mcpServersChanged.method, mcpServersChanged.params),
    ).toEqual({ kind: "mcp-servers-changed", params: {} });
    expect(DEVIN_ACP_MCP_SERVERS_CHANGED_NOTIFICATION).toBe("_cognition.ai/mcp/serversChanged");
  });
  it("types the live-captured thinking_complete shape (E4 qualification turn)", () => {
    // Exact shape from tmp/devin/e4/results/local-notifications.json
    // (sessionId replaced with the owned fixture placeholder).
    expect(
      parseDevinAcpExtensionNotification("_cognition.ai/thinking_complete", {
        durationMs: 257,
        blockIndex: 0,
        sessionId: "fixture-session",
      }),
    ).toEqual({
      kind: "thinking-complete",
      sessionId: "fixture-session",
      durationMs: 257,
      blockIndex: 0,
    });
    for (const bad of [
      { blockIndex: 0, sessionId: "s" },
      { durationMs: "fast", blockIndex: 0 },
      { durationMs: 1, blockIndex: Number.NaN },
      "burst",
      null,
    ]) {
      expect(parseDevinAcpExtensionNotification("_cognition.ai/thinking_complete", bad)).toEqual({
        kind: "unknown",
        method: "_cognition.ai/thinking_complete",
      });
    }
  });
  it("types the live-captured turn_stats dimensions and rejects malformed rows", () => {
    // Bounded projection of the captured payload (dimensions shortened).
    const captured = {
      sessionId: "fixture-session",
      turnClientMessageId: "3ca8a9ff-a39a-491a-9957-938f560efc71",
      responseDimensions: [
        {
          uid: "agent_messages",
          groupTitle: "Response Statistics",
          label: "Agent messages",
          kind: {
            type: "cumulativeMetric",
            value: 3,
            prefix: "",
            tail: " message",
            pluralTail: " messages",
          },
        },
        {
          uid: "model",
          groupTitle: "Response Statistics",
          label: "Model",
          kind: { type: "metric", value: "SWE-2 Max" },
        },
      ],
    };
    const parsed = parseDevinAcpExtensionNotification("_cognition.ai/turn_stats", captured);
    // Full-shape equality keeps the expectations unconditional: a wrong kind
    // fails the match instead of branching.
    expect(parsed).toEqual({
      kind: "turn-stats",
      sessionId: "fixture-session",
      turnClientMessageId: "3ca8a9ff-a39a-491a-9957-938f560efc71",
      dimensions: [
        {
          uid: "agent_messages",
          groupTitle: "Response Statistics",
          label: "Agent messages",
          kind: {
            type: "cumulativeMetric",
            value: 3,
            prefix: "",
            tail: " message",
            pluralTail: " messages",
          },
        },
        {
          uid: "model",
          groupTitle: "Response Statistics",
          label: "Model",
          kind: { type: "metric", value: "SWE-2 Max" },
        },
      ],
    });
    // A truncated dimension list would misreport the turn → unknown, never
    // silently shrink.
    expect(
      parseDevinAcpExtensionNotification("_cognition.ai/turn_stats", {
        responseDimensions: [{ uid: "x" }, 42],
      }),
    ).toMatchObject({ kind: "unknown" });
    const tooMany = parseDevinAcpExtensionNotification("_cognition.ai/turn_stats", {
      responseDimensions: Array.from({ length: 65 }, (_, i) => ({ uid: `d${i}` })),
    });
    expect(tooMany).toMatchObject({ kind: "unknown" });
  });
  it("types the live-captured agent_stopped shape with bounded verbatim stats", () => {
    const parsed = parseDevinAcpExtensionNotification("_cognition.ai/agent_stopped", {
      sessionId: "fixture-session",
      cause: "complete",
      stats: {
        toolCalls: 2,
        filesChanged: 0,
        commandsRun: 2,
        inputTokens: 12976,
        outputTokens: 93,
        ttftMs: 1467,
        tokensPerSec: 68.33,
        totalTimeMs: 2828,
        modelLabel: "SWE-2 Max",
      },
    });
    expect(parsed).toEqual({
      kind: "agent-stopped",
      sessionId: "fixture-session",
      cause: "complete",
      stats: {
        toolCalls: 2,
        filesChanged: 0,
        commandsRun: 2,
        inputTokens: 12976,
        outputTokens: 93,
        ttftMs: 1467,
        tokensPerSec: 68.33,
        totalTimeMs: 2828,
        modelLabel: "SWE-2 Max",
      },
    });
    // Missing cause or stats is a contract violation → unknown.
    for (const bad of [{ cause: "complete" }, { stats: {} }, { cause: 7, stats: {} }]) {
      expect(parseDevinAcpExtensionNotification("_cognition.ai/agent_stopped", bad)).toMatchObject({
        kind: "unknown",
      });
    }
    // Over-bound verbatim stats is rejected, never processed.
    const huge = parseDevinAcpExtensionNotification("_cognition.ai/agent_stopped", {
      cause: "complete",
      stats: { blob: "x".repeat(80 * 1024) },
    });
    expect(huge).toMatchObject({ kind: "unknown" });
  });
  it("treats unobserved vendor notifications as unknown and foreign ones as not ours", () => {
    expect(parseDevinAcpExtensionNotification("_cognition.ai/chain/updated", { id: 1 })).toEqual({
      kind: "unknown",
      method: "_cognition.ai/chain/updated",
    });
    // Observed-but-untyped intermittent notifications parse as unknown.
    expect(parseDevinAcpExtensionNotification("_cognition.ai/processMemory", { rss: 1 })).toEqual({
      kind: "unknown",
      method: "_cognition.ai/processMemory",
    });
    expect(parseDevinAcpExtensionNotification("session/update", {})).toBeUndefined();
  });
  it("summarizes unknown params as bounded keys without values", () => {
    const params = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [`key${i}`, `secret-${i}`]),
    );
    const summary = summarizeDevinAcpNotificationParams(params);
    expect(summary).toBe(
      "{key0, key1, key2, key3, key4, key5, key6, key7, key8, key9, key10, key11, key12, key13, key14, key15, …+4}",
    );
    expect(summary).not.toContain("secret");
    expect(summarizeDevinAcpNotificationParams({})).toBe("{}");
  });
});

describe("Devin neutral session action descriptors", () => {
  it("declares the four locally-confirmed actions by default and never archive", () => {
    // Default target is local: _cognition.ai/session/archive answers -32601
    // there, so the local descriptor set must not offer it at all.
    const descriptors = devinAcpSessionActionDescriptors({
      request: async () => ({}),
    });
    expect(descriptors.map((d) => d.id)).toEqual([
      DEVIN_ACP_SESSION_ACTION_IDS.rename,
      DEVIN_ACP_SESSION_ACTION_IDS.revise,
      DEVIN_ACP_SESSION_ACTION_IDS.rules,
      DEVIN_ACP_SESSION_ACTION_IDS.hooks,
    ]);
    expect(descriptors.map((d) => d.id)).not.toContain(DEVIN_ACP_SESSION_ACTION_IDS.archive);
    // Explicit local target is identical to the default.
    const explicitLocal = devinAcpSessionActionDescriptors(
      { request: async () => ({}) },
      { target: "local" },
    );
    expect(explicitLocal.map((d) => d.id)).toEqual(descriptors.map((d) => d.id));
  });
  it("declares only the cloud-earned, activation-gated controls for target cloud", () => {
    const descriptors = devinAcpSessionActionDescriptors(
      { request: async () => ({}) },
      { target: "cloud" },
    );
    // Cloud earned exactly rename + archive (both -32002-gated until the
    // first prompt activates the session, per tmp/devin/lane-e3-result.md §B).
    expect(descriptors.map((d) => d.id)).toEqual([
      DEVIN_ACP_SESSION_ACTION_IDS.rename,
      DEVIN_ACP_SESSION_ACTION_IDS.archive,
    ]);
    // revise/rules/hooks were never qualified on the cloud relay and stay
    // undeclared rather than shipping buttons that answer -32601.
    for (const unqualified of [
      DEVIN_ACP_SESSION_ACTION_IDS.revise,
      DEVIN_ACP_SESSION_ACTION_IDS.rules,
      DEVIN_ACP_SESSION_ACTION_IDS.hooks,
    ]) {
      expect(descriptors.map((d) => d.id)).not.toContain(unqualified);
    }
  });
  it("validates payloads and injects the live session id on invoke", async () => {
    const { calls } = { calls: [] as Array<{ method: string; params: Record<string, unknown> }> };
    const descriptors = devinAcpSessionActionDescriptors({
      request: async (method, params, options) => {
        void options;
        calls.push({ method, params });
        if (method === DEVIN_ACP_METHODS.commandRevise) return commandRevise.response;
        return {};
      },
    });
    const renameAction = descriptors[0]!;
    expect(() => renameAction.validatePayload?.({})).toThrow(/title/);
    expect(() => renameAction.validatePayload?.({ title: 5 })).toThrow(/title/);
    const ctxSession = {
      threadId: "thread",
      sessionId: "fixture-session",
      signal: new AbortController().signal,
    };
    await expect(renameAction.invoke!({ title: "Fixture title" }, ctxSession)).resolves.toEqual({
      renamed: true,
    });
    expect(calls.at(-1)).toEqual({
      method: DEVIN_ACP_METHODS.sessionRename,
      params: { sessionId: "fixture-session", title: "Fixture title" },
    });
    const revise = descriptors[1]!;
    expect(() => revise.validatePayload?.({})).toThrow(/command/);
    await expect(revise.invoke!({ command: "ls", note: "probe" }, ctxSession)).resolves.toEqual({
      command: "ls -la",
    });
    expect(calls.at(-1)).toEqual({
      method: DEVIN_ACP_METHODS.commandRevise,
      params: { sessionId: "fixture-session", command: "ls", note: "probe" },
    });
  });
  it("refuses to invoke without an open ACP session and honors abort", async () => {
    const descriptors = devinAcpSessionActionDescriptors({
      request: async () => ({}),
    });
    const cloudDescriptors = devinAcpSessionActionDescriptors(
      { request: async () => ({}) },
      { target: "cloud" },
    );
    const noSession = {
      threadId: "thread",
      sessionId: undefined,
      signal: new AbortController().signal,
    };
    for (const descriptor of [...descriptors, ...cloudDescriptors]) {
      await expect(descriptor.invoke!({}, noSession)).rejects.toMatchObject({
        code: 0,
        message: "ACP session is not open",
      });
    }
    const controller = new AbortController();
    const slow = devinAcpSessionActionDescriptors({
      request: () => new Promise(() => {}),
    });
    const pending = slow[2]!.invoke!(
      {},
      { threadId: "thread", sessionId: "fixture-session", signal: controller.signal },
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("Devin ACP capability manifest", () => {
  it("declares the exact 29 negotiated client capability flags", () => {
    expect(DEVIN_ACP_CLIENT_CAPABILITY_MANIFEST).toHaveLength(29);
    const metaKeys = DEVIN_ACP_CLIENT_CAPABILITY_MANIFEST.filter((e) => !e.standard).map(
      (e) => e.wireKey,
    );
    expect(metaKeys).toHaveLength(24);
    for (const key of metaKeys) expect(key.startsWith("cognition.ai/")).toBe(true);
    // Spot-check the bisected mappings (tmp/devin/acp-contracts.md §2).
    expect(
      Object.fromEntries(DEVIN_ACP_CLIENT_CAPABILITY_MANIFEST.map((e) => [e.flag, e.wireKey])),
    ).toMatchObject({
      subagents: "cognition.ai/subagentSupport",
      subagent_control: "cognition.ai/subagentControl",
      grouped_options: "cognition.ai/groupedSessionConfigOptions",
      raw_ref_tags: "cognition.ai/refTagsRaw",
      local_tools: "cognition.ai/localTools",
    });
  });
  it("advertises only implemented behavior and never the full flag set", () => {
    const meta = devinAcpClientCapabilitiesMeta();
    expect(meta).toEqual({
      "cognition.ai/subagentSupport": true,
      "cognition.ai/partialContent": true,
      "cognition.ai/messageGrouping": true,
      "cognition.ai/groupedSessionConfigOptions": true,
    });
    const disabled = DEVIN_ACP_CLIENT_CAPABILITY_MANIFEST.filter((e) => e.state === "disabled");
    for (const entry of disabled) {
      expect(entry.disabledReason).toBeTruthy();
      expect(Object.keys(meta)).not.toContain(entry.wireKey);
    }
    expect(devinAcpClientCapabilitiesMeta()).not.toHaveProperty("cognition.ai/subagentControl");
  });
  it("keeps unimplemented extension methods honestly unimplemented", () => {
    const implemented = DEVIN_ACP_EXTENSION_METHOD_MANIFEST.filter(
      (e) => e.status === "implemented",
    ).map((e) => e.method);
    expect(implemented).toEqual([
      "_cognition.ai/session/rename",
      "_cognition.ai/command/revise",
      "_cognition.ai/rules/list",
      "_cognition.ai/hooks/list",
      "_cognition.ai/session/archive",
      "_cognition.ai/request_diagnostics",
    ]);
    for (const entry of DEVIN_ACP_EXTENSION_METHOD_MANIFEST) {
      expect(entry.method.startsWith("_cognition.ai/")).toBe(true);
      expect(isImplementedDevinAcpExtensionMethod(entry.method)).toBe(
        entry.status === "implemented",
      );
    }
    expect(isImplementedDevinAcpExtensionMethod("_cognition.ai/probeNonexistent")).toBe(false);
    expect(
      DEVIN_ACP_EXTENSION_METHOD_MANIFEST.find(
        (e) => e.evidence === "inferred" && e.status === "implemented",
      ),
    ).toBeUndefined();
  });
});

describe("Devin cloud session archive (live-qualified 3000.11.3)", () => {
  /**
   * Recorded live response from `_cognition.ai/session/archive` on an owned,
   * activated cloud session (tmp/devin/e3/results/cloud-activate-archive.json),
   * sanitized: user/org identifiers and session id replaced with placeholders.
   */
  const archiveResponse = {
    sessionId: "devin-owned-fixture",
    status: "running",
    is_archived: true,
    childSessionIds: [],
    closedPrs: [],
    _meta: {
      "cognition.ai/createdAt": "2026-10-07T16:13:16.111133+00:00",
      "cognition.ai/creatorUserId": "user-placeholder",
      "cognition.ai/url": "https://app.devin.ai/sessions/placeholder",
      "cognition.ai/orgId": "org-placeholder",
      "cognition.ai/sessionStatus": "running",
      "cognition.ai/isArchived": true,
      "cognition.ai/archivedAt": "2026-10-07T16:13:32.858887+00:00",
      "cognition.ai/isStarred": false,
      "cognition.ai/keepAlive": false,
      "cognition.ai/statusEnum": "blocked",
      "cognition.ai/sessionOrigin": "desktop",
      "cognition.ai/sessionTags": ["agent:devin-rs"],
      "cognition.ai/isUnread": true,
      "cognition.ai/canManageOrgSecrets": true,
      "cognition.ai/readOnly": false,
    },
  };

  it("archives an owned session and extracts the confirmed status fields", async () => {
    const { calls, actions } = transportWith(() => archiveResponse);
    const result = await actions.archiveSession("devin-owned-fixture");
    expect(calls).toEqual([
      { method: DEVIN_ACP_METHODS.sessionArchive, params: { sessionId: "devin-owned-fixture" } },
    ]);
    expect(result.isArchived).toBe(true);
    expect(result.sessionId).toBe("devin-owned-fixture");
    expect(result.status).toBe("running");
    expect(result.archivedAt).toBe("2026-10-07T16:13:32.858887+00:00");
    // The stable result is bounded: no provider payload escapes — only the
    // four confirmed fields, nothing else.
    expect(Object.keys(result).sort()).toEqual(["archivedAt", "isArchived", "sessionId", "status"]);
  });

  it("fails a response that echoes a different session id than requested", async () => {
    // A misrouted/foreign echo can never confirm THIS owned session archived.
    const foreign = transportWith(() => ({
      ...archiveResponse,
      sessionId: "devin-someone-elses",
    }));
    await expect(foreign.actions.archiveSession("devin-owned-fixture")).rejects.toMatchObject({
      code: 0,
      message: "session/archive response echoed a different session than requested",
    });
  });

  it("fails a success response with a missing or malformed session echo", async () => {
    // Wire-realistic shapes only: JSON has no `undefined`, so absence is a
    // response without the key at all.
    const responses: unknown[] = [
      { ...archiveResponse, sessionId: null },
      { ...archiveResponse, sessionId: "" },
      { ...archiveResponse, sessionId: 42 },
      { ...archiveResponse, sessionId: { id: "devin-owned-fixture" } },
      // Absent key entirely.
      {
        status: archiveResponse.status,
        is_archived: archiveResponse.is_archived,
      },
    ];
    for (const response of responses) {
      const malformedEcho = transportWith(() => response);
      await expect(
        malformedEcho.actions.archiveSession("devin-owned-fixture"),
      ).rejects.toMatchObject({
        code: 0,
        message: "session/archive response did not echo a sessionId",
      });
    }
  });

  it("surfaces the cloud access-denied gate as a typed error, never fake success", async () => {
    // pendingSession sessions answer -32002 Access denied even on their
    // creating connection (cloud-creator-archive.json).
    const denied = transportWith(() => {
      // Exercise the native structured RPC rejection, which is not an Error instance.
      // oxlint-disable-next-line typescript/only-throw-error
      throw { code: -32002, message: "Access denied" };
    });
    await expect(denied.actions.archiveSession("devin-pending-fixture")).rejects.toMatchObject({
      name: "DevinAcpActionError",
      code: -32002,
      message: "Access denied",
    });
    expect(denied.actions.archiveSession("devin-pending-fixture").catch(() => {})).toBeDefined();
    await expect(
      denied.actions.archiveSession("devin-pending-fixture").catch((e: unknown) => {
        throw toDevinAcpActionError(e);
      }),
    ).rejects.toMatchObject({ unsupported: false });
  });

  it("fails a success response that does not state is_archived=true", async () => {
    const { actions } = transportWith(() => ({
      sessionId: "devin-owned-fixture",
      status: "running",
    }));
    await expect(actions.archiveSession("devin-owned-fixture")).rejects.toMatchObject({
      code: 0,
      message: "Unexpected session/archive response shape",
    });
  });

  it("keeps local -32601 and oversized responses as typed failures", async () => {
    const local = transportWith(() => {
      // Exercise the native structured RPC rejection, which is not an Error instance.
      // oxlint-disable-next-line typescript/only-throw-error
      throw { code: -32601, message: "Method not found: _cognition.ai/session/archive" };
    });
    await expect(local.actions.archiveSession("devin-local-fixture")).rejects.toMatchObject({
      code: -32601,
      unsupported: true,
    });
    const huge = transportWith(() => ({ is_archived: true, blob: "x".repeat(600 * 1024) }));
    await expect(huge.actions.archiveSession("devin-owned-fixture")).rejects.toMatchObject({
      code: 0,
      message: "session/archive response exceeds the serialized bound",
    });
  });

  it("exposes archive as a neutral cloud action returning the stable bounded confirmation", async () => {
    const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
    const descriptors = devinAcpSessionActionDescriptors(
      {
        request: async (method, params) => {
          calls.push({ method, params });
          return archiveResponse;
        },
      },
      { target: "cloud" },
    );
    const archive = descriptors.find((d) => d.id === DEVIN_ACP_SESSION_ACTION_IDS.archive);
    expect(archive).toBeDefined();
    const result = await archive!.invoke(
      {},
      {
        threadId: "fixture-thread",
        sessionId: "devin-owned-fixture",
        signal: new AbortController().signal,
      },
    );
    expect(calls).toEqual([
      { method: DEVIN_ACP_METHODS.sessionArchive, params: { sessionId: "devin-owned-fixture" } },
    ]);
    // Exact bounded owned result: explicit archived:true, the validated owned
    // id, and only the needed status fields — no raw provider payload, no
    // account `_meta` data, no `is_archived` leak.
    expect(result).toEqual({
      archived: true,
      sessionId: "devin-owned-fixture",
      status: "running",
      archivedAt: "2026-10-07T16:13:32.858887+00:00",
    });
    expect(JSON.stringify(result)).not.toContain("is_archived");
    expect(JSON.stringify(result)).not.toContain("creatorUserId");
    expect(JSON.stringify(result)).not.toContain("app.devin.ai");
  });

  it("archives exactly once: cancellation surfaces AbortError with no automatic retry", async () => {
    let attempts = 0;
    const controller = new AbortController();
    const descriptors = devinAcpSessionActionDescriptors(
      {
        request: () => {
          attempts += 1;
          return new Promise(() => {});
        },
      },
      { target: "cloud" },
    );
    const archive = descriptors.find((d) => d.id === DEVIN_ACP_SESSION_ACTION_IDS.archive)!;
    const pending = archive.invoke(
      {},
      {
        threadId: "fixture-thread",
        sessionId: "devin-owned-fixture",
        signal: controller.signal,
      },
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    // Archive is an uncertain mutation: one request, never re-issued.
    expect(attempts).toBe(1);
  });

  it("never publishes a confirmed archive when the echo mismatches through the descriptor", async () => {
    const descriptors = devinAcpSessionActionDescriptors(
      {
        request: async () => ({ ...archiveResponse, sessionId: "devin-foreign-fixture" }),
      },
      { target: "cloud" },
    );
    const archive = descriptors.find((d) => d.id === DEVIN_ACP_SESSION_ACTION_IDS.archive)!;
    await expect(
      archive.invoke(
        {},
        {
          threadId: "fixture-thread",
          sessionId: "devin-owned-fixture",
          signal: new AbortController().signal,
        },
      ),
    ).rejects.toMatchObject({
      code: 0,
      message: "session/archive response echoed a different session than requested",
    });
  });
});
