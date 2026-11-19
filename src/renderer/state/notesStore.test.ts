import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectNotesSaveResult, ProjectNotesGuardedWrite } from "@/shared/contracts";
import { useNotesStore } from "./notesStore";

const bridge = vi.hoisted(() => ({
  dbGetProjectNotes: vi.fn<(projectId: string) => Promise<unknown>>(),
  dbSetProjectNotes: vi.fn<(notes: ProjectNotesGuardedWrite) => Promise<ProjectNotesSaveResult>>(),
}));
const toast = vi.hoisted(() => ({ danger: vi.fn<(message: string) => void>() }));

vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));
vi.mock("@heroui/react", () => ({ toast }));

const PID = "project-1";

beforeEach(() => {
  useNotesStore.getState().resetSession();
  bridge.dbGetProjectNotes.mockReset().mockResolvedValue(null);
  bridge.dbSetProjectNotes.mockReset().mockImplementation(async ({ projectId, replacement }) => ({
    status: "saved",
    notes: { projectId, ...replacement, updatedAt: "saved-at", revision: "saved-revision" },
  }));
  toast.danger.mockReset();
  // hasBridge() in the store checks for dbSetProjectNotes on window.poracode.
  window.poracode = bridge as unknown as typeof window.poracode;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("notesStore todos", () => {
  it("adds, toggles, edits, and removes a todo", () => {
    const s = useNotesStore.getState();
    s.addTodo(PID, "  write tests  ");
    let todos = useNotesStore.getState().byProject[PID]!.todos;
    expect(todos).toHaveLength(1);
    expect(todos[0]!.text).toBe("write tests"); // trimmed
    expect(todos[0]!.done).toBe(false);

    const id = todos[0]!.id;
    s.toggleTodo(PID, id);
    expect(useNotesStore.getState().byProject[PID]!.todos[0]!.done).toBe(true);

    s.updateTodoText(PID, id, "write more tests");
    expect(useNotesStore.getState().byProject[PID]!.todos[0]!.text).toBe("write more tests");

    s.removeTodo(PID, id);
    expect(useNotesStore.getState().byProject[PID]!.todos).toHaveLength(0);
  });

  it("ignores blank todos", () => {
    useNotesStore.getState().addTodo(PID, "   ");
    expect(useNotesStore.getState().byProject[PID]?.todos ?? []).toHaveLength(0);
  });

  it("moves a todo by index (drag-and-drop)", () => {
    const s = useNotesStore.getState();
    s.addTodo(PID, "a");
    s.addTodo(PID, "b");
    s.addTodo(PID, "c");
    s.moveTodo(PID, 0, 2); // move "a" to the end
    expect(useNotesStore.getState().byProject[PID]!.todos.map((t) => t.text)).toEqual([
      "b",
      "c",
      "a",
    ]);
    s.moveTodo(PID, 2, 0); // move "a" back to the front
    expect(useNotesStore.getState().byProject[PID]!.todos.map((t) => t.text)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("moveTodo ignores out-of-range indices", () => {
    const s = useNotesStore.getState();
    s.addTodo(PID, "only");
    s.moveTodo(PID, 0, 5);
    expect(useNotesStore.getState().byProject[PID]!.todos.map((t) => t.text)).toEqual(["only"]);
  });
});

describe("notesStore persistence", () => {
  it("debounces writes to the bridge", async () => {
    vi.useFakeTimers();
    useNotesStore.getState().addTodo(PID, "task");
    expect(bridge.dbSetProjectNotes).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(bridge.dbSetProjectNotes).toHaveBeenCalledTimes(1);
    const arg = bridge.dbSetProjectNotes.mock.calls[0]![0];
    expect(arg.projectId).toBe(PID);
    expect(arg.baseRevision).toBeNull();
    expect(arg.replacement.todos).toHaveLength(1);
  });

  it("flush persists immediately and cancels the pending debounce", () => {
    vi.useFakeTimers();
    const s = useNotesStore.getState();
    s.addTodo(PID, "task");
    s.flush(PID);
    expect(bridge.dbSetProjectNotes).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(bridge.dbSetProjectNotes).toHaveBeenCalledTimes(1); // not double-written
  });

  it("preserves the optimistic edit and surfaces a failed write", async () => {
    vi.useFakeTimers();
    useNotesStore.getState().refresh(PID);
    await vi.advanceTimersByTimeAsync(0);
    bridge.dbSetProjectNotes.mockRejectedValueOnce(new Error("save failed"));

    useNotesStore.getState().addTodo(PID, "task");
    await vi.advanceTimersByTimeAsync(600);

    expect(useNotesStore.getState().byProject[PID]!.todos.map((todo) => todo.text)).toEqual([
      "task",
    ]);
    expect(toast.danger).toHaveBeenCalledWith("save failed");
  });

  it("never sends a clean cached snapshot when the panel closes", async () => {
    vi.useFakeTimers();
    const state = useNotesStore.getState();
    state.refresh(PID);
    await vi.advanceTimersByTimeAsync(0);
    state.flush(PID);
    state.flushAll();
    expect(bridge.dbSetProjectNotes).not.toHaveBeenCalled();
  });

  it("serializes saves so the next draft uses the acknowledged revision", async () => {
    const pending = Promise.withResolvers<ProjectNotesSaveResult>();
    bridge.dbSetProjectNotes.mockReturnValueOnce(pending.promise);
    const state = useNotesStore.getState();
    state.setDoc(PID, "first");
    state.flush(PID);
    state.setDoc(PID, "second");
    state.flush(PID);
    expect(bridge.dbSetProjectNotes).toHaveBeenCalledTimes(1);
    pending.resolve({
      status: "saved",
      notes: {
        projectId: PID,
        doc: "first",
        todos: [],
        updatedAt: "first-save",
        revision: "revision-1",
      },
    });
    await vi.waitFor(() =>
      expect(bridge.dbSetProjectNotes).toHaveBeenLastCalledWith({
        projectId: PID,
        baseRevision: "revision-1",
        replacement: { doc: "second", todos: [] },
      }),
    );
  });

  it("protects the draft after a conflict until the saved version is explicitly reloaded", async () => {
    const saved = {
      projectId: PID,
      doc: "other edit",
      todos: [],
      updatedAt: "saved",
      revision: "latest",
    };
    bridge.dbSetProjectNotes.mockResolvedValueOnce({ status: "conflict", notes: saved });
    const state = useNotesStore.getState();
    state.setDoc(PID, "draft");
    state.flush(PID);
    await vi.waitFor(() =>
      expect(useNotesStore.getState().byProject[PID]).toMatchObject({
        doc: "draft",
        conflict: true,
      }),
    );
    state.flushAll();
    expect(bridge.dbSetProjectNotes).toHaveBeenCalledTimes(1);
    bridge.dbGetProjectNotes.mockResolvedValueOnce(saved);
    state.refresh(PID, true);
    await vi.waitFor(() =>
      expect(useNotesStore.getState().byProject[PID]).toEqual({
        doc: "other edit",
        status: "ready",
        todos: [],
      }),
    );
  });
});

describe("notesStore loading", () => {
  it("refresh hydrates from the bridge", async () => {
    bridge.dbGetProjectNotes.mockResolvedValueOnce({
      projectId: PID,
      doc: { type: "doc" },
      todos: [{ id: "t1", text: "x", done: false, createdAt: "2026-01-01T00:00:00.000Z" }],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    useNotesStore.getState().refresh(PID);
    await vi.waitFor(() => {
      expect(useNotesStore.getState().byProject[PID]?.status).toBe("ready");
    });
    expect(bridge.dbGetProjectNotes).toHaveBeenCalledWith(PID);
    expect(useNotesStore.getState().byProject[PID]!.todos).toHaveLength(1);
  });

  it("refresh leaves a dirty draft alone", async () => {
    useNotesStore.setState({ byProject: { [PID]: { status: "ready", doc: null, todos: [] } } });
    useNotesStore.getState().refresh(PID);
    expect(bridge.dbGetProjectNotes).not.toHaveBeenCalled();
  });

  it("ignores a load that resolves after the desktop session resets", async () => {
    let resolveLoad:
      | ((value: { projectId: string; doc: null; todos: []; updatedAt: string }) => void)
      | undefined;
    bridge.dbGetProjectNotes.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLoad = resolve;
      }),
    );

    useNotesStore.getState().refresh(PID);
    useNotesStore.getState().resetSession();
    resolveLoad?.({
      projectId: PID,
      doc: null,
      todos: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await vi.waitFor(() => expect(bridge.dbGetProjectNotes).toHaveBeenCalledOnce());

    expect(useNotesStore.getState().byProject).toEqual({});
  });

  it("surfaces a failed load", async () => {
    bridge.dbGetProjectNotes.mockRejectedValueOnce(new Error("load failed"));

    useNotesStore.getState().refresh(PID);

    await vi.waitFor(() => expect(toast.danger).toHaveBeenCalledWith("load failed"));
  });
});
