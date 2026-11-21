import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from "react";
import { Modal, Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  Brain,
  Clock,
  Ellipsis,
  Folder,
  Globe,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { isRemoteSession } from "@/renderer/bridge";
import { Button, Select, type SelectOption } from "@/renderer/components/common";
import { BottomSheet } from "@/renderer/components/common/BottomSheet";
import { ConfirmationPopover } from "@/renderer/components/common/ConfirmationPopover";
import { Input } from "@/renderer/components/common/Input";
import { MobileMachineToolbar } from "@/renderer/components/common/MobileMachineToolbar";
import { RelativeTime } from "@/renderer/components/common/RelativeTime";
import { SidebarButton } from "@/renderer/components/common/SidebarButton";
import { MobileCircleButton } from "@/renderer/components/mobileComposer/MobileCircleButton";
import { useLongPress } from "@/renderer/hooks/useLongPress";
import { useAppStore } from "@/renderer/state/appStore";
import { runMemoryCatalogCommand } from "@/renderer/state/memoryCatalog";
import { syncMemoryAcrossEnvironments } from "@/renderer/state/memorySync";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { formatShortDateTime } from "@/renderer/utils/formatTime";
import type { Project } from "@/shared/contracts";
import { isHomeProject } from "@/shared/homeScope";
import type { MemoryCategory, MemoryEntry, MemoryScope } from "@/shared/memory";
import {
  GLOBAL_MEMORY_SCOPE,
  MemoryEditorDialog,
  type MemoryEditorSubmitPayload,
  type MemoryScopeProjectOption,
} from "./MemoryEditorDialog";

const ALL_MEMORY_SCOPE_FILTER = "__all__";
const OTHER_PROJECT_SCOPE_FILTER = "__project_other__";

function entryScopeFilterKey(entry: MemoryEntry): string {
  if (entry.scope === "global") return GLOBAL_MEMORY_SCOPE;
  if (entry.projectId) return `project:${entry.projectId}`;
  if (entry.repoKey) return `repo:${entry.repoKey}`;
  return OTHER_PROJECT_SCOPE_FILTER;
}

function projectIdFromScopeFilter(scopeFilter: string): string | undefined {
  return scopeFilter.startsWith("project:") ? scopeFilter.slice("project:".length) : undefined;
}

function readCatalog(connectionKey: string | undefined, projectId: string | undefined) {
  return runMemoryCatalogCommand(connectionKey, {
    action: "list",
    ...(projectId ? { projectId } : {}),
  });
}

function formatRepoKeyLabel(repoKey: string): string {
  const trimmed = repoKey.trim().replace(/^\/+|\/+$/g, "");
  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length >= 3 && parts[0]?.includes(".")) {
    return parts.slice(1).join("/");
  }
  return trimmed;
}

function resolveHostProjects(
  appProjects: readonly Project[],
  remoteRuntimeProjects: readonly Project[] | undefined,
  connectionKey: string | undefined,
  remoteSession: boolean,
): {
  options: MemoryScopeProjectOption[];
  namesById: Map<string, string>;
} {
  const options: MemoryScopeProjectOption[] = [];
  const namesById = new Map<string, string>();

  function add(id: string, name: string) {
    if (!id || namesById.has(id)) return;
    namesById.set(id, name);
    options.push({ id, name });
  }

  if (connectionKey === undefined) {
    for (const project of appProjects) {
      if (isHomeProject(project) || project.remoteServerId) continue;
      add(project.id, project.name);
    }
    return { options, namesById };
  }

  for (const project of appProjects) {
    if (isHomeProject(project)) continue;
    if (project.remoteServerId === connectionKey && project.remoteId) {
      add(project.remoteId, project.name);
    } else if (!project.remoteServerId && remoteSession) {
      add(project.id, project.name);
    }
  }

  if (remoteRuntimeProjects) {
    for (const project of remoteRuntimeProjects) {
      if (isHomeProject(project)) continue;
      add(project.id, project.name);
    }
  }

  return { options, namesById };
}

function resolveEntryProjectLabel(
  entry: MemoryEntry,
  projectNamesById: ReadonlyMap<string, string>,
): string | undefined {
  if (entry.scope !== "project") return undefined;
  if (entry.projectId) {
    const matched = projectNamesById.get(entry.projectId);
    if (matched) return matched;
  }
  if (entry.repoKey) {
    const label = formatRepoKeyLabel(entry.repoKey);
    if (label) return label;
  }
  return undefined;
}

