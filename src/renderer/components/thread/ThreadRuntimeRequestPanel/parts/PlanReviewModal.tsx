import { useId, useState, type KeyboardEvent } from "react";
import { Button, Modal, TextArea } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import { Plus } from "lucide-react";
import {
  formatPlanFeedbackMessage,
  normalizePlanRange,
  sortPlanNotes,
  splitPlanLines,
  type PlanLineNote,
  type PlanLineRange,
} from "../planFeedback";
import { describePlanLines } from "../planLineDisplay";
import { PlanComment, PlanCommentForm } from "./PlanCommentCard";
import { PlanLineContent } from "./PlanLineContent";

/**
 * Full-screen review of a proposed plan. Every row is one source line, styled
 * lightly so it reads like the rendered plan while comments stay anchored to
 * the exact reviewed text. Click a line (or drag across line numbers, or
 * Shift-click) to open the comment form under the selection. Comments and
 * the overall feedback are drafts owned by the caller until Request revision.
 */
export function PlanReviewModal(props: {
  plan: string;
  isOpen: boolean;
  isDisabled: boolean;
  notes: readonly PlanLineNote[];
  overall: string;
  onNotesChange: (notes: PlanLineNote[]) => void;
  onOverallChange: (overall: string) => void;
  onClose: () => void;
  onSubmit: (message: string) => void;
}) {
  const { plan, isOpen, isDisabled, notes, overall } = props;
  const { onNotesChange, onOverallChange, onClose, onSubmit } = props;
  const { t } = useLingui();
  const idPrefix = useId();
  const views = describePlanLines(splitPlanLines(plan));
  const [anchor, setAnchor] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  // Roving tab stop: one line number is tabbable; arrow keys move between them.
  const [tabLine, setTabLine] = useState(1);
  const range: PlanLineRange | null =
    anchor !== null && focus !== null ? normalizePlanRange(anchor, focus) : null;
  const formOpen = range !== null && !dragging;
  const pendingText = formOpen ? body.trim() : "";
  const ordered = sortPlanNotes(notes);

  function closeForm() {
    // The form unmounts with focus inside it; return focus to the commented
    // line rather than letting the dialog drop it on its close button.
    const line = range?.endLine;
    if (line !== undefined) {
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLButtonElement>(`[data-plan-line="${line}"]`)
          ?.focus({ preventScroll: true }),
      );
    }
    setAnchor(null);
    setFocus(null);
    setBody("");
    setEditingId(null);
  }

  /**
   * A plain click elsewhere would discard what is typed in the open form, so
   * keep the form and return focus to it instead. Shift-click still extends.
   */
  function keepsTypedComment(extend: boolean): boolean {
    if (extend || !pendingText) return false;
    document.querySelector<HTMLTextAreaElement>("[data-plan-comment-input]")?.focus();
    return true;
  }

  function select(line: number, extend: boolean) {
    if (keepsTypedComment(extend)) return;
    if (extend && anchor !== null) {
      setFocus(line);
      return;
    }
    setAnchor(line);
    setFocus(line);
    setBody("");
    setEditingId(null);
  }

  /** Notes with the open form's text applied (added, or replacing the edited note). */
  function notesWithComment(text: string): PlanLineNote[] {
    if (!range || !text) return [...notes];
    return editingId
      ? notes.map((note) => (note.id === editingId ? { ...note, ...range, text } : note))
      : [...notes, { id: crypto.randomUUID(), ...range, text }];
  }

  function submitComment() {
    if (!pendingText) return;
    onNotesChange(notesWithComment(pendingText));
    closeForm();
  }

  function editNote(note: PlanLineNote) {
    if (keepsTypedComment(false)) return;
    setAnchor(note.startLine);
    setFocus(note.endLine);
    setBody(note.text);
    setEditingId(note.id);
  }

  function rangeLabel(r: PlanLineRange) {
    return r.startLine === r.endLine
      ? t`Line ${r.startLine}`
      : t`Lines ${r.startLine}–${r.endLine}`;
  }

  function gutterKeyDown(event: KeyboardEvent, line: number) {
    const target =
      event.key === "ArrowDown"
        ? line + 1
        : event.key === "ArrowUp"
          ? line - 1
          : event.key === "Home"
            ? 1
            : event.key === "End"
              ? views.length
              : null;
    if (target !== null) {
      event.preventDefault();
      document
        .querySelector<HTMLButtonElement>(
          `[data-plan-line="${Math.min(views.length, Math.max(1, target))}"]`,
        )
        ?.focus();
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    select(line, event.shiftKey);
  }

  const commentCount = t`${plural(notes.length, { one: "# comment", other: "# comments" })}`;

  return (
    <Modal>
      <Modal.Backdrop
        isOpen={isOpen}
        isDismissable
        onOpenChange={(nextOpen) => {
          if (!nextOpen) onClose();
        }}
      >
        <Modal.Container placement="center" size="cover" className="items-center p-0 sm:p-6">
          <Modal.Dialog className="flex h-dvh w-screen flex-col overflow-hidden rounded-none bg-[var(--content-background)] sm:h-[min(92vh,1000px)] sm:w-[min(1280px,96vw)] sm:rounded-4xl">
            <Modal.CloseTrigger aria-label={t`Close`} />
            <Modal.Header>
              <Modal.Heading>{t`Review plan`}</Modal.Heading>
              <p className="text-xs text-muted">
                {t`Click a line to comment on it. Drag across line numbers or Shift-click to select a range.`}
              </p>
            </Modal.Header>
            <Modal.Body className="min-h-0 flex-1 p-0">
              <div className="flex h-full min-h-0 flex-col overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:overflow-hidden">
                <div
                  role="group"
                  aria-label={t`Plan lines`}
                  className="min-h-0 px-2 pb-56 lg:overflow-y-auto"
                >
                  <div className="mx-auto max-w-3xl">
                    {views.map((view, index) => {
                      const lineNumber = index + 1;
                      const selected =
                        !!range && lineNumber >= range.startLine && lineNumber <= range.endLine;
                      const noted = notes.some(
                        (note) => lineNumber >= note.startLine && lineNumber <= note.endLine,
                      );
                      const notesHere = ordered.filter(
                        (note) => note.endLine === lineNumber && note.id !== editingId,
                      );
                      return (
                        <div key={lineNumber}>
                          <div
                            className={`group/line flex min-w-0 rounded-xl ${
                              selected
                                ? "bg-accent/15"
                                : noted
                                  ? "bg-accent/[0.06] hover:bg-accent/10"
                                  : "hover:bg-[var(--row-hover)]"
                            }`}
                            onMouseEnter={() => {
                              if (dragging) setFocus(lineNumber);
                            }}
                          >
                            <button
                              type="button"
                              aria-pressed={selected}
                              aria-label={t`Plan line ${lineNumber}`}
                              aria-describedby={`${idPrefix}-text-${lineNumber}`}
                              tabIndex={lineNumber === tabLine ? 0 : -1}
                              disabled={isDisabled}
                              data-plan-line={lineNumber}
                              className={`relative flex w-12 shrink-0 cursor-pointer items-start justify-end rounded-xl pt-[3px] pr-3 font-mono text-[11px] tabular-nums outline-none select-none focus-visible:ring-2 focus-visible:ring-focus/50 ${
                                selected
                                  ? "text-foreground"
                                  : noted
                                    ? "text-accent"
                                    : "text-muted/60"
                              }`}
                              onFocus={() => setTabLine(lineNumber)}
                              onMouseDown={(event) => {
                                // Right- and modifier-clicks open menus; they must not start a drag.
                                if (event.button !== 0 || event.ctrlKey || event.metaKey) return;
                                event.preventDefault();
                                if (keepsTypedComment(event.shiftKey)) return;
                                // Attached here, not in an effect, so a release in the same
                                // tick as the press still ends the drag.
                                window.addEventListener("mouseup", () => setDragging(false), {
                                  once: true,
                                });
                                setDragging(true);
                                select(lineNumber, event.shiftKey);
                              }}
                              onKeyDown={(event) => gutterKeyDown(event, lineNumber)}
                            >
                              <span className="group-hover/line:opacity-0">{lineNumber}</span>
                              <Plus
                                aria-hidden
                                className="absolute top-[4px] right-3 size-3.5 text-accent opacity-0 group-hover/line:opacity-100"
                              />
                            </button>
                            {/* Clicking text selects the line unless the user is selecting text to copy. */}
                            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- the line-number button is the keyboard control */}
                            <div
                              id={`${idPrefix}-text-${lineNumber}`}
                              className="min-w-0 flex-1 cursor-text py-0.5 pr-3"
                              onClick={(event) => {
                                if (isDisabled || window.getSelection()?.toString()) return;
                                select(lineNumber, event.shiftKey);
                              }}
                            >
                              <PlanLineContent view={view} />
                            </div>
                          </div>
                          {formOpen && range.endLine === lineNumber ? (
                            // Zero-height anchor: the form floats over the lines below
                            // the selection like a menu instead of pushing them down.
                            <div className="relative z-20 h-0">
                              <div className="absolute top-1.5 left-12">
                                <PlanCommentForm
                                  label={rangeLabel(range)}
                                  value={body}
                                  isEditing={editingId !== null}
                                  onChange={setBody}
                                  onSubmit={submitComment}
                                  onCancel={closeForm}
                                />
                              </div>
                            </div>
                          ) : null}
                          {notesHere.length > 0 ? (
                            <div className="flex flex-col gap-1.5 py-1.5 pr-3 pl-12">
                              {notesHere.map((note) => (
                                <PlanComment
                                  key={note.id}
                                  id={`plan-comment-${note.id}`}
                                  label={rangeLabel(note)}
                                  text={note.text}
                                  isDisabled={isDisabled}
                                  onEdit={() => editNote(note)}
                                  onRemove={() =>
                                    onNotesChange(notes.filter((n) => n.id !== note.id))
                                  }
                                />
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <aside
                  aria-label={t`Comments`}
                  className="flex min-h-0 flex-col gap-5 border-[var(--hairline-soft)] px-5 pb-4 lg:overflow-y-auto lg:border-l"
                >
                  <section className="flex flex-col gap-2">
                    <div className="flex items-baseline justify-between">
                      <h3 className="text-xs font-semibold">{t`Comments`}</h3>
                      <span className="text-[11px] text-muted" role="status">
                        {commentCount}
                      </span>
                    </div>
                    {ordered.length === 0 ? (
                      <p className="text-xs text-muted">
                        {t`Select lines in the plan to comment on them.`}
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-0.5">
                        {ordered.map((note) => (
                          <li key={note.id}>
                            <button
                              type="button"
                              className="flex w-full min-w-0 items-baseline gap-2 rounded-xl px-2 py-1 text-left text-xs hover:bg-[var(--row-hover)]"
                              onClick={() =>
                                document
                                  .getElementById(`plan-comment-${note.id}`)
                                  ?.scrollIntoView({ block: "center", behavior: "smooth" })
                              }
                            >
                              <span className="shrink-0 font-medium text-muted">
                                {rangeLabel(note)}
                              </span>
                              <span className="min-w-0 truncate">{note.text}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                  <section className="flex flex-col gap-2">
                    <h3 className="text-xs font-semibold">{t`Overall feedback`}</h3>
                    <TextArea
                      aria-label={t`Overall feedback`}
                      className="min-h-24 w-full resize-y text-[13px]"
                      placeholder={t`Optional comments on the plan as a whole`}
                      rows={4}
                      value={overall}
                      variant="secondary"
                      onChange={(event) => onOverallChange(event.target.value)}
                    />
                  </section>
                </aside>
              </div>
            </Modal.Body>
            <Modal.Footer className="pt-3">
              <Button slot="close" variant="ghost" className="text-muted">
                {t`Close`}
              </Button>
              <Button
                variant="tertiary"
                isDisabled={isDisabled || (notes.length === 0 && !pendingText && !overall.trim())}
                onPress={() => {
                  // Text still in the open form is feedback the user means to send; save it
                  // as a draft too, so a failed answer to the review cannot lose it.
                  const finalNotes = notesWithComment(pendingText);
                  if (pendingText) onNotesChange(finalNotes);
                  onSubmit(formatPlanFeedbackMessage(plan, finalNotes, overall));
                }}
              >
                {t`Request revision`}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
