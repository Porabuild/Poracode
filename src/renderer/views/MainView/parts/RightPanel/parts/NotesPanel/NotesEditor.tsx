import { useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { StarterKit } from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { Bold, Italic, MessageSquarePlus } from "lucide-react";
import { newThreadFromText } from "@/renderer/actions/notesActions";
import { useNotesStore } from "@/renderer/state/notesStore";
import { sidebarBodyScrollClass } from "@/renderer/components/layout/sidebarChrome";

/**
 * Free-form rich-text notes editor for a project (TipTap). Persists the
 * ProseMirror JSON to the notes store (debounced). A selection bubble menu
 * offers basic formatting plus "New thread from selection", which seeds a draft
 * composer with the selected text.
 */
export function NotesEditor(props: { projectId: string }) {
  const { projectId } = props;
  const setDoc = useNotesStore((s) => s.setDoc);
  // Read the loaded document once at mount — feeding store updates back into the
  // editor on every keystroke would reset the caret.
  const initialContentRef = useRef<unknown>(
    useNotesStore.getState().byProject[projectId]?.doc ?? null,
  );
  // Guards against persisting an empty document before the editor has finished
  // initializing with the loaded content — that would clobber saved notes.
  const initializedRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Write notes for this project…" }),
    ],
    content: (initialContentRef.current as object | null) ?? "",
    editorProps: {
      attributes: { class: "lc-notes-prose", "aria-label": "Project notes" },
    },
    onCreate: () => {
      initializedRef.current = true;
    },
    onUpdate: ({ editor: ed }) => {
      if (!initializedRef.current) return;
      setDoc(projectId, ed.isEmpty ? null : ed.getJSON());
    },
  });

  if (!editor) return null;

  const startThreadFromSelection = () => {
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, "\n");
    if (text.trim()) newThreadFromText(projectId, text);
  };

  const bubbleButtonClass =
    "inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-foreground hover:bg-foreground/5";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Mouse-only affordance: clicking the padding around the editable focuses it.
          Keyboard users tab directly into the contenteditable below. */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        className={`lc-notes-editor ${sidebarBodyScrollClass()} px-3 py-2`}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            editor.commands.focus("end");
          }
        }}
      >
        <EditorContent editor={editor} className="lc-notes-content" />
      </div>
      <BubbleMenu
        editor={editor}
        className="flex items-center gap-0.5 rounded-md border border-[color:var(--border)] bg-[var(--content-background)] p-0.5 shadow-md"
      >
        <button
          type="button"
          className={`${bubbleButtonClass} ${editor.isActive("bold") ? "text-accent" : ""}`}
          title="Bold"
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="size-3.5" />
        </button>
        <button
          type="button"
          className={`${bubbleButtonClass} ${editor.isActive("italic") ? "text-accent" : ""}`}
          title="Italic"
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-3.5" />
        </button>
        <div className="mx-0.5 h-4 w-px bg-[color:var(--border)]" />
        <button
          type="button"
          className={bubbleButtonClass}
          title="Start a new thread from the selected text"
          onClick={startThreadFromSelection}
        >
          <MessageSquarePlus className="size-3.5" />
          New thread
        </button>
      </BubbleMenu>
    </div>
  );
}
