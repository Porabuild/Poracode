import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ThreadCrewBinding } from "@/shared/crew";
import type { ProjectDraftConfig, ProviderDraftConfig } from "@/shared/contracts";
import type { PoracodeBridge } from "@/shared/ipc";
import { installBrowserClientRuntime, resetClientRuntimeForTest } from "../clientRuntime";
import { useAppStore } from "./appStore";
import { readRawBrowserMetadataRecordForTest } from "./browserMetadataCacheRecords";
import { useSharedSettings } from "./sharedSettingsStore";

const provider = "fixture:profile";
const bare: ProviderDraftConfig = {
  model: "member",
  effort: "",
  contextSize: "",
  fast: false,
  thinking: false,
};
const bound: ProviderDraftConfig = {
  ...bare,
  selectionBinding: {
    version: 1,
    kind: "family-member",
    owner: { agentKind: provider, presentationMode: "terminal" },
    model: bare.model,
    inertValues: { effort: "", contextSize: "", fast: false, thinking: false },
  },
};
const reduced: ProviderDraftConfig = {
  ...bare,
  selectionBinding: {
    ...bound.selectionBinding!,
    inertValues: { effort: "", contextSize: "", thinking: false },
  },
};
const firstCrew: ThreadCrewBinding = {
  version: 1,
  name: "Ship crew",
  policy: "crew-only",
  roles: [
    {
      id: "builder",
      label: "Builder",
      selection: { agentKind: "codex", model: "gpt-5.5" },
    },
  ],
};

describe("complete draft selection persistence", () => {
  const originalBridge = window.poracode;

  beforeEach(async () => {
    resetClientRuntimeForTest();
    Reflect.deleteProperty(window, "poracode");
    localStorage.clear();
    // Let the existing async hydration settle before establishing test rows.
    if (!useAppStore.persist.hasHydrated()) {
      await new Promise<void>((resolve) => useAppStore.persist.onFinishHydration(() => resolve()));
    }
    useAppStore.setState({ projects: [], threads: [] });
    useSharedSettings.setState({ providerConfigs: {} });
  });

  afterEach(() => {
    resetClientRuntimeForTest();
    if (originalBridge) window.poracode = originalBridge;
    else Reflect.deleteProperty(window, "poracode");
    vi.restoreAllMocks();
  });

  it("writes binding-only additions, reductions and removals to the provider cache", () => {
    for (const next of [bare, bound, reduced, bound, bare]) {
      useSharedSettings.getState().setProviderConfig(provider, structuredClone(next));
      expect(useSharedSettings.getState().providerConfigs[provider]).toStrictEqual(next);
      const cached = JSON.parse(localStorage.getItem("poracode-shared-settings")!) as {
        providerConfigs: Record<string, ProviderDraftConfig>;
      };
      expect(cached.providerConfigs[provider]).toStrictEqual(next);
    }

    useSharedSettings.getState().setProviderConfig(provider, structuredClone(bound));
    const previous = useSharedSettings.getState().providerConfigs[provider];
    const writes = vi.spyOn(Storage.prototype, "setItem");
    useSharedSettings.getState().setProviderConfig(provider, structuredClone(bound));
    expect(useSharedSettings.getState().providerConfigs[provider]).toBe(previous);
    expect(writes).not.toHaveBeenCalled();
  });

  it("commits binding-only project changes to IndexedDB without replacing equivalent configs", async () => {
    installBrowserClientRuntime({} as PoracodeBridge);
    const project = useAppStore.getState().addProject({ kind: "posix", path: "/draft-selection" });
    const current = () =>
      useAppStore.getState().projects.find((candidate) => candidate.id === project.id)!
        .lastDraftConfig;

    for (const selection of [bare, bound, reduced, bound, bare]) {
      const next: ProjectDraftConfig = { ...structuredClone(selection), agentKind: provider };
      useAppStore.getState().updateProjectDraftConfig(project.id, next);
      expect(current()).toStrictEqual(next);
      await vi.waitFor(async () => {
        const record = await readRawBrowserMetadataRecordForTest("poracode-app-v2");
        const cached = record?.value as
          | { state: { projects: Array<{ id: string; lastDraftConfig?: ProjectDraftConfig }> } }
          | undefined;
        expect(
          cached?.state.projects.find((candidate) => candidate.id === project.id)?.lastDraftConfig,
        ).toStrictEqual(next);
      });
    }

    const next: ProjectDraftConfig = { ...structuredClone(bound), agentKind: provider };
    useAppStore.getState().updateProjectDraftConfig(project.id, next);
    const previous = current();
    const projects = useAppStore.getState().projects;
    useAppStore.getState().updateProjectDraftConfig(project.id, structuredClone(next));
    expect(current()).toBe(previous);
    expect(useAppStore.getState().projects).toBe(projects);
  });

  it("persists provider and project draft changes that affect only the crew", async () => {
    const providerWithCrew: ProviderDraftConfig = { ...bare, crew: firstCrew };
    useSharedSettings.getState().setProviderConfig(provider, providerWithCrew);
    const changedCrew = { ...firstCrew, policy: "crew-first" as const };
    const providerCrewOnlyChange: ProviderDraftConfig = { ...bare, crew: changedCrew };
    useSharedSettings.getState().setProviderConfig(provider, providerCrewOnlyChange);
    expect(useSharedSettings.getState().providerConfigs[provider]).toStrictEqual(
      providerCrewOnlyChange,
    );

    installBrowserClientRuntime({} as PoracodeBridge);
    const project = useAppStore.getState().addProject({ kind: "posix", path: "/draft-crew" });
    const projectWithCrew: ProjectDraftConfig = {
      ...bare,
      agentKind: provider,
      crew: firstCrew,
    };
    useAppStore.getState().updateProjectDraftConfig(project.id, projectWithCrew);
    const projectCrewOnlyChange: ProjectDraftConfig = {
      ...bare,
      agentKind: provider,
      crew: changedCrew,
    };
    useAppStore.getState().updateProjectDraftConfig(project.id, projectCrewOnlyChange);
    expect(
      useAppStore.getState().projects.find((candidate) => candidate.id === project.id)
        ?.lastDraftConfig,
    ).toStrictEqual(projectCrewOnlyChange);
  });
});
