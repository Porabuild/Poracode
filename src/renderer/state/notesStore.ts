import { create } from "zustand";
import type { NotesTodoItem } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";

export type NotesLoadStatus = "unloaded" | "loading" | "ready";

export interface ProjectNotesEntry {
  status: NotesLoadStatus;
  /** TipTap (ProseMirror) JSON document, or null when the editor is empty. */
  doc: unknown | null;
  todos: NotesTodoItem[];
}

interface NotesStore {
  byProject: Record<string, ProjectNotesEntry>;
  /** Lazily load a project's notes from the DB (no-op once loading/ready). */
  ensureLoaded: (projectId: string) => void;
  setDoc: (projectId: string, doc: unknown | null) => void;
  addTodo: (projectId: string, text: string) => void;
  toggleTodo: (projectId: string, todoId: string) => void;
  updateTodoText: (projectId: string, todoId: string, text: string) => void;
  removeTodo: (projectId: string, todoId: string) => void;
  /** Move a to-do from one index to another (used by drag-and-drop sorting). */
  moveTodo: (projectId: string, fromIndex: number, toIndex: number) => void;
  /** Persist the project's notes immediately, cancelling any pending debounce. */
  flush: (projectId: string) => void;
  flushAll: () => void;
}

const PERSIST_DEBOUNCE_MS = 600;
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();

function hasBridge(): boolean {
  return typeof window !== "undefined" && !!window.poracode?.dbSetProjectNotes;
}

function makeTodoId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `todo-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function persistNow(projectId: string, entry: ProjectNotesEntry): void {
  if (!hasBridge()) return;
  void readBridge()
    .dbSetProjectNotes({
      projectId,
      doc: entry.doc ?? null,
      todos: entry.todos,
      updatedAt: new Date().toISOString(),
    })
    .catch((error) => {
      console.error("[notes] failed to persist project notes", error);
    });
}

function clearTimer(projectId: string): void {
  const existing = persistTimers.get(projectId);
  if (existing) {
    clearTimeout(existing);
    persistTimers.delete(projectId);
  }
}

function schedulePersist(projectId: string): void {
  clearTimer(projectId);
  persistTimers.set(
    projectId,
    setTimeout(() => {
      persistTimers.delete(projectId);
      const entry = useNotesStore.getState().byProject[projectId];
      if (entry && entry.status === "ready") {
        persistNow(projectId, entry);
      }
    }, PERSIST_DEBOUNCE_MS),
  );
}

export const useNotesStore = create<NotesStore>((set, get) => {
  /** Apply a change to a project's entry (creating a ready entry if needed) and schedule a persist. */
  function mutate(
    projectId: string,
    updater: (entry: ProjectNotesEntry) => ProjectNotesEntry,
  ): void {
    set((state) => {
      const current = state.byProject[projectId] ?? { status: "ready", doc: null, todos: [] };
      return { byProject: { ...state.byProject, [projectId]: updater(current) } };
    });
    schedulePersist(projectId);
  }

  return {
    byProject: {},

    ensureLoaded: (projectId) => {
      const entry = get().byProject[projectId];
      if (entry && entry.status !== "unloaded") return;
      const setReady = (doc: unknown | null, todos: NotesTodoItem[]) =>
        set((state) => ({
          byProject: { ...state.byProject, [projectId]: { status: "ready", doc, todos } },
        }));
      set((state) => ({
        byProject: {
          ...state.byProject,
          [projectId]: {
            status: "loading",
            doc: entry?.doc ?? null,
            todos: entry?.todos ?? [],
          },
        },
      }));
      if (!hasBridge()) {
        setReady(null, []);
        return;
      }
      void readBridge()
        .dbGetProjectNotes(projectId)
        .then((data) => setReady(data?.doc ?? null, data?.todos ?? []))
        .catch((error) => {
          console.error("[notes] failed to load project notes", error);
          setReady(null, []);
        });
    },

    setDoc: (projectId, doc) => mutate(projectId, (entry) => ({ ...entry, doc })),

    addTodo: (projectId, text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const todo: NotesTodoItem = {
        id: makeTodoId(),
        text: trimmed,
        done: false,
        createdAt: new Date().toISOString(),
      };
      mutate(projectId, (entry) => ({ ...entry, todos: [...entry.todos, todo] }));
    },

    toggleTodo: (projectId, todoId) =>
      mutate(projectId, (entry) => ({
        ...entry,
        todos: entry.todos.map((t) => (t.id === todoId ? { ...t, done: !t.done } : t)),
      })),

    updateTodoText: (projectId, todoId, text) =>
      mutate(projectId, (entry) => ({
        ...entry,
        todos: entry.todos.map((t) => (t.id === todoId ? { ...t, text } : t)),
      })),

    removeTodo: (projectId, todoId) =>
      mutate(projectId, (entry) => ({
        ...entry,
        todos: entry.todos.filter((t) => t.id !== todoId),
      })),

    moveTodo: (projectId, fromIndex, toIndex) =>
      mutate(projectId, (entry) => {
        if (
          fromIndex === toIndex ||
          fromIndex < 0 ||
          toIndex < 0 ||
          fromIndex >= entry.todos.length ||
          toIndex >= entry.todos.length
        ) {
          return entry;
        }
        const todos = [...entry.todos];
        const [moved] = todos.splice(fromIndex, 1);
        if (!moved) return entry;
        todos.splice(toIndex, 0, moved);
        return { ...entry, todos };
      }),

    flush: (projectId) => {
      clearTimer(projectId);
      const entry = get().byProject[projectId];
      if (entry && entry.status === "ready") {
        persistNow(projectId, entry);
      }
    },

    flushAll: () => {
      for (const [projectId, entry] of Object.entries(get().byProject)) {
        clearTimer(projectId);
        if (entry.status === "ready") {
          persistNow(projectId, entry);
        }
      }
    },
  };
});

// Best-effort persistence of any pending (debounced) edits on app close/reload.
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    useNotesStore.getState().flushAll();
  });
}
