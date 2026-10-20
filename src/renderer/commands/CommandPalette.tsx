import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { Button, Input, Modal } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { MessageDescriptor } from "@lingui/core";
import {
  Command,
  File,
  FolderOpen,
  ListFilter,
  LoaderCircle,
  MessageSquare,
  Search,
  Settings,
  Zap,
} from "lucide-react";
import { useShallow } from "zustand/shallow";
import type { Thread } from "@/shared/contracts";
import { createSearchQuery } from "@/shared/searchMatching";
import { readBridge, isDevApp, isRemoteSession } from "@/renderer/bridge";
import { useDragSource } from "@/renderer/dnd";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { openThread } from "@/renderer/actions/threadActions";
import { showFilesPanel } from "@/renderer/actions/panelActions";
import { useCurrentProjectId, useFocusedThreadId } from "@/renderer/hooks/uiSelectors";
import { useThread } from "@/renderer/state/useThread";
import { useAppStore } from "@/renderer/state/appStore";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { openFileInEditor, resolveWorktreeBranch } from "@/renderer/utils/gitHelpers";
import {
  SETTINGS_SEARCH_INDEX,
  isSettingsSearchEntryAvailable,
  searchSettings,
  type SettingsSearchResult,
} from "@/renderer/views/SettingsOverlay/parts/settingsSearchIndex";
import { useCommandPaletteStore } from "./commandPaletteStore";
import { useKeybindingStore } from "./keybindingStore";
import { buildCommandRegistry, buildWhenContext, isCommandAvailable } from "./registry";
import {
  filterCommandsForSearch,
  filterThreadsForSearch,
  type EverythingSearchCategory,
} from "./everythingSearch";
import {
  buildEverythingSearchSections,
  CATEGORY_RESULT_LIMIT,
  type EverythingSearchResult,
} from "./everythingSearchSections";
import { EverythingSearchResults } from "./EverythingSearchResults";
import { useEverythingFileSearch } from "./useEverythingFileSearch";
import { useConversationSearch } from "./useConversationSearch";
import { openConversationSearchHit } from "./conversationSearchNavigation";
import { resolveSearchScope } from "./searchScope";
import { revealSearchDestination } from "./searchNavigation";

const EMPTY_THREADS: Thread[] = [];

