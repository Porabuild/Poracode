import { afterEach, expect, it, vi } from "vitest";
import type { CanUseTool, Options, query } from "@anthropic-ai/claude-agent-sdk";
import type { RuntimeEvent, ThreadConfig, ThreadServerRequestId } from "@/shared/contracts";
import { ClaudeSdkSession } from "./sdkSession";
import { createKnownSessionRef } from "../base";
import { createClaudeTestQuery } from "./sdkSessionTestHarness";

const sdk = vi.hoisted(() => ({ query: vi.fn<typeof query>() }));
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({ query: sdk.query }));
vi.mock("../binaryResolver", () => ({ resolveAgentBinaryPath: () => "/mock/claude" }));
const sessions: ClaudeSdkSession[] = [];
const plan: ThreadConfig = {
  model: "sonnet",
  mode: "plan",
  approvalPolicy: "bypassPermissions",
};
async function createSession(config = plan, resume = false) {
  const fake = createClaudeTestQuery();
  sdk.query.mockReturnValue(fake.runtime);
  const session = await ClaudeSdkSession.create({
    threadId: "permissions-test",
    projectLocation: { kind: "posix", path: "/fixture" },
    config,
    agentSettings: { chromeIntegration: false },
    presentationMode: "gui",
  });
  sessions.push(session);
  const events: RuntimeEvent[] = [];
  session.setListener({
    onUpdate: () => {},
    onError: () => {},
    onClose: () => {},
    onRuntimeEvent: (event) => events.push(event),
  });
  if (resume) {
    await session.openThread(config, createKnownSessionRef("previous-session"));
  } else await session.openThread(config);
  const options = sdk.query.mock.calls.at(-1)![0].options as Options;
  return { session, options, fake, events };
}
afterEach(async () => {
  for (const session of sessions.splice(0)) await session.dispose();
  vi.clearAllMocks();
});

// CLI 2.1.308 forwards this discriminator through SDK 0.3.296 even though
// CanUseTool's public callback type omits it. Older callbacks remain valid.
function callbackOptions(
  overrides: Partial<Parameters<CanUseTool>[2]> & {
    decisionReasonType?: string;
    requiresUserInteraction?: boolean;
    serverPrompt?: string;
    decisionReasonCode?: string;
  } = {},
) {
  return {
    signal: new AbortController().signal,
    toolUseID: "tool-permission",
    requestId: "native-request",
    decisionReasonType: "mode",
    ...overrides,
  };
}

it.each([false, true])(
  "honors Plan + Bypass for MCP calls without needing a client (resumed: %s)",
  async (resume) => {
    const h = await createSession(plan, resume);
    expect(h.options.resume).toBe(resume ? "previous-session" : undefined);
    await h.session.startTurn("Look up the guide", plan);
    expect(h.fake.setPermissionMode.mock.calls).toEqual([["bypassPermissions"], ["plan"]]);
    const input = { items: ["topic.index"] };
    await expect(
      h.options.canUseTool!("mcp__docs__guide", input, callbackOptions()),
    ).resolves.toEqual({ behavior: "allow", updatedInput: input });
    expect(h.events.filter((event) => event.type === "request.opened")).toEqual([]);
  },
);

it("confirms Bypass before entering Plan and does not admit input when confirmation fails", async () => {
  const h = await createSession();
  h.fake.setPermissionMode.mockRejectedValueOnce(new Error("Bypass disabled by settings"));
  await expect(h.session.startTurn("Plan this", plan)).rejects.toThrow(
    "Bypass disabled by settings",
  );
  expect(h.fake.setPermissionMode.mock.calls).toEqual([["bypassPermissions"]]);
  const controller = new AbortController();
  const permission = h.options.canUseTool!(
    "mcp__docs__guide",
    {},
    callbackOptions({ signal: controller.signal }),
  );
  expect(h.events.some((event) => event.type === "request.opened")).toBe(true);
  controller.abort();
  await expect(permission).resolves.toMatchObject({ behavior: "deny" });
  const inputs = (sdk.query.mock.calls.at(-1)![0].prompt as AsyncIterable<unknown>)[
    Symbol.asyncIterator
  ]();
  const delivered = vi.fn<(result: IteratorResult<unknown>) => void>();
  const next = inputs.next().then(delivered);
  await Promise.resolve();
  expect(delivered).not.toHaveBeenCalled();
  await h.session.startTurn("Retry plan", plan);
  await next;
  expect(delivered).toHaveBeenCalledOnce();
});