function resolveCategoryForSave(
  existing: MemoryEntry | undefined,
  nextScope: MemoryScope,
): MemoryCategory {
  if (!existing) {
    return nextScope === "project" ? "project" : "user";
  }
  if (nextScope === "global" && existing.category === "project") {
    return "user";
  }
  if (nextScope === "project" && existing.category === "user" && existing.scope === "global") {
    return "project";
  }
  return existing.category;
}

function MemoryIconActionButton({
  ref,
  icon: Icon,
  label,
  danger = false,
  onPress,
}: {
  ref?: Ref<HTMLButtonElement> | undefined;
  icon: LucideIcon;
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Tooltip delay={300}>
      <Button
        ref={ref}
        isIconOnly
        size="sm"
        variant="ghost"
        aria-label={label}
        className={`size-7 min-h-7 min-w-7 text-muted ${
          danger ? "hover:text-danger" : "hover:text-foreground"
        }`}
        onPress={onPress}
      >
        <Icon className="size-3.5" aria-hidden="true" />
      </Button>
      <Tooltip.Content placement="top" className="pointer-events-none">
        {label}
      </Tooltip.Content>
    </Tooltip>
  );
}

function MemoryCatalogRow({
  entry,
  projectLabel,
  compact,
  editButtonRef,
  onPin,
  onEdit,
  onDelete,
}: {
  entry: MemoryEntry;
  projectLabel: string | undefined;
  compact: boolean;
  editButtonRef?: Ref<HTMLButtonElement> | undefined;
  onPin: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useLingui();
  const rowRef = useRef<HTMLLIElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmMobileDelete, setConfirmMobileDelete] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  if (!compact && menuOpen) {
    setMenuOpen(false);
    setConfirmMobileDelete(false);
  }
  if (compact && deleteConfirmOpen) setDeleteConfirmOpen(false);

  const pinLabel = entry.pinned ? t`Unpin` : t`Pin to top`;
  const PinIcon = entry.pinned ? PinOff : Pin;
  const scopeLabel = entry.scope === "project" ? (projectLabel ?? t`Project`) : t`Global`;
  const formattedUpdatedAt = formatShortDateTime(entry.updatedAt);

  const metaParts: { key: string; content: ReactNode }[] = [];
  if (entry.category === "feedback") {
    metaParts.push({ key: "category", content: t`Feedback` });
  } else if (entry.category === "reference") {
    metaParts.push({ key: "category", content: t`Reference` });
  }
  if (entry.lockedByUser) {
    metaParts.push({ key: "locked", content: t`Edited by you` });
  }
  if (formattedUpdatedAt) {
    metaParts.push({
      key: "updated",
      content: (
        <span className="inline-flex items-center gap-1" title={t`Updated ${formattedUpdatedAt}`}>
          <Clock className="size-3 shrink-0" aria-hidden="true" />
          <RelativeTime iso={entry.updatedAt} />
        </span>
      ),
    });
  }

  function openMenu() {
    rowRef.current?.querySelector("button")?.focus();
    setConfirmMobileDelete(false);
    setMenuOpen(true);
  }

  function closeMenu() {
    setConfirmMobileDelete(false);
    setMenuOpen(false);
  }

  const longPress = useLongPress(compact ? openMenu : null);

  function selectAction(action: () => void) {
    closeMenu();
    action();
  }

  function handleCardClick(event: MouseEvent<HTMLLIElement>) {
    if (deleteConfirmOpen || menuOpen) return;
    const target = event.target;
    if (!(target instanceof Node) || !event.currentTarget.contains(target)) return;
    const interactive =
      target instanceof Element
        ? target.closest('button, a, input, textarea, [role="button"]')
        : null;
    if (interactive && event.currentTarget.contains(interactive)) return;
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) return;
    onEdit();
  }

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- card shortcut to Edit; semantic Edit button provides keyboard access without nested buttons
    <li
      ref={rowRef}
      onClick={handleCardClick}
      className={`content-surface group flex w-full cursor-pointer items-start gap-3 px-3.5 py-3 text-left transition-colors hover:border-[var(--hairline)] hover:bg-[var(--row-hover)] ${
        entry.pinned ? "border-[var(--hairline)]" : ""
      }`}
      {...longPress}
    >
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm leading-5 text-foreground">{entry.summary}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
          {entry.pinned ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-1.5 py-0.5 text-[11px] font-medium leading-none text-accent">
              <Pin className="size-2.5 shrink-0" aria-hidden="true" />
              <Trans>Pinned</Trans>
            </span>
          ) : null}
          <span className="inline-flex min-w-0 max-w-full items-center gap-1">
            {entry.scope === "project" ? (
              <Folder className="size-3 shrink-0" aria-hidden="true" />
            ) : (
              <Globe className="size-3 shrink-0" aria-hidden="true" />
            )}
            <span className="truncate">{scopeLabel}</span>
          </span>
          {metaParts.map((part) => (
            <Fragment key={part.key}>
              <span aria-hidden="true">·</span>
              <span>{part.content}</span>
            </Fragment>
          ))}
        </div>
      </div>
      {compact ? (
        <Button
          ref={editButtonRef}
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
        <div
          className={`flex shrink-0 items-center gap-0.5 transition-opacity ${
            deleteConfirmOpen
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
          }`}
        >
          <MemoryIconActionButton icon={PinIcon} label={pinLabel} onPress={onPin} />
          <MemoryIconActionButton
            ref={editButtonRef}
            icon={Pencil}
            label={t`Edit`}
            onPress={onEdit}
          />
          <ConfirmationPopover
            isOpen={deleteConfirmOpen}
            onOpenChange={setDeleteConfirmOpen}
            placement="bottom end"
            title={t`Delete memory?`}
            body={t`This memory will be permanently removed.`}
            actions={[
              {
                label: t`Delete`,
                variant: "danger",
                onPress: () => {
                  setDeleteConfirmOpen(false);
                  onDelete();
                },
              },
            ]}
            trigger={
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                aria-label={t`Delete`}
                className="size-7 min-h-7 min-w-7 text-muted hover:text-danger"
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
              </Button>
            }
          />
        </div>
      )}
      {compact && menuOpen && (
        <BottomSheet label={t`Memory actions`} onClose={closeMenu}>
          <div className="m-sheet-head">
            <span className="min-w-0 truncate">{entry.summary}</span>
          </div>
          {confirmMobileDelete ? (
            <div className="space-y-3 px-2 pb-2 pt-1">
              <div className="space-y-1 px-1">
                <p className="text-sm font-medium text-foreground">
                  <Trans>Delete memory?</Trans>
                </p>
                <p className="text-xs text-muted">
                  <Trans>This memory will be permanently removed.</Trans>
                </p>
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted"
                  onPress={() => setConfirmMobileDelete(false)}
                >
                  <Trans>Cancel</Trans>
                </Button>
                <Button size="sm" variant="danger" onPress={() => selectAction(onDelete)}>
                  <Trans>Delete</Trans>
                </Button>
              </div>
            </div>
          ) : (
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
                onPress={() => setConfirmMobileDelete(true)}
              />
            </div>
          )}
        </BottomSheet>
      )}
    </li>
  );
}

