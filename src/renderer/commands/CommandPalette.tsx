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
  File as FileIcon,
  ListFilter,
  LoaderCircle,
  MessageSquare,
  Search,
  Settings,
  Zap,
} from "lucide-react";
import { readBridge, isDevApp, isRemoteSession } from "@/renderer/bridge";
import { useDragSource } from "@/renderer/dnd";
import { openThread } from "@/renderer/actions/threadActions";
import { showFilesPanel } from "@/renderer/actions/panelActions";
import { resolveActivePaneId, resolveProjectIdForView } from "@/renderer/actions/currentProject";
import { useAppStore } from "@/renderer/state/appStore";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { openFileInEditor, resolveWorktreeBranch } from "@/renderer/utils/gitHelpers";
import {
  SETTINGS_SEARCH_INDEX,
  searchSettings,
  type SettingsSearchResult,
} from "@/renderer/views/SettingsOverlay/parts/settingsSearchIndex";
import { useShallow } from "zustand/shallow";
import { useCommandPaletteStore } from "./commandPaletteStore";
import { useKeybindingStore } from "./keybindingStore";
import { bindingForPlatform, formatKeybinding } from "./keybindingMatcher";
import {
  buildCommandRegistry,
  buildWhenContext,
  isCommandAvailable,
  type AppCommand,
} from "./registry";
import type { CommandWhenContext } from "./when";
import {
  filterCommandsForSearch,
  filterThreadsForSearch,
  type EverythingSearchCategory,
} from "./everythingSearch";
import {
  EverythingSearchResults,
  type EverythingSearchResult,
  type EverythingSearchSection,
} from "./EverythingSearchResults";
import { useEverythingFileSearch } from "./useEverythingFileSearch";

const ALL_CATEGORY_LIMITS = {
  threads: 12,
  actions: 8,
  commands: 12,
  settings: 8,
  files: 20,
} as const;
const CATEGORY_RESULT_LIMIT = 80;