it.each([
  ["mode", { matchedAskRule: { source: "userSettings", toolName: "mcp__docs__guide" } }],
  ["mode", { defaultToNo: true }],
  ["mode", { suppressAlwaysAllowRule: true }],
  ["mode", { requiresUserInteraction: true }],
  ["other", { requiresUserInteraction: true }],
  ["other", { serverPrompt: "Review the server's consent prompt" }],
  ["other", { decisionReasonCode: "explicit_approval" }],
  ["rule", {}],
  ["safetyCheck", {}],
  ["hook", {}],
  ["permissionPromptTool", {}],
  ["sandboxOverride", {}],
  ["subcommandResults", {}],
  [undefined, {}],
] as const)(
  "keeps explicit and unrecognized permission requests (%s, %j)",
  async (reason, extra) => {
    const h = await createSession();
    await h.session.startTurn("Plan this", plan);
    const options = callbackOptions(extra);
    if (reason === undefined)
      delete (options as { decisionReasonType?: string }).decisionReasonType;
    else options.decisionReasonType = reason;
    const reply = h.options.canUseTool!("mcp__docs__guide", {}, options);
    const request = h.events.find((event) => event.type === "request.opened");
    if (!request || request.type !== "request.opened") throw new Error("Missing approval");
    await h.session.resolveServerRequest(request.requestId as ThreadServerRequestId, {
      optionId: "deny",
    });
    await expect(reply).resolves.toMatchObject({ behavior: "deny" });
  },
);

it.each(["default", "auto", "acceptEdits", "dontAsk"])(
  "does not bypass Plan permissions for the %s approval policy",
  async (approvalPolicy) => {
    const config = { ...plan, approvalPolicy };
    const h = await createSession(config);
    await h.session.startTurn("Plan this", config);
    const controller = new AbortController();
    const reply = h.options.canUseTool!(
      "mcp__docs__guide",
      {},
      callbackOptions({ signal: controller.signal }),
    );
    expect(h.events.some((event) => event.type === "request.opened")).toBe(true);
    controller.abort();
    await expect(reply).resolves.toMatchObject({ behavior: "deny" });
  },
);

it.each(["ExitPlanMode", "exit_plan_mode", "AskUserQuestion"])(
  "still presents %s in Plan + Bypass",
  async (toolName) => {
    const h = await createSession();
    await h.session.startTurn("Plan this", plan);
    const controller = new AbortController();
    const reply = h.options.canUseTool!(
      toolName,
      toolName === "AskUserQuestion"
        ? { questions: [{ question: "Which marker?", header: "Marker", options: [] }] }
        : { plan: "Review this plan" },
      callbackOptions({ signal: controller.signal }),
    );
    expect(h.events.some((event) => event.type === "request.opened")).toBe(true);
    controller.abort();
    await expect(reply).resolves.toMatchObject({ behavior: "deny" });
  },
);

it("stops bypassing when the policy changes on the same Plan session", async () => {
  const h = await createSession();
  await h.session.startTurn("First plan", plan);
  await h.session.startTurn("Review with approval", { ...plan, approvalPolicy: "default" });
  const controller = new AbortController();
  const reply = h.options.canUseTool!(
    "mcp__docs__guide",
    {},
    callbackOptions({ signal: controller.signal }),
  );
  expect(h.events.some((event) => event.type === "request.opened")).toBe(true);
  controller.abort();
  await expect(reply).resolves.toMatchObject({ behavior: "deny" });
  expect(sdk.query).toHaveBeenCalledOnce();
});