type EditorState = { kind: "add" } | { kind: "edit"; entry: MemoryEntry };
type EditorReturnFocus = { kind: "add" } | { kind: "edit"; id: string };

export function MemoryCatalogDialog(props: {
  connectionKey: string | undefined;
  projectId?: string;
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const compact = useCompactLayout();
  const appProjects = useAppStore((state) => state.projects);
  const remoteRuntimeProjects = useRemoteServersStore((state) =>
    props.connectionKey ? state.runtime[props.connectionKey]?.projects : undefined,
  );
  const remoteSession = isRemoteSession();
  const { options: hostProjects, namesById: projectNamesById } = useMemo(
    () =>
      resolveHostProjects(appProjects, remoteRuntimeProjects, props.connectionKey, remoteSession),
    [appProjects, remoteRuntimeProjects, props.connectionKey, remoteSession],
  );
  const editorProjects = props.projectId
    ? hostProjects.filter((project) => project.id === props.projectId)
    : hostProjects;

  const [entries, setEntries] = useState<MemoryEntry[] | undefined>();
  const [query, setQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState(ALL_MEMORY_SCOPE_FILTER);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [returnFocus, setReturnFocus] = useState<EditorReturnFocus | null>(null);
  const [savingEditor, setSavingEditor] = useState(false);
  const [editorError, setEditorError] = useState(false);
  const [error, setError] = useState(false);

  const addButtonRef = useRef<HTMLButtonElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const scopeFilterOptions: SelectOption[] = (() => {
    const options: SelectOption[] = [
      { id: ALL_MEMORY_SCOPE_FILTER, label: t`All` },
      {
        id: GLOBAL_MEMORY_SCOPE,
        label: t`Global`,
        icon: <Globe className="size-3.5 shrink-0 text-muted" aria-hidden="true" />,
      },
    ];
    const seen = new Set<string>([ALL_MEMORY_SCOPE_FILTER, GLOBAL_MEMORY_SCOPE]);

    function addProjectOption(id: string, label: string) {
      if (seen.has(id)) return;
      seen.add(id);
      options.push({
        id,
        label,
        icon: <Folder className="size-3.5 shrink-0 text-muted" aria-hidden="true" />,
      });
    }

    if (props.projectId) {
      addProjectOption(
        `project:${props.projectId}`,
        projectNamesById.get(props.projectId) ?? t`Project`,
      );
    } else {
      for (const project of hostProjects) {
        addProjectOption(`project:${project.id}`, project.name);
      }
    }

    if (entries) {
      for (const entry of entries) {
        if (entry.scope !== "project") continue;
        addProjectOption(
          entryScopeFilterKey(entry),
          resolveEntryProjectLabel(entry, projectNamesById) ?? t`Project`,
        );
      }
    }

    return options;
  })();

  const showScopeFilter = scopeFilterOptions.length > 2;
  const activeScopeFilter = scopeFilterOptions.some((option) => option.id === scopeFilter)
    ? scopeFilter
    : ALL_MEMORY_SCOPE_FILTER;
  const searchTerm = query.trim().toLowerCase();
  const isFiltered = searchTerm.length > 0 || activeScopeFilter !== ALL_MEMORY_SCOPE_FILTER;

  const visibleEntries = entries?.filter((entry) => {
    if (
      activeScopeFilter !== ALL_MEMORY_SCOPE_FILTER &&
      entryScopeFilterKey(entry) !== activeScopeFilter
    ) {
      return false;
    }
    if (!searchTerm) return true;
    const projectLabel = resolveEntryProjectLabel(entry, projectNamesById) ?? "";
    return `${entry.summary}\n${entry.body}\n${projectLabel}`.toLowerCase().includes(searchTerm);
  });

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
    if (editorState !== null || !returnFocus) return;
    if (returnFocus.kind === "edit") {
      editButtonRef.current?.focus();
    } else {
      addButtonRef.current?.focus();
    }
  }, [editorState, returnFocus]);

  useEffect(() => {
    if (compact && mobileSearchOpen) searchInputRef.current?.focus();
  }, [compact, mobileSearchOpen]);

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

  function openAddModal() {
    setEditorError(false);
    setReturnFocus({ kind: "add" });
    setEditorState({ kind: "add" });
  }

  function openEditModal(entry: MemoryEntry) {
    setEditorError(false);
    setReturnFocus({ kind: "edit", id: entry.id });
    setEditorState({ kind: "edit", entry });
  }

  function closeEditorModal() {
    setEditorError(false);
    setEditorState(null);
  }

  function handleEditorSubmit(payload: MemoryEditorSubmitPayload) {
    if (!editorState || savingEditor) return;
    setSavingEditor(true);
    setEditorError(false);
    setError(false);

    const isEdit = editorState.kind === "edit";
    const existing = isEdit ? editorState.entry : undefined;
    const category = resolveCategoryForSave(existing, payload.scope);

    void runMemoryCatalogCommand(props.connectionKey, {
      action: "save",
      entry: existing
        ? {
            id: existing.id,
            scope: payload.scope,
            projectId: payload.scope === "project" ? payload.projectId : null,
            category,
            summary: payload.summary,
            body: existing.body === existing.summary ? payload.summary : existing.body,
            polarity: existing.polarity,
            pinned: payload.pinned,
            quote: existing.quote,
          }
        : {
            scope: payload.scope,
            ...(payload.scope === "project" && payload.projectId
              ? { projectId: payload.projectId }
              : {}),
            category,
            summary: payload.summary,
            body: payload.summary,
            polarity: "positive",
            pinned: payload.pinned,
          },
    })
      .then(() => {
        if (!isEdit) {
          setQuery("");
          const createdScopeKey =
            payload.scope === "global"
              ? GLOBAL_MEMORY_SCOPE
              : payload.projectId
                ? `project:${payload.projectId}`
                : OTHER_PROJECT_SCOPE_FILTER;
          if (
            activeScopeFilter !== ALL_MEMORY_SCOPE_FILTER &&
            activeScopeFilter !== createdScopeKey
          ) {
            setScopeFilter(ALL_MEMORY_SCOPE_FILTER);
          }
        }
        setEditorState(null);
        return refreshAfterChange();
      })
      .catch(() => setEditorError(true))
      .finally(() => setSavingEditor(false));
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

  const searchInput = (
    <div className="relative min-w-0 flex-1">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted"
        aria-hidden="true"
      />
      <Input
        ref={searchInputRef}
        aria-label={t`Search memories`}
        type="search"
        size="sm"
        className="w-full pl-8 pr-8 [&::-webkit-search-cancel-button]:hidden"
        placeholder={t`Search memories`}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (compact && event.key === "Enter") setMobileSearchOpen(false);
        }}
      />
      {query.length > 0 ? (
        <button
          type="button"
          aria-label={t`Clear search`}
          onClick={() => {
            setQuery("");
            searchInputRef.current?.focus();
          }}
          className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted transition-colors hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );

  const listContent =
    entries === undefined ? (
      error ? null : (
        <p className="px-2.5 py-4 text-sm text-muted" role="status">
          <Trans>Loading…</Trans>
        </p>
      )
    ) : entries.length === 0 ? (
      <div className="flex min-h-full flex-col items-center justify-center gap-3 px-4 py-12 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-foreground/[0.06] text-muted">
          <Brain className="size-5" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            <Trans>No memories yet.</Trans>
          </p>
          <p className="max-w-xs text-xs text-muted">
            <Trans>
              Save preferences, workflows, or project conventions to share across threads.
            </Trans>
          </p>
        </div>
        <Button size="sm" variant="tertiary" onPress={openAddModal}>
          <Plus className="size-3.5" aria-hidden="true" />
          <Trans>Add a memory</Trans>
        </Button>
      </div>
    ) : visibleEntries?.length === 0 ? (
      <div
        className="flex min-h-full flex-col items-center justify-center gap-3 px-4 py-12 text-center"
        role="status"
      >
        <div className="flex size-10 items-center justify-center rounded-full bg-foreground/[0.06] text-muted">
          <Search className="size-5" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-foreground">
          <Trans>No results</Trans>
        </p>
        <Button
          size="sm"
          variant="tertiary"
          onPress={() => {
            setQuery("");
            setScopeFilter(ALL_MEMORY_SCOPE_FILTER);
          }}
        >
          {activeScopeFilter !== ALL_MEMORY_SCOPE_FILTER ? (
            <Trans>Clear filters</Trans>
          ) : (
            <Trans>Clear search</Trans>
          )}
        </Button>
      </div>
    ) : (
      <ul className="space-y-2 pb-1">
        {visibleEntries?.map((entry) => (
          <MemoryCatalogRow
            key={entry.id}
            entry={entry}
            projectLabel={resolveEntryProjectLabel(entry, projectNamesById)}
            compact={compact}
            editButtonRef={
              returnFocus?.kind === "edit" && returnFocus.id === entry.id
                ? editButtonRef
                : undefined
            }
            onPin={() => togglePin(entry)}
            onEdit={() => openEditModal(entry)}
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
    );

  const defaultAddProjectId = props.projectId ?? projectIdFromScopeFilter(activeScopeFilter);
  const unresolvedEditLabel =
    editorState?.kind === "edit"
      ? resolveEntryProjectLabel(editorState.entry, projectNamesById)
      : defaultAddProjectId
        ? projectNamesById.get(defaultAddProjectId)
        : undefined;

  return (
    <>
      <Modal.Backdrop
        isOpen
        isKeyboardDismissDisabled={editorState !== null}
        onOpenChange={(open) => {
          if (!open && editorState === null) props.onClose();
        }}
      >
        <Modal.Container placement="center" scroll="inside" size="lg">
          <Modal.Dialog className="sm:h-[min(44rem,80vh)] sm:max-w-[880px]">
            <Modal.CloseTrigger />
            <Modal.Header>
              <div className="flex items-center gap-2">
                <Modal.Heading>
                  <Trans>Memories</Trans>
                </Modal.Heading>
                {entries !== undefined ? (
                  <span
                    data-testid="memory-count"
                    className="rounded-full bg-foreground/10 px-2 py-0.5 text-xs font-normal tabular-nums text-muted"
                  >
                    {isFiltered && visibleEntries
                      ? `${visibleEntries.length} / ${entries.length}`
                      : entries.length}
                  </span>
                ) : null}
              </div>
            </Modal.Header>
            <Modal.Body
              className={
                compact
                  ? "space-y-3 p-1 pb-[var(--m-floating-dock-clearance)]"
                  : "flex min-h-0 flex-1 flex-col gap-3 !overflow-hidden p-1"
              }
            >
              {error && (
                <p className="shrink-0 text-xs text-danger" role="alert">
                  <Trans>Couldn't load memory.</Trans>
                </p>
              )}
              {!compact ? (
                <div className="flex shrink-0 items-center gap-2">
                  {searchInput}
                  {showScopeFilter ? (
                    <Select
                      aria-label={t`Filter by scope`}
                      className="w-44 shrink-0 [&_button]:h-9 [&_button]:min-h-0 [&_button]:items-center [&_button]:py-0 md:[&_button]:h-8"
                      options={scopeFilterOptions}
                      value={activeScopeFilter}
                      onChange={setScopeFilter}
                    />
                  ) : null}
                  <Button
                    ref={addButtonRef}
                    size="sm"
                    variant="tertiary"
                    className="shrink-0"
                    onPress={openAddModal}
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                    <Trans>Add</Trans>
                  </Button>
                </div>
              ) : showScopeFilter || searchTerm ? (
                <div className="flex flex-col gap-2">
                  {showScopeFilter ? (
                    <Select
                      aria-label={t`Filter by scope`}
                      fullWidth
                      options={scopeFilterOptions}
                      value={activeScopeFilter}
                      onChange={setScopeFilter}
                    />
                  ) : null}
                  {searchTerm ? (
                    <div className="content-surface-row flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-muted">
                      <span className="min-w-0 truncate">
                        <Trans>Search: {query.trim()}</Trans>
                      </span>
                      <button
                        type="button"
                        aria-label={t`Clear search`}
                        onClick={() => setQuery("")}
                        className="flex size-5 shrink-0 items-center justify-center rounded text-muted hover:text-foreground"
                      >
                        <X className="size-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {compact ? (
                listContent
              ) : (
                <div className="scrollbar -mx-2 min-h-0 flex-1 overflow-y-auto px-2">
                  {listContent}
                </div>
              )}
            </Modal.Body>
            {compact && (
              <MobileMachineToolbar
                leading={
                  <MobileCircleButton
                    aria-label={t`Search memories`}
                    aria-haspopup="dialog"
                    aria-expanded={mobileSearchOpen}
                    onPress={() => setMobileSearchOpen(true)}
                  >
                    <Search className="size-5" />
                  </MobileCircleButton>
                }
                trailing={
                  <MobileCircleButton
                    ref={addButtonRef}
                    aria-label={t`Add a memory`}
                    aria-haspopup="dialog"
                    aria-expanded={editorState?.kind === "add"}
                    onPress={openAddModal}
                  >
                    <Plus className="size-5" />
                  </MobileCircleButton>
                }
              />
            )}
            {compact && mobileSearchOpen && (
              <BottomSheet label={t`Search memories`} onClose={() => setMobileSearchOpen(false)}>
                <div className="px-1 pb-2 pt-1">{searchInput}</div>
              </BottomSheet>
            )}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
      {editorState && (
        <MemoryEditorDialog
          key={editorState.kind === "edit" ? editorState.entry.id : "add"}
          mode={editorState.kind}
          {...(editorState.kind === "edit" ? { entry: editorState.entry } : {})}
          {...(defaultAddProjectId ? { defaultProjectId: defaultAddProjectId } : {})}
          {...(unresolvedEditLabel ? { unresolvedProjectLabel: unresolvedEditLabel } : {})}
          projects={editorProjects}
          saving={savingEditor}
          error={editorError}
          onSubmit={handleEditorSubmit}
          onClose={closeEditorModal}
        />
      )}
    </>
  );
}
