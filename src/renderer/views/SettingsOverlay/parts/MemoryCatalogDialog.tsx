import { useEffect, useRef, useState, type Ref } from "react";
import { Modal } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Check, Ellipsis, Pencil, Pin, PinOff, Trash2, X, type LucideIcon } from "lucide-react";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { Button, type ButtonProps } from "@/renderer/components/common";
import { BottomSheet } from "@/renderer/components/common/BottomSheet";
import { Input } from "@/renderer/components/common/Input";
import { SidebarButton, sidebarRowClass } from "@/renderer/components/common/SidebarButton";
import { useLongPress } from "@/renderer/hooks/useLongPress";
import { runMemoryCatalogCommand } from "@/renderer/state/memoryCatalog";
import { syncMemoryAcrossEnvironments } from "@/renderer/state/memorySync";
import type { MemoryEntry } from "@/shared/memory";

function readCatalog(connectionKey: string | undefined, projectId: string | undefined) {
  return runMemoryCatalogCommand(connectionKey, {
    action: "list",
    ...(projectId ? { projectId } : {}),
  });
}

function MemoryActionButton({
  icon: Icon,
  label,
  ...props
}: Pick<ButtonProps, "ref" | "variant" | "isDisabled" | "onPress"> & {
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      {...props}
      aria-label={label}
      className="max-md:aspect-square max-md:w-auto max-md:px-0"
    >
      <Icon className="size-3.5 md:hidden" aria-hidden="true" />
      <span className="hidden md:inline">{label}</span>
    </Button>
  );
}

function MemoryCatalogRow({
  entry,
  compact,
  actionRef,
  inputRef,
  editor,
  onPin,
  onEdit,
  onDelete,
}: {
  entry: MemoryEntry;
  compact: boolean;
  actionRef?: Ref<HTMLButtonElement> | undefined;
  inputRef?: Ref<HTMLInputElement> | undefined;
  editor?:
    | {
        value: string;
        onChange: (value: string) => void;
        onSave: () => void;
        onCancel: () => void;
      }
    | undefined;
  onPin: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useLingui();
  const rowRef = useRef<HTMLLIElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const hasMore = compact && !editor;
  if (!hasMore && menuOpen) setMenuOpen(false);
  const pinLabel = entry.pinned ? t`Unpin` : t`Pin to top`;
  const PinIcon = entry.pinned ? PinOff : Pin;

  function openMenu() {
    rowRef.current?.querySelector("button")?.focus();
    setMenuOpen(true);
  }

  const longPress = useLongPress(hasMore ? openMenu : null);

  function selectAction(action: () => void) {
    setMenuOpen(false);
    action();
  }

  return (
    <li ref={rowRef} className={sidebarRowClass()} {...longPress}>
      <div className="min-w-0 flex-1">
        {editor ? (
          <Input
            ref={inputRef}
            aria-label={t`Edit`}
            size="sm"
            data-overlay-escape-owner=""
            className="w-full"
            value={editor.value}
            onChange={(event) => editor.onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                editor.onSave();
              } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                editor.onCancel();
              }
            }}
          />
        ) : (
          <p className="truncate text-sm font-medium text-foreground" title={entry.summary}>
            {entry.summary}
          </p>
        )}
        <p className="truncate text-[11px] text-muted">
          {entry.category} · {entry.scope}
          {entry.pinned ? ` · ${t`Pinned`}` : ""}
          {entry.lockedByUser ? ` · ${t`Edited by you`}` : ""}
        </p>
      </div>
      {hasMore ? (
        <Button
          ref={actionRef}
          size="sm"
          variant="ghost"
          isIconOnly
          aria-label={t`Memory actions`}
          aria-expanded={menuOpen}
          aria-haspopup="dialog"
          onPress={openMenu}
        >
          <Ellipsis className="size-3.5" aria-hidden="true" />
        </Button>
      ) : (
        <div className="flex shrink-0 items-center gap-1">
          {editor ? (
            <>
              <MemoryActionButton
                icon={Check}
                label={t`Save`}
                variant="tertiary"
                isDisabled={editor.value.trim().length === 0}
                onPress={editor.onSave}
              />
              <MemoryActionButton icon={X} label={t`Cancel`} onPress={editor.onCancel} />
            </>
          ) : (
            <>
              <MemoryActionButton icon={PinIcon} label={pinLabel} onPress={onPin} />
              <MemoryActionButton ref={actionRef} icon={Pencil} label={t`Edit`} onPress={onEdit} />
            </>
          )}
          {!compact && <MemoryActionButton icon={Trash2} label={t`Delete`} onPress={onDelete} />}
        </div>
      )}
      {hasMore && menuOpen && (
        <BottomSheet label={t`Memory actions`} onClose={() => setMenuOpen(false)}>
          <div className="m-sheet-head">
            <span className="min-w-0 truncate">{entry.summary}</span>
          </div>
          <div className="m-sheet-list">
            <SidebarButton
              icon={<PinIcon className="size-4" />}
              label={pinLabel}
              onPress={() => selectAction(onPin)}
            />
            <SidebarButton
              icon={<Pencil className="size-4" />}
              label={t`Edit`}
              onPress={() => selectAction(onEdit)}
            />
            <SidebarButton
              icon={<Trash2 className="size-4 text-danger" />}
              label={<span className="text-danger">{t`Delete`}</span>}
              onPress={() => selectAction(onDelete)}
            />
          </div>
        </BottomSheet>
      )}
    </li>
  );
}