it("applies Bypass selected after an ordinary Plan turn without replacing the session", async () => {
  const ordinary = { ...plan, approvalPolicy: "default" };
  const h = await createSession(ordinary);
  await h.session.startTurn("First plan", ordinary);
  await h.session.startTurn("Continue with Bypass", plan);
  await expect(
    h.options.canUseTool!("Bash", { command: "pwd" }, callbackOptions()),
  ).resolves.toEqual({ behavior: "allow", updatedInput: { command: "pwd" } });
  expect(h.fake.setPermissionMode.mock.calls).toEqual([["plan"], ["bypassPermissions"], ["plan"]]);
  expect(h.events.some((event) => event.type === "request.opened")).toBe(false);
  expect(sdk.query).toHaveBeenCalledOnce();
});

it("re-enters native Auto before Plan after a Bypass turn without approving requests locally", async () => {
  const h = await createSession();
  await h.session.startTurn("First plan", plan);
  await h.session.startTurn("Continue with Auto", { ...plan, approvalPolicy: "auto" });
  expect(h.fake.setPermissionMode.mock.calls).toEqual([
    ["bypassPermissions"],
    ["plan"],
    ["auto"],
    ["plan"],
  ]);
  const controller = new AbortController();
  const reply = h.options.canUseTool!(
    "mcp__docs__guide",
    {},
    callbackOptions({ signal: controller.signal }),
  );
  expect(h.events.some((event) => event.type === "request.opened")).toBe(true);
  controller.abort();
  await expect(reply).resolves.toMatchObject({ behavior: "deny" });
  expect(sdk.query).toHaveBeenCalledOnce();
});

it("does not admit a Plan + Auto prompt if native Auto is unavailable", async () => {
  const h = await createSession();
  h.fake.setPermissionMode.mockRejectedValueOnce(new Error("Auto unavailable for this model"));
  await expect(
    h.session.startTurn("Plan with Auto", { ...plan, approvalPolicy: "auto" }),
  ).rejects.toThrow("Auto unavailable for this model");
  expect(h.fake.setPermissionMode.mock.calls).toEqual([["auto"]]);
});

it.each(["default", "auto"] as const)(
  "applies %s immediately when approving a Plan + Bypass plan",
  async (optionId) => {
    const h = await createSession();
    await h.session.startTurn("Plan this", plan);
    const approval = h.options.canUseTool!("ExitPlanMode", { plan: "A plan" }, callbackOptions());
    const request = h.events.find((event) => event.type === "request.opened");
    if (!request || request.type !== "request.opened") throw new Error("Missing plan approval");
    await h.session.resolveServerRequest(request.requestId as ThreadServerRequestId, { optionId });
    await expect(approval).resolves.toEqual({
      behavior: "allow",
      updatedInput: { plan: "A plan" },
      updatedPermissions: [{ type: "setMode", mode: optionId, destination: "session" }],
    });
    expect(h.fake.setPermissionMode.mock.calls).toEqual([["bypassPermissions"], ["plan"]]);
    expect(h.fake.applyFlagSettings).toHaveBeenLastCalledWith({ sandbox: null });

    const controller = new AbortController();
    const permission = h.options.canUseTool!(
      "Bash",
      { command: "pwd" },
      callbackOptions({ signal: controller.signal }),
    );
    expect(h.events.filter((event) => event.type === "request.opened")).toHaveLength(2);
    controller.abort();
    await expect(permission).resolves.toMatchObject({ behavior: "deny" });
  },
);

