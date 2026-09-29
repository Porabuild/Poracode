import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "../state/appStore";
import { useExperimentStore } from "../state/experimentStore";
import { groupExperiment, groupThread } from "@/shared/test/threadGroups";
import { applyRemoteSetGroupCommand } from "./remoteGroupCommandActions";

describe("applyRemoteSetGroupCommand", () => {
  beforeEach(() => {
    localStorage.clear();
    useExperimentStore.setState({ experiments: {} });
    useAppStore.setState((state) => ({
      ...state,
      projects: [],
      threads: [],
      view: { kind: "home" },
    }));
  });

  it("assigns a sidebar group", () => {
    const project = useAppStore.getState().addProject({ kind: "windows", path: "C:\\repo" });
    const thread = useAppStore.getState().createThread({
      threadId: "thread-1",
      projectId: project.id,
      agentKind: "codex",
      config: { model: "gpt-5" },
      prompt: "start",
    });

    applyRemoteSetGroupCommand(thread.id, "g1", "Research");

    expect(useAppStore.getState().threads[0]).toMatchObject({
      id: thread.id,
      groupId: "g1",
      groupName: "Research",
    });
  });

  it("ungroups a thread and dissolves a leftover pair", () => {
    const project = useAppStore.getState().addProject({ kind: "windows", path: "C:\\repo" });
    const first = useAppStore.getState().createThread({
      threadId: "thread-1",
      projectId: project.id,
      agentKind: "codex",
      config: { model: "gpt-5" },
      prompt: "one",
      groupId: "g1",
      groupName: "Research",
    });
    const second = useAppStore.getState().createThread({
      threadId: "thread-2",
      projectId: project.id,
      agentKind: "codex",
      config: { model: "gpt-5" },
      prompt: "two",
      groupId: "g1",
      groupName: "Research",
    });
    useAppStore.setState({
      view: {
        kind: "thread",
        panes: [first.id, second.id],
        activeGroupId: "g1",
        paneLayout: {
          kind: "split",
          axis: "horizontal",
          children: [
            { kind: "leaf", paneId: first.id },
            { kind: "leaf", paneId: second.id },
          ],
        },
      },
    });

    applyRemoteSetGroupCommand(first.id, undefined, undefined);

    const threads = useAppStore.getState().threads;
    expect(threads.find((thread) => thread.id === first.id)?.groupId).toBeUndefined();
    expect(threads.find((thread) => thread.id === second.id)?.groupId).toBeUndefined();
    expect(useAppStore.getState().view).toEqual({ kind: "thread", panes: [first.id] });
  });
  it.each([undefined, "other-group"])(
    "preserves experiment source membership and view for target %s",
    (groupId) => {
      const experiment = groupExperiment();
      useExperimentStore.setState({ experiments: { [experiment.id]: experiment } });
      useAppStore.setState({
        threads: [groupThread("a", experiment.id), groupThread("b", experiment.id)],
        view: { kind: "thread", panes: ["a", "b"], activeGroupId: experiment.id },
      });
      const before = useAppStore.getState();
      applyRemoteSetGroupCommand("a", groupId, undefined);
      // ungroupAll arrives as individual set-group commands for every member.
      applyRemoteSetGroupCommand("b", groupId, undefined);
      expect(useAppStore.getState()).toBe(before);
    },
  );

  it("refuses ordinary threads admission to an experiment", () => {
    const experiment = groupExperiment();
    useExperimentStore.setState({ experiments: { [experiment.id]: experiment } });
    useAppStore.setState({ threads: [groupThread("ordinary")] });
    const before = useAppStore.getState();
    applyRemoteSetGroupCommand("ordinary", experiment.id, "Experiment");
    expect(useAppStore.getState()).toBe(before);
  });

  it("preserves two siblings in a larger group while collapsing its active view", () => {
    useAppStore.setState({
      threads: [groupThread("a"), groupThread("b"), groupThread("c")],
      view: { kind: "thread", panes: ["a", "b", "c"], activeGroupId: "group-1" },
    });
    applyRemoteSetGroupCommand("a", undefined, undefined);
    const state = useAppStore.getState();
    expect(state.threads.map((thread) => thread.groupId)).toEqual([
      undefined,
      "group-1",
      "group-1",
    ]);
    expect(state.view).toEqual({ kind: "thread", panes: ["a"] });
  });

  it("dissolves all members through the command sequence without collapsing another view", () => {
    useAppStore.setState({
      threads: [groupThread("a"), groupThread("b"), groupThread("c")],
      view: { kind: "thread", panes: ["other"], activeGroupId: "other-group" },
    });
    const view = useAppStore.getState().view;
    for (const id of ["a", "b", "c"]) applyRemoteSetGroupCommand(id, undefined, undefined);
    expect(
      useAppStore
        .getState()
        .threads.every((thread) => thread.groupId === undefined && thread.groupName === undefined),
    ).toBe(true);
    expect(useAppStore.getState().view).toBe(view);
  });
});
