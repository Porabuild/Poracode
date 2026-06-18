import { useState } from "react";
import { PointerActivationConstraints } from "@dnd-kit/dom";
import { DragDropProvider, KeyboardSensor, PointerSensor, type DragEndEvent } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import { Plus } from "lucide-react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { newThreadFromText } from "@/renderer/actions/notesActions";
import { useNotesStore } from "@/renderer/state/notesStore";
import { TodoRow } from "./TodoRow";

const todoListSensors = [
  PointerSensor.configure({
    activationConstraints: [new PointerActivationConstraints.Distance({ value: 5 })],
  }),
  KeyboardSensor.configure({
    keyboardCodes: {
      start: ["Space"],
      cancel: ["Escape"],
      end: ["Space", "Enter", "Tab"],
      up: ["ArrowUp"],
      down: ["ArrowDown"],
      left: ["ArrowLeft"],
      right: ["ArrowRight"],
    },
  }),
];

/** Structured per-project to-do list rendered alongside the notes editor. */
export function TodoList(props: { projectId: string }) {
  const { projectId } = props;
  const { t } = useLingui();
  const todos = useNotesStore((s) => s.byProject[projectId]?.todos ?? []);
  const addTodo = useNotesStore((s) => s.addTodo);
  const toggleTodo = useNotesStore((s) => s.toggleTodo);
  const updateTodoText = useNotesStore((s) => s.updateTodoText);
  const removeTodo = useNotesStore((s) => s.removeTodo);
  const moveTodo = useNotesStore((s) => s.moveTodo);
  const [draft, setDraft] = useState("");

  const remaining = todos.reduce((n, todo) => (todo.done ? n : n + 1), 0);

  function handleDragEnd(event: DragEndEvent) {
    if (event.canceled) return;
    const src = event.operation.source;
    if (!src || !isSortable(src)) return;
    if (src.initialIndex === src.index) return;
    moveTodo(projectId, src.initialIndex, src.index);
  }

  const submitNew = () => {
    const text = draft.trim();
    if (!text) return;
    addTodo(projectId, text);
    setDraft("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-[color:var(--border)] px-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
          <Trans>To-dos</Trans>
        </span>
        {todos.length > 0 ? (
          <span className="text-[11px] text-muted/70">
            <Plural value={remaining} one="# open" other="# open" />
          </span>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pl-2 pr-3 py-1">
        <DragDropProvider sensors={todoListSensors} onDragEnd={handleDragEnd}>
          <div className="flex flex-col gap-0.5">
            {todos.map((todo, index) => (
              <TodoRow
                key={todo.id}
                todo={todo}
                index={index}
                projectId={projectId}
                onToggle={() => toggleTodo(projectId, todo.id)}
                onChangeText={(text) => updateTodoText(projectId, todo.id, text)}
                onRemove={() => removeTodo(projectId, todo.id)}
                onNewThread={() => newThreadFromText(projectId, todo.text)}
              />
            ))}
          </div>
        </DragDropProvider>
        {/* The add-to-do field is the final row of the list, styled like a to-do. */}
        <div className="mt-0.5 flex items-center gap-2 rounded pl-1 pr-2 py-1">
          <Plus className="size-3.5 shrink-0 text-muted/70" />
          <input
            className="m-0 h-5 min-w-0 flex-1 border-0 bg-transparent p-0 text-xs leading-5 text-foreground placeholder:text-muted/60 outline-none"
            placeholder={t`Add a to-do…`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitNew();
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
