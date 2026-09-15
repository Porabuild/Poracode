import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "../state/appStore";
import { applyRemoteSetGroupCommand } from "./remoteGroupCommandActions";

describe("applyRemoteSetGroupCommand", () => {
  beforeEach(() => {
    localStorage.clear();
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
});
