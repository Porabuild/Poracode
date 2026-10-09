import { I18nProvider } from "@lingui/react";
import { i18n } from "@/renderer/i18n/i18n";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, Project } from "@/shared/contracts";
import type { ModelSelection } from "@/shared/selectionBinding.schemas";
import { useConflictResolver, type ConflictResolverLaunchInput } from "./useConflictResolver";

const state = vi.hoisted(() => ({
  settings: {
    conflictResolverProvider: "auto",
    conflictResolverModel: "stale",
    conflictResolverEffort: "stale",
    conflictResolverFast: true,
    conflictResolverSelection: undefined as ModelSelection | undefined,
    conflictResolverPresentationMode: "terminal" as const,
    wslConflictResolverProvider: "auto",
    wslConflictResolverModel: "",
    wslConflictResolverEffort: "",
    wslConflictResolverFast: false,
    wslConflictResolverSelection: undefined as ModelSelection | undefined,
    wslConflictResolverPresentationMode: "terminal" as const,
  },
  createThread: vi.fn<(input: unknown) => { id: string }>(),
  queueThreadLaunch: vi.fn<(id: string, prompt: string) => void>(),
}));
const agent = (kind: string): AgentStatus => ({
  kind,
  label: kind,
  installed: true,
  authState: "authenticated",
  capabilities: {
    models: [{ id: "default", label: "Default" }],
    efforts: ["high"],
    modelEfforts: {},
    defaultEffort: "high",
    modes: [],
    approvalPolicies: [],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "terminal",
    presentationMode: "terminal",
    settingDefs: [],
  },
});
vi.mock("@/renderer/state/agentStatusesStore", () => ({
  useAgentStatusesStore: (selector: (value: unknown) => unknown) =>
    selector({
      agentStatuses: [agent("fixture-native")],
      wslAgentStatuses: [agent("fixture-wsl")],
    }),
}));
vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: Object.assign(
    (selector: (value: typeof state.settings) => unknown) => selector(state.settings),
    { getState: () => state.settings },
  ),
}));
vi.mock("@/renderer/state/appStore", () => ({ useAppStore: { getState: () => state } }));
vi.mock("@/renderer/state/usageRecorder", () => ({ recordAiAction: vi.fn<() => void>() }));
const project: Project = {
  id: "project",
  name: "Project",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2026-10-09T00:00:00Z",
};
function renderResolver(
  location = project.location,
  onLaunchResolverThread?: (input: ConflictResolverLaunchInput) => void,
) {
  return renderHook(
    () =>
      useConflictResolver({
        project: { ...project, location },
        mergeConflictFiles: [
          { path: "file.ts", status: "UU", staged: false, insertions: 0, deletions: 0 },
        ],
        worktreePath: undefined,
        worktreeBranch: undefined,
        ...(onLaunchResolverThread ? { onLaunchResolverThread } : {}),
      }),
    { wrapper: ({ children }) => <I18nProvider i18n={i18n}>{children}</I18nProvider> },
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  state.settings.conflictResolverSelection = undefined;
  state.settings.wslConflictResolverSelection = undefined;
  state.settings.wslConflictResolverModel = "";
  state.createThread.mockReturnValue({ id: "new-thread" });
});
describe("conflict launch events", () => {
  it.each([
    { model: "uncatalogued" },
    { model: "uncatalogued", effort: "", fast: false, thinking: false, contextSize: "" },
    { model: "uncatalogued", effort: "custom", fast: true, thinking: true, contextSize: "large" },
    { model: "" },
  ])("projects canonical settings into both event paths without binding: %j", (actual) => {
    state.settings.conflictResolverSelection = actual.model
      ? {
          ...actual,
          selectionBinding: {
            version: 1,
            kind: "family-member",
            owner: { agentKind: "fixture-native", presentationMode: "terminal" },
            model: actual.model,
            inertValues: { fast: false },
          },
        }
      : actual;
    const expected = {
      ...actual,
      model: actual.model || "default",
      approvalPolicy: "bypassPermissions",
    };
    const callback = vi.fn<(input: ConflictResolverLaunchInput) => void>();
    const external = renderResolver(project.location, callback);
    act(() => external.result.current.handleResolveWithAgent());
    expect(callback.mock.calls[0]?.[0].config).toStrictEqual(expected);
    external.unmount();
    const direct = renderResolver();
    act(() => direct.result.current.handleResolveWithAgent());
    expect((state.createThread.mock.calls[0]![0] as { config: unknown }).config).toStrictEqual(
      expected,
    );
    expect(state.queueThreadLaunch).toHaveBeenCalledOnce();
  });

  it.each(["legacy", "native-canonical", "wsl-canonical", "wsl-legacy"])(
    "preserves WSL unset fallback provenance: %s",
    (mode) => {
      if (mode === "native-canonical")
        state.settings.conflictResolverSelection = { model: "native-exact" };
      if (mode === "wsl-canonical")
        state.settings.wslConflictResolverSelection = { model: "wsl-exact", fast: false };
      if (mode === "wsl-legacy") state.settings.wslConflictResolverModel = "stale-wsl";
      const callback = vi.fn<(input: ConflictResolverLaunchInput) => void>();
      const hook = renderResolver(
        {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/repo",
          uncPath: String.raw`\\wsl$\Ubuntu\repo`,
        },
        callback,
      );
      act(() => hook.result.current.handleResolveWithAgent());
      const expected =
        mode === "native-canonical"
          ? { model: "native-exact" }
          : mode === "wsl-canonical"
            ? { model: "wsl-exact", fast: false }
            : { model: "default", effort: "high" };
      expect(callback.mock.calls[0]?.[0].config).toStrictEqual({
        ...expected,
        approvalPolicy: "bypassPermissions",
      });
      expect(callback.mock.calls[0]?.[0].agentKind).toBe("fixture-wsl");
    },
  );
});