export function MemoryCatalogDialog(props: {
  connectionKey: string | undefined;
  projectId?: string;
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const compact = useCompactLayout();
  const [entries, setEntries] = useState<MemoryEntry[] | undefined>();
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [editTarget, setEditTarget] = useState<{ id: string; editing: boolean } | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [error, setError] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const editingId = editTarget?.editing ? editTarget.id : null;

  useEffect(() => {
    let active = true;
    void readCatalog(props.connectionKey, props.projectId).then(
      (next) => {
        if (active) setEntries(next as MemoryEntry[]);
      },
      () => {
        if (active) setError(true);
      },
    );
    return () => {
      active = false;
    };
  }, [props.connectionKey, props.projectId]);

  useEffect(() => {
    if (editTarget?.editing) editInputRef.current?.focus();
    else if (editTarget) editButtonRef.current?.focus();
  }, [editTarget]);

  function finishEditing() {
    setEditTarget((current) => (current ? { ...current, editing: false } : null));
  }

  async function refreshCatalog() {
    const [next] = await Promise.all([
      readCatalog(props.connectionKey, props.projectId),
      props.onChanged(),
    ]);
    setEntries(next as MemoryEntry[]);
  }

  async function refreshAfterChange() {
    await refreshCatalog();
    if (props.connectionKey !== undefined) return;
    void syncMemoryAcrossEnvironments()
      .then((result) => (result.changed ? refreshCatalog() : undefined))
      .catch(() => setError(true));
  }

  function addDraftMemory() {
    const summary = draft.trim();
    if (summary.length === 0 || adding) return;
    setAdding(true);
    setError(false);
    void runMemoryCatalogCommand(props.connectionKey, {
      action: "save",
      entry: {
        scope: props.projectId ? "project" : "global",
        ...(props.projectId ? { projectId: props.projectId } : {}),
        category: "user",
        summary,
        body: summary,
        polarity: "positive",
        pinned: false,
      },
    })
      .then(() => {
        setDraft((current) => (current === draft ? "" : current));
        return refreshAfterChange();
      })
      .catch(() => setError(true))
      .finally(() => setAdding(false));
  }

  function togglePin(entry: MemoryEntry) {
    setError(false);
    void runMemoryCatalogCommand(props.connectionKey, {
      action: "save",
      entry: {
        id: entry.id,
        scope: entry.scope,
        projectId: entry.projectId,
        category: entry.category,
        summary: entry.summary,
        body: entry.body,
        polarity: entry.polarity,
        pinned: !entry.pinned,
        quote: entry.quote,
      },
    })
      .then(refreshAfterChange)
      .catch(() => setError(true));
  }

  function saveEdit(entry: MemoryEntry) {
    const summary = editDraft.trim();
    if (summary.length === 0) return;
    setError(false);
    void runMemoryCatalogCommand(props.connectionKey, {
      action: "save",
      entry: {
        id: entry.id,
        scope: entry.scope,
        projectId: entry.projectId,
        category: entry.category,
        summary,
        body: entry.body === entry.summary ? summary : entry.body,
        polarity: entry.polarity,
        pinned: entry.pinned,
        quote: entry.quote,
      },
    })
      .then(() => {
        finishEditing();
        return refreshAfterChange();
      })
      .catch(() => setError(true));
  }

  return (
    <Modal.Backdrop isOpen onOpenChange={(open) => !open && props.onClose()}>
      <Modal.Container placement="center" scroll="inside" size="lg">
        <Modal.Dialog className="sm:max-w-2xl">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>
              <Trans>Memories</Trans>
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="space-y-3 p-4">
            {error && (
              <p className="text-xs text-danger" role="alert">
                <Trans>Couldn't load memory.</Trans>
              </p>
            )}
            <div className="flex items-center gap-2">
              <Input
                aria-label={t`Add a memory`}
                size="sm"
                className="min-w-0 flex-1"
                value={draft}
                placeholder={t`Always use bun`}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addDraftMemory();
                  }
                }}
              />
              <Button
                size="sm"
                variant="tertiary"
                isDisabled={adding || draft.trim().length === 0}
                onPress={addDraftMemory}
              >
                <Trans>Add</Trans>
              </Button>
            </div>
            {entries === undefined ? (
              error ? null : (
                <p className="px-2 py-3 text-sm text-muted" role="status">
                  <Trans>Loading…</Trans>
                </p>
              )
            ) : entries.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted">
                <Trans>No memories yet.</Trans>
              </p>
            ) : (
              <ul className="space-y-0.5">
                {entries.map((entry) => (
                  <MemoryCatalogRow
                    key={entry.id}
                    entry={entry}
                    compact={compact}
                    actionRef={editTarget?.id === entry.id ? editButtonRef : undefined}
                    inputRef={editingId === entry.id ? editInputRef : undefined}
                    editor={
                      editingId === entry.id
                        ? {
                            value: editDraft,
                            onChange: setEditDraft,
                            onSave: () => saveEdit(entry),
                            onCancel: finishEditing,
                          }
                        : undefined
                    }
                    onPin={() => togglePin(entry)}
                    onEdit={() => {
                      setEditTarget({ id: entry.id, editing: true });
                      setEditDraft(entry.summary);
                    }}
                    onDelete={() => {
                      setError(false);
                      void runMemoryCatalogCommand(props.connectionKey, {
                        action: "delete",
                        id: entry.id,
                        ...(props.projectId ? { projectId: props.projectId } : {}),
                      })
                        .then(refreshAfterChange)
                        .catch(() => setError(true));
                    }}
                  />
                ))}
              </ul>
            )}
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