export function CommandPalette() {
  const { t } = useLingui();
  const isOpen = useCommandPaletteStore((state) => state.isOpen);
  const originTarget = useCommandPaletteStore((state) => state.originTarget);
  const close = useCommandPaletteStore((state) => state.close);
  const keybindings = useKeybindingStore((state) => state.keybindings);
  const projects = useAppStore(useShallow((state) => state.projects));
  const threads = useAppStore(useShallow((state) => state.threads));
  const view = useAppStore((state) => state.view);
  const focusedPaneId = useAppStore((state) => state.focusedPaneId);
  usePanelStore((state) => state.filesPanelContext);
  useFileEditorStore((state) => state.rootContext);
  useFileEditorStore((state) => state.activePath);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<EverythingSearchCategory>("all");
  const [activeIndex, setActiveIndex] = useState(0);
  const [originContext, setOriginContext] = useState<CommandWhenContext>(() => buildWhenContext());
  const inputRef = useRef<HTMLInputElement | null>(null);

  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const projectId = resolveProjectIdForView(view, threads, focusedPaneId);
  const activeProject = projectId ? projectsById.get(projectId) : undefined;
  const activePaneId =
    view.kind === "thread" ? resolveActivePaneId(view.panes, focusedPaneId) : undefined;
  const activeThread = activePaneId
    ? threads.find((thread) => thread.id === activePaneId)
    : undefined;
  const worktreePath = activeThread?.worktreePath;
  const worktreeBranch = activeThread?.worktreeBranch;

  const fileSearch = useEverythingFileSearch({
    project: activeProject,
    worktreePath,
    worktreeBranch,
    query,
    enabled: isOpen && (category === "all" || category === "files"),
  });

  const resolve = (value: string | MessageDescriptor): string =>
    typeof value === "string" ? value : t(value);
  const searchesCommands =
    isOpen && (category === "all" || category === "commands" || category === "actions");
  const availableCommands = searchesCommands
    ? buildCommandRegistry().filter((command) => isCommandAvailable(command, originContext))
    : [];
  const threadMatches =
    isOpen && (category === "all" || category === "threads")
      ? filterThreadsForSearch(threads, projectsById, query)
      : [];
  const commandMatches =
    searchesCommands && category !== "actions"
      ? filterCommandsForSearch(availableCommands, query, resolve, "command")
      : [];
  const actionMatches =
    searchesCommands && category !== "commands"
      ? filterCommandsForSearch(availableCommands, query, resolve, "action")
      : [];
  const settingMatches =
    isOpen && (category === "all" || category === "settings")
      ? resolveSettingMatches(query, category, t)
      : [];

  const sections = (
    [
      {
        category: "threads",
        label: t`Threads`,
        results: threadMatches.slice(0, resultLimit(category, "threads")).map((thread) => ({
          key: `thread:${thread.id}`,
          kind: "thread",
          thread,
          project: projectsById.get(thread.projectId),
        })),
      },
      {
        category: "actions",
        label: t`Actions`,
        results: actionMatches
          .slice(0, resultLimit(category, "actions"))
          .map((command) => commandSearchResult(command, "action", resolve, keybindings)),
      },
      {
        category: "commands",
        label: t`Commands`,
        results: commandMatches
          .slice(0, resultLimit(category, "commands"))
          .map((command) => commandSearchResult(command, "command", resolve, keybindings)),
      },
      {
        category: "settings",
        label: t`Settings`,
        results: settingMatches.slice(0, resultLimit(category, "settings")).map((setting) => ({
          key: `setting:${setting.anchor}`,
          kind: "setting",
          setting,
        })),
      },
      {
        category: "files",
        label: t`Files`,
        results: fileSearch.entries.slice(0, resultLimit(category, "files")).map((entry) => ({
          key: `file:${entry.path}`,
          kind: "file",
          entry,
        })),
      },
    ] satisfies EverythingSearchSection[]
  ).filter((section) => category === "all" || section.category === category);

  const results = sections.flatMap((section) => section.results);
  const activeResult = results[activeIndex];
  const emptyMessage =
    category === "files"
      ? !activeProject
        ? t`Select project`
        : !query.trim()
          ? t`Type to search files`
          : fileSearch.failed
            ? t`File search unavailable`
            : undefined
      : undefined;

  const dragSource = useDragSource();
  const draggingThread =
    dragSource?.type === "thread" && threads.some((thread) => thread.id === dragSource.threadId);
  const wasDraggingRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setCategory("all");
      setActiveIndex(0);
      return;
    }
    setOriginContext(buildWhenContext(originTarget));
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [isOpen, originTarget]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, category]);

  useEffect(() => {
    if (activeIndex >= results.length) {
      setActiveIndex(Math.max(0, results.length - 1));
    }
  }, [activeIndex, results.length]);

  useEffect(() => {
    if (draggingThread) {
      wasDraggingRef.current = true;
      return;
    }
    if (wasDraggingRef.current) {
      wasDraggingRef.current = false;
      close();
    }
  }, [draggingThread, close]);

  function activate(result: EverythingSearchResult | undefined) {
    if (!result) return;
    if (result.kind === "thread") {
      openThread(result.thread.id);
      close();
      return;
    }
    if (result.kind === "command" || result.kind === "action") {
      const command = result.command;
      const target = originTarget;
      close();
      requestAnimationFrame(() => void command.run(undefined, { target }));
      return;
    }
    if (result.kind === "setting") {
      close();
      usePanelStore.getState().openSettingsSection(result.setting.section, result.setting.anchor);
      return;
    }
    if (result.kind !== "file" || !activeProject) return;

    showFilesPanel(activeProject.id, worktreePath);
    const root = useFileEditorStore.getState().rootContext;
    if (root?.projectId !== activeProject.id || root.worktreePath !== worktreePath) {
      return;
    }
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

  function selectCategory(next: EverythingSearchCategory) {
    setCategory(next);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const categories: {
    id: EverythingSearchCategory;
    label: string;
    icon: ReactNode;
  }[] = [
    { id: "all", label: t`All`, icon: <ListFilter /> },
    { id: "threads", label: t`Threads`, icon: <MessageSquare /> },
    { id: "commands", label: t`Commands`, icon: <Command /> },
    { id: "settings", label: t`Settings`, icon: <Settings /> },
    { id: "files", label: t`Files`, icon: <FileIcon /> },
    { id: "actions", label: t`Actions`, icon: <Zap /> },
  ];

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (results.length > 0) {
        setActiveIndex((index) => Math.min(index + 1, results.length - 1));
      }
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    }
  }

  return (
    <Modal.Backdrop
      isOpen={isOpen}
      variant="blur"
      className={`z-[70] transition-opacity duration-100 ${
        draggingThread ? "pointer-events-none opacity-0" : ""
      }`}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Modal.Container placement="top" className="px-4 pt-[12vh]">
        <Modal.Dialog
          aria-label={t`Search`}
          data-overlay-surface
          className="w-full max-w-[720px] overflow-hidden rounded-2xl border border-[var(--hairline-strong)] bg-background p-0 shadow-2xl"
        >
          <form
            role="search"
            className="flex flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              activate(activeResult);
            }}
          >
            <div className="border-b border-[var(--hairline)]">
              <div className="flex h-14 items-center gap-3 px-4">
                <Search className="size-4 shrink-0 text-muted" />
                <Input
                  ref={inputRef}
                  role="combobox"
                  tabIndex={0}
                  aria-label={t`Search`}
                  aria-autocomplete="list"
                  aria-controls="everything-search-results"
                  aria-expanded={isOpen}
                  aria-activedescendant={
                    activeResult ? `everything-search-result-${activeIndex}` : undefined
                  }
                  variant="secondary"
                  placeholder={t`Search…`}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={handleDialogKeyDown}
                  className="min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none"
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>
              <div className="flex items-center gap-1 overflow-x-auto px-3 pb-2">
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
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      item.icon
                    )}
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>
            <EverythingSearchResults
              sections={sections}
              activeIndex={activeIndex}
              loading={fileSearch.loading}
              emptyMessage={emptyMessage}
              onActivate={activate}
              onHover={setActiveIndex}
            />
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function resultLimit(
  selectedCategory: EverythingSearchCategory,
  resultCategory: EverythingSearchSection["category"],
): number {
  return selectedCategory === "all" ? ALL_CATEGORY_LIMITS[resultCategory] : CATEGORY_RESULT_LIMIT;
}

