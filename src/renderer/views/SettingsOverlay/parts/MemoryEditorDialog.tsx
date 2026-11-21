import { useEffect, useId, useRef, useState } from "react";
import { Label, Modal, TextField } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Folder, Globe, Pin } from "lucide-react";
import { Button, Select, ToggleSwitch, type SelectOption } from "@/renderer/components/common";
import { TextArea } from "@/renderer/components/common/TextArea";
import type { MemoryEntry, MemoryScope } from "@/shared/memory";

function isAppleClient(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform);
}

export const GLOBAL_MEMORY_SCOPE = "__global__";
export const UNRESOLVED_PROJECT_SCOPE = "__unresolved_project__";

export interface MemoryScopeProjectOption {
  readonly id: string;
  readonly name: string;
}

export interface MemoryEditorSubmitPayload {
  readonly summary: string;
  readonly scope: MemoryScope;
  readonly projectId: string | null;
  readonly pinned: boolean;
  readonly keepUnresolvedProject: boolean;
}

export function MemoryEditorDialog(props: {
  mode: "add" | "edit";
  entry?: MemoryEntry;
  defaultProjectId?: string;
  unresolvedProjectLabel?: string;
  projects: readonly MemoryScopeProjectOption[];
  saving: boolean;
  error: boolean;
  onSubmit: (payload: MemoryEditorSubmitPayload) => void;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const {
    mode,
    entry,
    defaultProjectId,
    unresolvedProjectLabel,
    projects,
    saving,
    error,
    onSubmit,
    onClose,
  } = props;

  const initialScopeValue = (() => {
    if (entry) {
      if (entry.scope === "global") return GLOBAL_MEMORY_SCOPE;
      if (entry.projectId && projects.some((project) => project.id === entry.projectId)) {
        return entry.projectId;
      }
      return UNRESOLVED_PROJECT_SCOPE;
    }
    if (defaultProjectId) {
      return projects.some((project) => project.id === defaultProjectId)
        ? defaultProjectId
        : UNRESOLVED_PROJECT_SCOPE;
    }
    return GLOBAL_MEMORY_SCOPE;
  })();

  const [draft, setDraft] = useState(entry?.summary ?? "");
  const [scopeValue, setScopeValue] = useState(initialScopeValue);
  const [pinned, setPinned] = useState(entry?.pinned ?? false);
  const pinLabelId = useId();
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    function focusEditor() {
      const el = textAreaRef.current;
      if (!el) return;
      el.focus();
      const length = el.value.length;
      el.setSelectionRange(length, length);
    }
    focusEditor();
    const frame = requestAnimationFrame(focusEditor);
    return () => cancelAnimationFrame(frame);
  }, []);

  const scopeOptions: SelectOption[] = [
    {
      id: GLOBAL_MEMORY_SCOPE,
      label: t`Global`,
      icon: <Globe className="size-3.5 shrink-0 text-muted" aria-hidden="true" />,
    },
    ...(initialScopeValue === UNRESOLVED_PROJECT_SCOPE
      ? [
          {
            id: UNRESOLVED_PROJECT_SCOPE,
            label: unresolvedProjectLabel || t`Project`,
            icon: <Folder className="size-3.5 shrink-0 text-muted" aria-hidden="true" />,
          },
        ]
      : []),
    ...projects.map((project) => ({
      id: project.id,
      label: project.name,
      icon: <Folder className="size-3.5 shrink-0 text-muted" aria-hidden="true" />,
    })),
  ];

  const showScopePicker = scopeOptions.length > 1;
  const trimmed = draft.trim();
  const canSubmit = !saving && trimmed.length > 0;

  function submit() {
    if (!canSubmit) return;
    if (scopeValue === GLOBAL_MEMORY_SCOPE) {
      onSubmit({
        summary: trimmed,
        scope: "global",
        projectId: null,
        pinned,
        keepUnresolvedProject: false,
      });
      return;
    }
    if (scopeValue === UNRESOLVED_PROJECT_SCOPE) {
      onSubmit({
        summary: trimmed,
        scope: "project",
        projectId: entry ? entry.projectId : (defaultProjectId ?? null),
        pinned,
        keepUnresolvedProject: true,
      });
      return;
    }
    onSubmit({
      summary: trimmed,
      scope: "project",
      projectId: scopeValue,
      pinned,
      keepUnresolvedProject: false,
    });
  }

  return (
    <Modal.Backdrop isOpen onOpenChange={(open) => !open && !saving && onClose()}>
      <Modal.Container placement="center" scroll="inside" size="lg">
        <Modal.Dialog className="sm:max-w-[600px]">
          <Modal.CloseTrigger isDisabled={saving} />
          <Modal.Header>
            <Modal.Heading>
              {mode === "add" ? <Trans>Add a memory</Trans> : <Trans>Edit memory</Trans>}
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="space-y-3 p-1">
            {error ? (
              <p className="text-xs text-danger" role="alert">
                <Trans>Couldn't save memory.</Trans>
              </p>
            ) : null}
            {showScopePicker ? (
              <Select
                label={t`Scope`}
                fullWidth
                options={scopeOptions}
                value={scopeValue}
                isDisabled={saving || mode === "edit"}
                onChange={setScopeValue}
              />
            ) : null}
            <TextField className="w-full" isDisabled={saving}>
              <Label>
                <Trans>Memory</Trans>
              </Label>
              <TextArea
                ref={textAreaRef}
                autoFocus // eslint-disable-line jsx-a11y/no-autofocus -- opened editor dialog, expected focus target
                autoSize
                maxRows={12}
                rows={5}
                className="min-h-[8.5rem] w-full resize-none"
                data-overlay-escape-owner=""
                placeholder={t`Always use bun`}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    submit();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!saving) onClose();
                  }
                }}
              />
            </TextField>
            <div className="content-surface-row flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <Pin className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
                <span id={pinLabelId} className="text-sm text-foreground">
                  <Trans>Pin to top</Trans>
                </span>
              </div>
              <ToggleSwitch
                aria-labelledby={pinLabelId}
                isSelected={pinned}
                isDisabled={saving}
                onChange={setPinned}
              />
            </div>
          </Modal.Body>
          <Modal.Footer className="items-center">
            <span className="mr-auto hidden items-center gap-1.5 text-xs text-muted sm:inline-flex">
              <kbd className="rounded-[5px] border border-[var(--hairline)] bg-[var(--content-surface-fill)] px-1.5 py-0.5 font-sans text-[11px] leading-none text-muted">
                {isAppleClient() ? "⌘⏎" : t`Ctrl+Enter`}
              </kbd>
              <span>{mode === "add" ? <Trans>to add</Trans> : <Trans>to save</Trans>}</span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted"
              isDisabled={saving}
              onPress={onClose}
            >
              <Trans>Cancel</Trans>
            </Button>
            <Button
              variant="tertiary"
              size="sm"
              isPending={saving}
              isDisabled={!canSubmit}
              onPress={submit}
            >
              {mode === "add" ? <Trans>Add</Trans> : <Trans>Save</Trans>}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
