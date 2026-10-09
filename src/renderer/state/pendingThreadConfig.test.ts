import "fake-indexeddb/auto";
import { beforeEach, expect, it } from "vitest";
import type { SessionConfigOptions, Thread } from "@/shared/contracts";
import { useAppStore } from "./appStore";
import { createAppStorePartializer } from "./appStorePersistence";
import {
  applyRootCatalogThreadRows,
  removeRootCatalogThreads,
} from "./managedRootCatalog/rootCatalogRows";
import { syncRemoteAppRows, removeRemoteAppRows } from "./remoteServers/appRows";
import { remoteThreadId } from "./remoteProjection";

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    projects: [],
    threads: [],
    view: { kind: "home" },
    pendingThreadConfigByThreadId: {},
    lastRuntimeConfigByThreadId: {},
    runtimeLaunchConfigByThreadId: {},
  });
});
function seed() {
  const store = useAppStore.getState();
  const project = store.addProject({ kind: "posix", path: "/fixture" });
  const thread = store.createThread({
    projectId: project.id,
    agentKind: "structured-example",
    config: { model: "model-a", effort: "xhigh" },
    prompt: "Fixture",
    presentationMode: "gui",
    suppressHostCreateIntent: true,
  });
  store.updateThreadRuntime(thread.id, {
    status: "idle",
    attention: "none",
    canResumeWithConfig: true,
    config: thread.config,
  });
  return thread;
}
function current(id: string): Thread {
  return useAppStore.getState().threads.find((row) => row.id === id)!;
}
function inventory(model: string, efforts?: string[]): SessionConfigOptions {
  return [
    {
      id: "model",
      type: "select",
      role: "model",
      currentValue: model,
      values: [{ value: "model-a" }, { value: "model-b" }],
      groups: [],
    },
    ...(efforts
      ? [
          {
            id: "reasoning",
            type: "select" as const,
            role: "effort" as const,
            currentValue: efforts[0],
            values: efforts.map((value) => ({ value })),
            groups: [],
          },
        ]
      : []),
  ];
}

it.each(["event", "snapshot"])(
  "accepts an unchanged provider acknowledgement after submission via %s",
  (path) => {
    const thread = seed(),
      store = useAppStore.getState();
    store.updateThreadConfig(thread.id, { ...thread.config, effort: "high" });
    const submission = store.markThreadConfigSubmitted(thread.id, current(thread.id).config);
    store.finishThreadConfigSubmission(thread.id, submission, false);
    const update = {
      threadId: thread.id,
      status: "idle" as const,
      attention: "none" as const,
      canResumeWithConfig: true,
      config: thread.config,
    };
    if (path === "event") store.updateThreadRuntime(thread.id, update);
    else store.reconcileRuntimeSnapshots([update]);
    expect(current(thread.id).config.effort).toBe("xhigh");
    expect(useAppStore.getState().pendingThreadConfigByThreadId[thread.id]).toBeUndefined();
  },
);

it.each([
  { efforts: [] as string[], selector: false },
  { efforts: [] as string[], selector: true },
  { efforts: ["low"], selector: true },
])(
  "does not preserve unsupported effort against a confirmed current-model inventory %j",
  ({ efforts, selector }) => {
    const thread = seed(),
      store = useAppStore.getState();
    store.updateThreadConfig(thread.id, { ...thread.config, effort: "high" });
    store.updateThreadRuntime(thread.id, {
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
      config: { model: "model-a", effort: efforts[0] ?? "" },
      sessionConfigOptions: inventory("model-a", selector ? efforts : undefined),
    });
    expect(current(thread.id).config.effort).toBe(efforts[0] ?? "");
    expect(useAppStore.getState().pendingThreadConfigByThreadId[thread.id]).toBeUndefined();
  },
);

it("does not apply the previous model's effort validity to a newer model choice", () => {
  const thread = seed(),
    store = useAppStore.getState();
  store.updateThreadConfig(thread.id, { model: "model-b", effort: "high" });
  store.updateThreadRuntime(thread.id, {
    status: "working",
    attention: "working",
    canResumeWithConfig: true,
    config: thread.config,
    sessionConfigOptions: inventory("model-a"),
  });
  expect(current(thread.id).config).toEqual({ model: "model-b", effort: "high" });
  store.updateThreadConfig(thread.id, { model: "model-b", effort: "" });
  store.updateThreadRuntime(thread.id, {
    status: "idle",
    attention: "none",
    canResumeWithConfig: true,
    config: { model: "model-b", effort: "" },
    sessionConfigOptions: inventory("model-b"),
  });
  expect(current(thread.id).config.effort).toBe("");
});

it.each([
  { agentKind: "other-provider" },
  { agentInstanceId: "other-account" },
  { presentationMode: "terminal" as const },
])("prunes local intent on a catalog ownership change %j", (owner) => {
  const thread = seed(),
    store = useAppStore.getState();
  store.updateThreadConfig(thread.id, { ...thread.config, effort: "high" });
  applyRootCatalogThreadRows([{ ...thread, ...owner }], new Set());
  expect(current(thread.id).config.effort).toBe("xhigh");
  expect(useAppStore.getState().pendingThreadConfigByThreadId[thread.id]).toBeUndefined();
});

it("prunes intent when the managed host removes a row", () => {
  const thread = seed(),
    store = useAppStore.getState();
  store.updateThreadConfig(thread.id, { ...thread.config, effort: "high" });
  removeRootCatalogThreads([thread.id]);
  expect(useAppStore.getState().pendingThreadConfigByThreadId).toEqual({});
});

it("preserves remote draft intent through replacement, invalidates cached projections, and prunes removal", () => {
  const thread = seed();
  const project = useAppStore.getState().projects[0]!;
  const server = "fixture-server";
  syncRemoteAppRows(server, [project], [thread]);
  const id = remoteThreadId(server, thread.id);
  const store = useAppStore.getState();
  store.updateThreadConfig(id, { ...thread.config, effort: "high" });
  syncRemoteAppRows(server, [project], [thread]);
  expect(current(id).config.effort).toBe("high");
  store.updateThreadConfig(id, { ...thread.config, effort: "low" });
  syncRemoteAppRows(server, [project], [thread]);
  expect(current(id).config.effort).toBe("low");
  syncRemoteAppRows(server, [project], [{ ...thread, title: "Changed host title" }]);
  expect(current(id)).toMatchObject({ title: "Changed host title", config: { effort: "low" } });
  removeRemoteAppRows(server);
  expect(useAppStore.getState().pendingThreadConfigByThreadId[id]).toBeUndefined();
});

it("does not serialize the transient map and reads the previous version-5 state without it", () => {
  const thread = seed(),
    store = useAppStore.getState();
  store.updateThreadConfig(thread.id, { ...thread.config, effort: "high" });
  const options = useAppStore.persist.getOptions();
  expect(options.version).toBe(5);
  expect(createAppStorePartializer()(useAppStore.getState())).not.toHaveProperty(
    "pendingThreadConfigByThreadId",
  );
  const restored = options.merge!(
    { projects: [], threads: [], view: { kind: "home" }, groupLayouts: {} },
    useAppStore.getState(),
  );
  expect(restored.pendingThreadConfigByThreadId).toEqual({});
});

it("prunes intent when its containing project is deleted", () => {
  const thread = seed(),
    store = useAppStore.getState();
  store.updateThreadConfig(thread.id, { ...thread.config, effort: "high" });
  store.deleteProject(thread.projectId);
  expect(useAppStore.getState().threads).toEqual([]);
  expect(useAppStore.getState().pendingThreadConfigByThreadId).toEqual({});
});