function commandSearchResult(
  command: AppCommand,
  kind: "command" | "action",
  resolveMessage: (value: string | MessageDescriptor) => string,
  bindings: readonly { command: string }[],
): EverythingSearchResult {
  return {
    key: `${kind}:${command.id}`,
    kind,
    command,
    title: resolveMessage(command.title),
    subtitle: resolveMessage(command.subtitle ?? command.group),
    shortcut: shortcutForCommand(command.id, bindings),
  };
}

function resolveSettingMatches(
  query: string,
  category: EverythingSearchCategory,
  t: (descriptor: MessageDescriptor) => string,
): SettingsSearchResult[] {
  const options = { devMode: isDevApp(), remoteSession: isRemoteSession() };
  if (query.trim()) return searchSettings(query, t, options);
  if (category !== "settings") return [];
  return SETTINGS_SEARCH_INDEX.filter(
    (entry) =>
      (!entry.devOnly || options.devMode) && (!entry.desktopOnly || !options.remoteSession),
  ).map((entry) => ({
    section: entry.section,
    anchor: entry.anchor,
    title: t(entry.title),
    snippet: entry.description ? t(entry.description) : null,
  }));
}

function shortcutForCommand(
  commandId: string,
  keybindings: readonly { command: string }[],
): string {
  const platform = readBridge().platform;
  const binding = keybindings.find((item) => item.command === commandId);
  if (!binding) return "";
  return formatKeybinding(bindingForPlatform(binding, platform), platform);
}
