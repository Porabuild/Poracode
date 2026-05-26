import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { HomeView } from "./HomeView";

describe("HomeView", () => {
  beforeEach(() => {
    localStorage.clear();
    useSharedSettings.setState({ homeScopeEnabled: true });
    useAppStore.setState((state) => ({
      ...state,
      projects: [makeProject()],
      threads: [],
      view: { kind: "home" },
    }));
  });

  it("does not show archived threads in recent threads", () => {
    useAppStore.setState({
      threads: [
        makeThread({ id: "active", title: "Keep me visible", archived: false }),
        makeThread({ id: "archived", title: "Archived thread", archived: true }),
      ],
    });

    render(<HomeView />);

    expect(screen.getByText("Keep me visible")).toBeInTheDocument();
    expect(screen.queryByText("Archived thread")).not.toBeInTheDocument();
  });
});

function makeProject(): Project {
  return {
    id: "project-1",
    name: "todo-app",
    location: { kind: "windows", path: "C:\\repo" },
    createdAt: "2026-05-26T00:00:00.000Z",
  };
}

function makeThread(overrides: Partial<Thread>): Thread {
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "Thread",
    agentKind: "codex",
    config: { model: "gpt-5" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: "2026-05-26T00:00:00.000Z",
    updatedAt: "2026-05-26T00:00:00.000Z",
    ...overrides,
  };
}
