import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { AgentCapability, AgentStatus, Thread } from "@/shared/contracts";
import type { SideChatSelection } from "@/shared/ipc/sideChat";
const capabilities = {
  models: [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ],
  efforts: ["low", "high"],
  modelEfforts: { a: ["low", "high"], b: ["high"] },
  contextSizes: [],
  modes: ["agent"],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "server",
  presentationMode: "gui",
  settingDefs: [],
} as AgentCapability;
const agents = [
  { kind: "neutral-gui", label: "Agent one", installed: true, capabilities },
  {
    kind: "other-gui",
    label: "Agent two",
    installed: true,
    capabilities: { ...capabilities, models: [{ id: "target", label: "Target" }] },
  },
  {
    kind: "terminal-only",
    label: "Terminal",
    installed: true,
    capabilities: { ...capabilities, presentationMode: "terminal" },
  },
] as AgentStatus[];
vi.mock("@/renderer/hooks/uiSelectors", () => ({
  useDraftEnvironment: () => ({ agentStatuses: agents }),
}));
vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: (selector: (state: unknown) => unknown) =>
    selector({ hiddenModels: {}, disabledAgents: [] }),
}));
import { useSideChatDraftControls } from "./useSideChatDraftControls";
const source = {
  id: "parent",
  projectId: "project",
  agentKind: "neutral-gui",
  config: { model: "a", effort: "low" },
  sessionRef: { providerSessionId: "parent-session" },
} as Thread;
const selection: SideChatSelection = { agentKind: source.agentKind, config: source.config };
it("exposes both GUI agents and changes the model without borrowing the parent's session", () => {
  const update = vi.fn<(selection: SideChatSelection) => void>();
  const hook = renderHook(() =>
    useSideChatDraftControls(source, undefined, selection, update, false),
  );
  const picker = hook.result.current.find((control) => control.kind === "provider-model");
  expect(picker?.kind).toBe("provider-model");
  if (picker?.kind !== "provider-model") throw new Error("Missing model picker");
  expect(picker.lockedAgentKind).toBeUndefined();
  expect(picker.providers.map((provider) => provider.kind)).toEqual(["neutral-gui", "other-gui"]);
  picker.onChange({ agentKind: "neutral-gui", model: "b" });
  expect(update).toHaveBeenLastCalledWith(
    expect.objectContaining({
      agentKind: "neutral-gui",
      config: expect.objectContaining({ model: "b", effort: "high" }),
    }),
  );
  picker.onChange({ agentKind: "other-gui", model: "target" });
  expect(update).toHaveBeenLastCalledWith(
    expect.objectContaining({
      agentKind: "other-gui",
      config: expect.objectContaining({ model: "target" }),
    }),
  );
  expect(source.config).toEqual({ model: "a", effort: "low" });
});
it("disables all editable draft controls while launch ownership is pending", () => {
  const hook = renderHook(() =>
    useSideChatDraftControls(source, undefined, selection, () => {}, true),
  );
  expect(hook.result.current.length).toBeGreaterThan(0);
  for (const control of hook.result.current.filter((item) => item.kind !== "static"))
    expect(control.isDisabled).toBe(true);
});