it("keeps native Plan and approval open when restoring the saved sandbox fails", async () => {
  const h = await createSession();
  await h.session.startTurn("Plan this", plan);
  const approval = h.options.canUseTool!("ExitPlanMode", { plan: "A plan" }, callbackOptions());
  const request = h.events.find((event) => event.type === "request.opened");
  if (!request || request.type !== "request.opened") throw new Error("Missing plan approval");
  h.fake.applyFlagSettings.mockRejectedValueOnce(new Error("Sandbox settings unavailable"));
  await expect(
    h.session.resolveServerRequest(request.requestId as ThreadServerRequestId, {
      optionId: "auto",
    }),
  ).rejects.toThrow("Sandbox settings unavailable");
  expect(h.events.some((event) => event.type === "request.resolved")).toBe(false);
  expect(h.fake.setPermissionMode).toHaveBeenLastCalledWith("plan");
  await h.session.resolveServerRequest(request.requestId as ThreadServerRequestId, {
    optionId: "default",
  });
  await expect(approval).resolves.toMatchObject({ behavior: "allow" });
});

it("shares a pending plan resolution failure with another client's response", async () => {
  const h = await createSession();
  await h.session.startTurn("Plan this", plan);
  const controller = new AbortController();
  const approval = h.options.canUseTool!(
    "ExitPlanMode",
    { plan: "A plan" },
    callbackOptions({ signal: controller.signal }),
  );
  const request = h.events.find((event) => event.type === "request.opened");
  if (!request || request.type !== "request.opened") throw new Error("Missing plan approval");
  const settings = Promise.withResolvers<void>();
  h.fake.applyFlagSettings.mockReturnValueOnce(settings.promise);
  const first = h.session.resolveServerRequest(request.requestId as ThreadServerRequestId, {
    optionId: "auto",
  });
  const second = h.session.resolveServerRequest(request.requestId as ThreadServerRequestId, {
    optionId: "deny",
  });
  const responses = Promise.allSettled([first, second]);
  settings.reject(new Error("Sandbox settings unavailable"));
  expect(await responses).toEqual([
    { status: "rejected", reason: new Error("Sandbox settings unavailable") },
    { status: "rejected", reason: new Error("Sandbox settings unavailable") },
  ]);
  expect(h.events.some((event) => event.type === "request.resolved")).toBe(false);
  expect(h.fake.setPermissionMode).toHaveBeenLastCalledWith("plan");
  controller.abort();
  await expect(approval).resolves.toMatchObject({ behavior: "deny" });
});

it("does not leave native Plan when plan approval is cancelled during settings application", async () => {
  const h = await createSession();
  await h.session.startTurn("Plan this", plan);
  const controller = new AbortController();
  const approval = h.options.canUseTool!(
    "ExitPlanMode",
    { plan: "A plan" },
    callbackOptions({ signal: controller.signal }),
  );
  const request = h.events.find((event) => event.type === "request.opened");
  if (!request || request.type !== "request.opened") throw new Error("Missing plan approval");
  const settings = Promise.withResolvers<void>();
  h.fake.applyFlagSettings.mockReturnValueOnce(settings.promise);
  const resolution = h.session.resolveServerRequest(request.requestId as ThreadServerRequestId, {
    optionId: "default",
  });
  await Promise.resolve();
  expect(h.fake.applyFlagSettings).toHaveBeenLastCalledWith({ sandbox: null });
  controller.abort();
  settings.resolve();
  await resolution;
  await expect(approval).resolves.toMatchObject({ behavior: "deny" });
  expect(h.fake.setPermissionMode).toHaveBeenLastCalledWith("plan");
  expect(
    h.events.filter((event) => event.type === "request.resolved" && event.outcome === "accepted"),
  ).toHaveLength(0);
});

it("does not approve an already cancelled request", async () => {
  const h = await createSession();
  await h.session.startTurn("Plan this", plan);
  await expect(
    h.options.canUseTool!("mcp__docs__guide", {}, callbackOptions({ signal: AbortSignal.abort() })),
  ).resolves.toMatchObject({ behavior: "deny" });
  expect(h.events.some((event) => event.type === "request.opened")).toBe(false);
});

