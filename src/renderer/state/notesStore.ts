import { create } from "zustand";
import { toast } from "@heroui/react";
import type { NotesTodoItem } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { isRemoteTransportFailure } from "@/shared/remote/client";
import { readBridge } from "@/renderer/bridge";
import { hasAnyClientBridge } from "@/renderer/clientRuntime";

export type NotesLoadStatus = "unloaded" | "loading" | "ready";

export interface ProjectNotesEntry {
  status: NotesLoadStatus;
  /** TipTap (ProseMirror) JSON document, or null when the editor is empty. */
  doc: unknown | null;
  todos: NotesTodoItem[];
  conflict?: true;
}

interface NotesStore {
  byProject: Record<string, ProjectNotesEntry>;
  /** Refresh saved notes on open when clean, or discard a conflicted draft on explicit reload. */
  refresh: (projectId: string, discardDraft?: boolean) => void;
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
  /** Flush the current desktop's edits, cancel pending loads, and clear its cache. */
  resetSession: () => void;
}

const PERSIST_DEBOUNCE_MS = 600;
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();
const persistedEntries = new Map<string, { entry: ProjectNotesEntry; revision: string | null }>();
const activeWrites = new Map<string, object>();
const queuedWrites = new Set<string>();
let sessionGeneration = 0;

function hasBridge(): boolean {
  return hasAnyClientBridge();
}

function makeTodoId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `todo-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function persistNow(projectId: string, entry: ProjectNotesEntry): void {
  if (!hasBridge()) return;
  const confirmed = persistedEntries.get(projectId);
  if (entry.conflict || entry === confirmed?.entry) return;
  if (activeWrites.has(projectId)) {
    queuedWrites.add(projectId);
    return;
  }
  const write = {};
  activeWrites.set(projectId, write);
  const persistGeneration = sessionGeneration;
  const request = () =>
    readBridge().dbSetProjectNotes({
      projectId,
      baseRevision: confirmed?.revision ?? null,
      replacement: { doc: entry.doc ?? null, todos: entry.todos },
    });
  const currentSession = () => persistGeneration === sessionGeneration;
  const persist = async () => {
    let result;
    try {
      result = await request();
    } catch (error) {
      if (!isRemoteTransportFailure(error) || !currentSession()) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (!currentSession()) return;
      result = await request();
    }
    if (!currentSession()) return;
    if (result?.status === "conflict") {
      clearTimer(projectId);
      queuedWrites.delete(projectId);
      useNotesStore.setState((state) => {
        const draft = state.byProject[projectId];
        return draft
          ? {
              byProject: { ...state.byProject, [projectId]: { ...draft, conflict: true } },
            }
          : state;
      });
      return;
    }
    if (result?.status !== "saved" || result.notes.projectId !== projectId) {
      throw new Error("The host did not confirm the guarded Notes save.");
    }
    persistedEntries.set(projectId, { entry, revision: result.notes.revision ?? null });
  };
  void persist()
    .catch((error: unknown) => {
      if (currentSession()) {
        console.error("[notes] failed to persist project notes", error);
        toast.danger(friendlyError(error));
        // Keep the draft. A later save still uses the last confirmed revision.
      }
    })
    .finally(() => {
      if (activeWrites.get(projectId) !== write) return;
      activeWrites.delete(projectId);
      if (queuedWrites.delete(projectId)) useNotesStore.getState().flush(projectId);
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

    refresh: (projectId, discardDraft = false) => {
      const entry = get().byProject[projectId];
      if (activeWrites.has(projectId) || entry?.status === "loading") return;
      if (
        !discardDraft &&
        entry?.status === "ready" &&
        entry !== persistedEntries.get(projectId)?.entry
      )
        return;
      const loadGeneration = sessionGeneration;
      const loading: ProjectNotesEntry = {
        status: "loading",
        doc: entry?.doc ?? null,
        todos: entry?.todos ?? [],
      };
      const isCurrentLoad = () =>
        loadGeneration === sessionGeneration && get().byProject[projectId] === loading;
      const setReady = (doc: unknown | null, todos: NotesTodoItem[], revision: string | null) => {
        if (!isCurrentLoad()) return;
        const ready: ProjectNotesEntry = { status: "ready", doc, todos };
        persistedEntries.set(projectId, { entry: ready, revision });
        set((state) => ({ byProject: { ...state.byProject, [projectId]: ready } }));
      };
      clearTimer(projectId);
      set((state) => ({
        byProject: { ...state.byProject, [projectId]: loading },
      }));
      if (!hasBridge()) {
        setReady(null, [], null);
        return;
      }
      const load = (attempt: number) => {
        void readBridge()
          .dbGetProjectNotes(projectId)
          .then((data) => setReady(data?.doc ?? null, data?.todos ?? [], data?.revision ?? null))
          .catch((error) => {
            if (attempt === 0 && isCurrentLoad() && isRemoteTransportFailure(error)) {
              setTimeout(() => {
                if (isCurrentLoad()) load(1);
              }, 500);
              return;
            }
            console.error("[notes] failed to load project notes", error);
            toast.danger(friendlyError(error));
            if (!isCurrentLoad()) return;
            if (entry) {
              set((state) => ({ byProject: { ...state.byProject, [projectId]: entry } }));
            } else {
              setReady(null, [], null);
            }
          });
      };
      load(0);
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

    resetSession: () => {
      get().flushAll();
      sessionGeneration += 1;
      persistedEntries.clear();
      activeWrites.clear();
      queuedWrites.clear();
      set({ byProject: {} });
    },
  };
});

// Best-effort persistence of any pending (debounced) edits on app close/reload.
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    useNotesStore.getState().flushAll();
  });
}
