import { describe, expect, it } from "vitest";
import type { Thread } from "@/shared/contracts";
import { resolveRendererRuntimeDiagnosticContext } from "./runtimeContext";

function makeThread(input: Partial<Thread> = {}): Thread {
  const now = "2026-07-27T00:00:00.000Z";
  return {
    id: "thread-a",
    projectId: "project-a",
    title: "Thread",
    agentKind: "codex",
    config: { model: "gpt-5.4" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

describe("renderer runtime diagnostic context", () => {
  it("uses the focused visible thread instead of mounted pane order", () => {
    const context = resolveRendererRuntimeDiagnosticContext({
      view: { kind: "thread", panes: ["thread-a", "thread-b"] },
      focusedPaneId: "thread-b",
      threads: [
        makeThread(),
        makeThread({
          id: "thread-b",
          agentKind: "claude",
          presentationMode: "gui",
        }),
      ],
    });

    expect(context).toEqual({
      provider: "claude",
      presentation: "gui",
      runtimeKind: "structured",
      featureArea: "thread",
    });
    expect(context).not.toHaveProperty("threadId");
    expect(context).not.toHaveProperty("projectId");
  });

  it("falls back to the first pane and terminal PTY semantics", () => {
    expect(
      resolveRendererRuntimeDiagnosticContext({
        view: { kind: "thread", panes: ["thread-a"] },
        focusedPaneId: "stale-thread",
        threads: [makeThread()],
      }),
    ).toEqual({
      provider: "codex",
      presentation: "terminal",
      runtimeKind: "pty",
      featureArea: "thread",
    });
  });

  it("matches the provider presentation default for legacy rows without a thread override", () => {
    expect(
      resolveRendererRuntimeDiagnosticContext(
        {
          view: { kind: "thread", panes: ["thread-a"] },
          focusedPaneId: "thread-a",
          threads: [makeThread()],
        },
        "gui",
      ),
    ).toEqual({
      provider: "codex",
      presentation: "gui",
      runtimeKind: "structured",
      featureArea: "thread",
    });
  });

  it("clears context outside a real thread pane", () => {
    expect(
      resolveRendererRuntimeDiagnosticContext({
        view: { kind: "home" },
        focusedPaneId: null,
        threads: [makeThread()],
      }),
    ).toBeNull();
    expect(
      resolveRendererRuntimeDiagnosticContext({
        view: { kind: "thread", panes: ["draft:project-a"] },
        focusedPaneId: "draft:project-a",
        threads: [makeThread()],
      }),
    ).toBeNull();
  });
});