it("bypasses ordinary Bash approval", async () => {
  const h = await createSession();
  await h.session.startTurn("Plan this", plan);
  await expect(
    h.options.canUseTool!(
      "Bash",
      { command: "node -e 'process.stdout.write(\"OK\")'" },
      callbackOptions({ decisionReasonType: "other" }),
    ),
  ).resolves.toMatchObject({ behavior: "allow" });
});

it.each(["accept-suggestion-0", "acceptForSession"])(
  "returns the SDK's real permission updates for %s",
  async (optionId) => {
    const h = await createSession({ ...plan, approvalPolicy: "default" });
    const suggestions = [
      {
        type: "addRules" as const,
        rules: [{ toolName: "Bash", ruleContent: "pwd" }],
        behavior: "allow" as const,
        destination: "localSettings" as const,
      },
    ];
    const reply = h.options.canUseTool!(
      "Bash",
      { command: "pwd" },
      callbackOptions({ suggestions }),
    );
    const request = h.events.find((event) => event.type === "request.opened");
    if (!request || request.type !== "request.opened") throw new Error("Missing approval");
    await h.session.resolveServerRequest(request.requestId as ThreadServerRequestId, { optionId });
    await expect(reply).resolves.toEqual({
      behavior: "allow",
      updatedInput: { command: "pwd" },
      updatedPermissions: suggestions,
    });
  },
);

it("honors the SDK's suppression of persistent approval even when suggestions are supplied", async () => {
  const h = await createSession();
  await h.session.startTurn("Plan this", plan);
  const controller = new AbortController();
  const reply = h.options.canUseTool!(
    "Bash",
    { command: "pwd", dangerouslyDisableSandbox: true },
    callbackOptions({
      signal: controller.signal,
      decisionReasonType: "sandboxOverride",
      suppressAlwaysAllowRule: true,
      suggestions: [
        {
          type: "addRules",
          rules: [{ toolName: "Bash" }],
          behavior: "allow",
          destination: "session",
        },
      ],
    }),
  );
  const request = h.events.find((event) => event.type === "request.opened");
  if (!request || request.type !== "request.opened") throw new Error("Missing approval");
  expect(request.payload.options).toEqual([
    { optionId: "accept", label: "Allow once" },
    { optionId: "decline", label: "Deny" },
  ]);
  await expect(
    h.session.resolveServerRequest(request.requestId as ThreadServerRequestId, {
      optionId: "acceptForSession",
    }),
  ).rejects.toThrow("no matching persistent approval");
  await h.session.resolveServerRequest(request.requestId as ThreadServerRequestId, {
    optionId: "accept",
  });
  await expect(reply).resolves.toEqual({
    behavior: "allow",
    updatedInput: { command: "pwd", dangerouslyDisableSandbox: true },
  });
});

it.each(["acceptForSession", "accept-suggestion-9"])(
  "keeps a request open when an older client submits an unavailable persistent option (%s)",
  async (optionId) => {
    const h = await createSession({ ...plan, approvalPolicy: "default" });
    const reply = h.options.canUseTool!("Bash", { command: "pwd" }, callbackOptions());
    const request = h.events.find((event) => event.type === "request.opened");
    if (!request || request.type !== "request.opened") throw new Error("Missing approval");
    await expect(
      h.session.resolveServerRequest(request.requestId as ThreadServerRequestId, { optionId }),
    ).rejects.toThrow("no matching persistent approval");
    expect(h.events.some((event) => event.type === "request.resolved")).toBe(false);
    await h.session.resolveServerRequest(request.requestId as ThreadServerRequestId, {
      optionId: "accept",
    });
    await expect(reply).resolves.toEqual({ behavior: "allow", updatedInput: { command: "pwd" } });
  },
);