export function CommandPalette() {
  const { t } = useLingui();
  const isOpen = useCommandPaletteStore((state) => state.isOpen);
  const close = useCommandPaletteStore((state) => state.close);
  const draggingThread = useDragSource()?.type === "thread";
  const wasDraggingRef = useRef(false);

  useEffect(() => {
    if (draggingThread) wasDraggingRef.current = true;
    else if (wasDraggingRef.current) {
      wasDraggingRef.current = false;
      close();
    }
  }, [draggingThread, close]);

  return (
    <Modal.Backdrop
      isOpen={isOpen}
      variant="blur"
      className={`z-[70] transition-opacity duration-100 ${draggingThread ? "pointer-events-none opacity-0" : ""}`}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Modal.Container placement="top" className="px-3 pt-[min(12vh,80px)] pb-3">
        <Modal.Dialog
          aria-label={t`Search`}
          data-overlay-surface
          className={`flex w-full max-w-[720px] max-h-[min(720px,82dvh)] flex-col overflow-hidden rounded-2xl border border-[var(--hairline-strong)] bg-background p-0 shadow-2xl ${draggingThread ? "pointer-events-none" : ""}`}
        >
          {isOpen ? <SearchPaletteContent /> : null}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function SearchPaletteContent() {
  const { t } = useLingui();
  const compact = useCompactLayout();
  const originTarget = useCommandPaletteStore((state) => state.originTarget);
  const close = useCommandPaletteStore((state) => state.close);
  const keybindings = useKeybindingStore((state) => state.keybindings);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<EverythingSearchCategory>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const projects = useAppStore(useShallow((state) => state.projects));
  const threads = useAppStore(
    useShallow((state) =>
      category === "all" || category === "threads" ? state.threads : EMPTY_THREADS,
    ),
  );
  const thread = useThread(useFocusedThreadId() ?? undefined);
  const viewProjectId = useCurrentProjectId();
  useAppStore((state) => state.view.kind);
  const filesPanel = usePanelStore((state) => state.filesPanelContext);
  const editorRoot = useFileEditorStore(
    useShallow((state) =>
      state.rootContext
        ? {
            projectId: state.rootContext.projectId,
            ...(state.rootContext.worktreePath
              ? { worktreePath: state.rootContext.worktreePath }
              : {}),
          }
        : null,
    ),
  );
  const editorMode = useFileEditorStore((state) => state.overlayMode);
  useFileEditorStore((state) => state.activePath);
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const {
    project: activeProject,
    worktreePath,
    worktreeBranch,
  } = resolveSearchScope({
    projects,
    viewProjectId,
    thread,
    filesPanel,
    editorRoot,
    editorMode,
    origin: originTarget,
  });
  const fileSearch = useEverythingFileSearch({
    project: activeProject,
    worktreePath,
    worktreeBranch,
    query,
    enabled: category === "all" || category === "files",
  });
  const messageSearch = useConversationSearch(query, category === "all" || category === "messages");
  const resolve = (value: string | MessageDescriptor): string =>
    typeof value === "string" ? value : t(value);
  const searchesCommands = category === "all" || category === "commands" || category === "actions";
  const context = buildWhenContext(originTarget);
  const commands = searchesCommands
    ? buildCommandRegistry().filter((command) => isCommandAvailable(command, context))
    : [];
  const sections = buildEverythingSearchSections({
    category,
    query,
    projects: projectsById,
    keybindings,
    resolve,
    threads:
      category === "all" || category === "threads"
        ? filterThreadsForSearch(threads, projectsById, query)
        : [],
    commands:
      searchesCommands && category !== "actions"
        ? filterCommandsForSearch(commands, query, resolve, "command")
        : [],
    actions:
      searchesCommands && category !== "commands"
        ? filterCommandsForSearch(commands, query, resolve, "action")
        : [],
    settings:
      category === "all" || category === "settings"
        ? resolveSettingMatches(query, category, t)
        : [],
    files: fileSearch.entries,
    messages: messageSearch.entries,
    labels: {
      messages: t`Messages`,
      threads: t`Threads`,
      commands: t`Commands`,
      actions: t`Actions`,
      settings: t`Settings`,
      files: t`Files`,
    },
  });
  const results = sections.flatMap((section) => section.results);
  const activeIndex = Math.max(
    0,
    results.findIndex((result) => result.key === selectedKey),
  );
  const activeResult = results[activeIndex];
  const emptyMessage =
    category === "files"
      ? !activeProject
        ? t`Select a project to search files`
        : !query.trim()
          ? t`Type to search files`
          : fileSearch.failed
            ? t`File search unavailable`
            : undefined
      : category === "messages" && query.trim().length < 2
        ? t`Type at least two characters to search messages`
        : undefined;
  const categories: { id: EverythingSearchCategory; label: string; icon: ReactNode }[] = [
    { id: "all", label: t`All`, icon: <ListFilter /> },
    { id: "threads", label: t`Threads`, icon: <MessageSquare /> },
    { id: "messages", label: t`Messages`, icon: <MessageSquare /> },
    { id: "commands", label: t`Commands`, icon: <Command /> },
    { id: "settings", label: t`Settings`, icon: <Settings /> },
    { id: "files", label: t`Files`, icon: <File /> },
    { id: "actions", label: t`Actions`, icon: <Zap /> },
  ];

  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  function selectCategory(next: EverythingSearchCategory) {
    setCategory(next);
    setSelectedKey(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function activate(result: EverythingSearchResult | undefined) {
    if (!result) return;
    if (result.kind === "more") {
      selectCategory(result.category);
      return;
    }
    if (result.kind === "thread") {
      revealSearchDestination("thread");
      openThread(result.thread.id);
      close();
      return;
    }
    if (result.kind === "message") {
      revealSearchDestination("thread");
      close();
      void openConversationSearchHit(result.hit);
      return;
    }
    if (result.kind === "command" || result.kind === "action") {
      const target = originTarget;
      close();
      requestAnimationFrame(() => void result.command.run(undefined, { target }));
      return;
    }
    if (result.kind === "setting") {
      revealSearchDestination("setting");
      close();
      usePanelStore.getState().openSettingsSection(result.setting.section, result.setting.anchor);
      return;
    }
    if (result.kind !== "file" || !activeProject) return;
    showFilesPanel(activeProject.id, worktreePath);
    const root = useFileEditorStore.getState().rootContext;
    if (root?.projectId !== activeProject.id || root.worktreePath !== worktreePath) return;
    revealSearchDestination("file");
    close();
    void openFileInEditor(
      activeProject,
      worktreePath,
      worktreePath
        ? resolveWorktreeBranch(activeProject.id, worktreePath, worktreeBranch)
        : undefined,
      result.entry.path,
    );
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || event.key === "Process") return;
    if (event.ctrlKey && event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      const index = categories.findIndex((item) => item.id === category);
      selectCategory(
        categories[(index + (event.shiftKey ? -1 : 1) + categories.length) % categories.length]!.id,
      );
      return;
    }
    const step =
      event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowUp"
          ? -1
          : event.key === "PageDown"
            ? 8
            : event.key === "PageUp"
              ? -8
              : 0;
    if (step) {
      event.preventDefault();
      event.stopPropagation();
      const next = Math.max(0, Math.min(activeIndex + step, results.length - 1));
      setSelectedKey(results[next]?.key ?? null);
    } else if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      activate(activeResult);
    }
  }

  return (
    <>
      <div role="search" className="shrink-0 border-b border-[var(--hairline)]">
        <div className="flex h-14 items-center gap-3 px-4">
          <Search aria-hidden="true" className="size-4 shrink-0 text-muted" />
          <Input
            ref={inputRef}
            role="combobox"
            aria-label={t`Search`}
            aria-autocomplete="list"
            aria-controls="everything-search-results"
            aria-expanded
            {...(activeResult
              ? { "aria-activedescendant": `everything-search-result-${activeIndex}` }
              : {})}
            variant="secondary"
            placeholder={t`Search threads, commands, settings, and files…`}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedKey(null);
            }}
            onKeyDown={handleKeyDown}
            className="min-w-0 flex-1 border-0 bg-transparent px-0 text-sm shadow-none"
            spellCheck={false}
            autoComplete="off"
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={t`Close search`}
            onPress={close}
            className="h-6 shrink-0 rounded-md border border-[var(--hairline)] px-1.5 text-[10px] text-muted"
          >
            Esc
          </Button>
        </div>
        <div
          role="toolbar"
          aria-label={t`Search categories`}
          className="flex items-center gap-1 overflow-x-auto px-3 pb-2"
        >
          {categories.map((item) => (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant={category === item.id ? "secondary" : "ghost"}
              aria-pressed={category === item.id}
              className="h-7 shrink-0 gap-1.5 rounded-lg px-2.5 text-xs font-normal [&_svg]:size-3"
              onPress={() => selectCategory(item.id)}
            >
              {item.id === "files" && fileSearch.loading ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : (
                item.icon
              )}
              {item.label}
            </Button>
          ))}
        </div>
        {category === "all" || category === "files" ? (
          <div className="flex min-w-0 items-center gap-1.5 px-4 pb-2 text-[11px] text-muted">
            <FolderOpen aria-hidden="true" className="size-3 shrink-0" />
            <span className="truncate">
              {activeProject
                ? t`File names in ${activeProject.name}`
                : t`Select a project to search files`}
            </span>
            {worktreePath ? (
              <span className="truncate opacity-70" title={worktreePath}>
                · {worktreeBranch ?? worktreePath.split(/[\\/]/u).at(-1)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      <EverythingSearchResults
        sections={sections}
        query={createSearchQuery(query)}
        activeIndex={activeIndex}
        loading={fileSearch.loading || messageSearch.loading || messageSearch.indexing}
        {...(!fileSearch.loading && (messageSearch.loading || messageSearch.indexing)
          ? {
              loadingLabel: messageSearch.indexing
                ? t`Indexing saved messages…`
                : t`Searching saved messages…`,
            }
          : {})}
        failed={fileSearch.failed}
        messagesFailed={messageSearch.failed}
        messagesHaveMore={messageSearch.hasMore}
        emptyMessage={emptyMessage}
        onRetry={fileSearch.retry}
        onActivate={activate}
        onHover={(index) => setSelectedKey(results[index]?.key ?? null)}
      />
      {category === "all" || category === "messages" ? (
        <div
          className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--hairline)] px-4 py-2 text-[11px] text-muted"
          role="status"
        >
          <span>
            {messageSearch.loading
              ? t`Searching saved messages…`
              : messageSearch.indexing
                ? t`Indexing saved messages…`
                : messageSearch.failed
                  ? t`Message search unavailable`
                  : t`Saved messages, including archived chats`}
          </span>
          {messageSearch.failed ? (
            <Button size="sm" variant="ghost" onPress={messageSearch.retry}>{t`Retry`}</Button>
          ) : null}
          {category === "messages" &&
          messageSearch.hasMore &&
          !messageSearch.indexing &&
          messageSearch.entries.length < CATEGORY_RESULT_LIMIT ? (
            <Button
              size="sm"
              variant="ghost"
              isPending={messageSearch.loading}
              onPress={messageSearch.loadMore}
            >{t`Show more`}</Button>
          ) : null}
        </div>
      ) : null}
      {!compact ? (
        <div className="flex shrink-0 items-center gap-4 border-t border-[var(--hairline)] px-4 py-2 text-[10px] text-muted">
          <span>
            <kbd className="mr-1.5 font-sans">↑ ↓</kbd>
            {t`Navigate`}
          </span>
          <span>
            <kbd className="mr-1.5 font-sans">↵</kbd>
            {t`Open`}
          </span>
          <span className="ml-auto">
            <kbd className="mr-1.5 font-sans">Ctrl ⇥</kbd>
            {t`Filter`}
          </span>
        </div>
      ) : null}
    </>
  );
}

function resolveSettingMatches(
  query: string,
  category: EverythingSearchCategory,
  t: (descriptor: MessageDescriptor) => string,
): SettingsSearchResult[] {
  const options = {
    devMode: isDevApp(),
    remoteSession: isRemoteSession(),
    windows: readBridge().platform === "win32",
  };
  if (query.trim()) return searchSettings(query, t, options);
  if (category !== "settings") return [];
  return SETTINGS_SEARCH_INDEX.filter((entry) =>
    isSettingsSearchEntryAvailable(entry, options),
  ).map((entry) => ({
    section: entry.section,
    anchor: entry.anchor,
    title: t(entry.title),
    snippet: entry.description ? t(entry.description) : null,
  }));
}
