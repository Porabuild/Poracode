import { expect, it } from "vitest";
import type { AgentCapability, AgentStatus } from "@/shared/contracts";
import { resolvePrAskAgent, type PrAskAgentInput } from "./resolvePrAskAgent";

const capabilities = {
  models: [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ],
  efforts: [],
  modelEfforts: {},
  contextSizes: [],
  modes: ["agent"],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "server",
  presentationMode: "gui",
  settingDefs: [],
} as unknown as AgentCapability;

function agent(kind: string, overrides: Partial<AgentStatus> = {}): AgentStatus {
  return { kind, label: kind, installed: true, capabilities, ...overrides } as AgentStatus;
}

function input(overrides: Partial<PrAskAgentInput> = {}): PrAskAgentInput {
  return {
    agents: [agent("first-gui"), agent("second-gui")],
    disabledAgents: [],
    lastDraftConfig: undefined,
    providerConfigs: {},
    providerModelPreferences: {},
    ...overrides,
  };
}

it("picks the first agent that can run a GUI thread, with a launchable model", () => {
  const selection = resolvePrAskAgent(input());
  expect(selection?.agentKind).toBe("first-gui");
  expect(selection?.config.model).toBe("a");
});

it("prefers the agent the project last used", () => {
  const selection = resolvePrAskAgent(
    input({ lastDraftConfig: { agentKind: "second-gui", model: "b" } }),
  );
  expect(selection?.agentKind).toBe("second-gui");
  expect(selection?.config.model).toBe("b");
});

it("skips terminal-only, disabled, uninstalled and unauthenticated agents", () => {
  expect(
    resolvePrAskAgent(
      input({
        agents: [
          agent("terminal", { capabilities: { ...capabilities, presentationMode: "terminal" } }),
          agent("off"),
          agent("missing-cli", { installed: false }),
          agent("signed-out", { authState: "missing" }),
          agent("ok"),
        ],
        disabledAgents: ["off"],
      }),
    )?.agentKind,
  ).toBe("ok");
});

it("is unavailable when no agent qualifies or there are no models", () => {
  expect(resolvePrAskAgent(input({ agents: [] }))).toBeUndefined();
  expect(
    resolvePrAskAgent(
      input({ agents: [agent("empty", { capabilities: { ...capabilities, models: [] } })] }),
    ),
  ).toBeUndefined();
});

it("never starts a chat in plan mode", () => {
  const selection = resolvePrAskAgent(
    input({ lastDraftConfig: { agentKind: "first-gui", model: "a", mode: "plan" } }),
  );
  expect(selection?.config.mode).not.toBe("plan");
});

it("does not inherit elevated mode, approval or sandbox settings from the last draft", () => {
  const selection = resolvePrAskAgent(
    input({
      lastDraftConfig: {
        agentKind: "first-gui",
        model: "a",
        mode: "agent",
        approvalPolicy: "never",
        approvalsReviewer: "user",
        sandboxMode: "danger-full-access",
      } as PrAskAgentInput["lastDraftConfig"],
      providerConfigs: {
        "first-gui": {
          model: "a",
          approvalPolicy: "never",
          sandboxMode: "danger-full-access",
        } as PrAskAgentInput["providerConfigs"][string],
      },
    }),
  );
  expect(selection?.config.model).toBe("a");
  expect(selection?.config).not.toHaveProperty("approvalPolicy");
  expect(selection?.config).not.toHaveProperty("approvalsReviewer");
  expect(selection?.config).not.toHaveProperty("sandboxMode");
  expect(selection?.config).not.toHaveProperty("mode");
});
