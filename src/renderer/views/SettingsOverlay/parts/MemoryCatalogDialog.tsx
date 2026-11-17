import { useEffect, useRef, useState } from "react";
import { Modal } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Check, Pencil, Pin, PinOff, Trash2, X, type LucideIcon } from "lucide-react";
import { readBridge } from "@/renderer/bridge";
import { Button, type ButtonProps } from "@/renderer/components/common";
import { Input } from "@/renderer/components/common/Input";
import { sidebarRowClass } from "@/renderer/components/common/SidebarButton";
import { syncMemoryAcrossEnvironments } from "@/renderer/state/memorySync";
import type { MemoryEntry } from "@/shared/memory";

function readCatalog(projectId: string | undefined) {
  return readBridge().memoryCommand({ action: "list", ...(projectId ? { projectId } : {}) });
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

export function MemoryCatalogDialog(props: {
  projectId?: string;
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useLingui();
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
    void readCatalog(props.projectId).then(
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
  }, [props.projectId]);

  useEffect(() => {
    if (editTarget?.editing) editInputRef.current?.focus();
    else if (editTarget) editButtonRef.current?.focus();
  }, [editTarget]);

  function finishEditing() {
    setEditTarget((current) => (current ? { ...current, editing: false } : null));
  }

  async function refreshCatalog() {
    const [next] = await Promise.all([readCatalog(props.projectId), props.onChanged()]);
    setEntries(next as MemoryEntry[]);
  }

  async function refreshAfterChange() {
    await refreshCatalog();
    void syncMemoryAcrossEnvironments()
      .then((result) => (result.changed ? refreshCatalog() : undefined))
      .catch(() => setError(true));
  }

  function addDraftMemory() {
    const summary = draft.trim();
    if (summary.length === 0 || adding) return;
    setAdding(true);
    setError(false);
    void readBridge()
      .memoryCommand({
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
    void readBridge()
      .memoryCommand({
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
    void readBridge()
      .memoryCommand({
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
                  <li key={entry.id} className={sidebarRowClass()}>
                    <div className="min-w-0 flex-1">
                      {editingId === entry.id ? (
                        <Input
                          ref={editInputRef}
                          aria-label={t`Edit`}
                          size="sm"
                          data-overlay-escape-owner=""
                          className="w-full"
                          value={editDraft}
                          onChange={(event) => setEditDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              saveEdit(entry);
                            } else if (event.key === "Escape") {
                              event.preventDefault();
                              event.stopPropagation();
                              finishEditing();
                            }
                          }}
                        />
                      ) : (
                        <p
                          className="truncate text-sm font-medium text-foreground"
                          title={entry.summary}
                        >
                          {entry.summary}
                        </p>
                      )}
                      <p className="truncate text-[11px] text-muted">
                        {entry.category} · {entry.scope}
                        {entry.pinned ? ` · ${t`Pinned`}` : ""}
                        {entry.lockedByUser ? ` · ${t`Edited by you`}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {editingId === entry.id ? (
                        <>
                          <MemoryActionButton
                            icon={Check}
                            label={t`Save`}
                            variant="tertiary"
                            isDisabled={editDraft.trim().length === 0}
                            onPress={() => saveEdit(entry)}
                          />
                          <MemoryActionButton icon={X} label={t`Cancel`} onPress={finishEditing} />
                        </>
                      ) : (
                        <>
                          <MemoryActionButton
                            icon={entry.pinned ? PinOff : Pin}
                            label={entry.pinned ? t`Unpin` : t`Pin to top`}
                            onPress={() => togglePin(entry)}
                          />
                          <MemoryActionButton
                            ref={editTarget?.id === entry.id ? editButtonRef : undefined}
                            icon={Pencil}
                            label={t`Edit`}
                            onPress={() => {
                              setEditTarget({ id: entry.id, editing: true });
                              setEditDraft(entry.summary);
                            }}
                          />
                        </>
                      )}
                      <MemoryActionButton
                        icon={Trash2}
                        label={t`Delete`}
                        onPress={() => {
                          setError(false);
                          void readBridge()
                            .memoryCommand({ action: "delete", id: entry.id })
                            .then(refreshAfterChange)
                            .catch(() => setError(true));
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
