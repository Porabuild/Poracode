import { toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { parseDraftProjectId } from "@/shared/paneId";
import { buildWorktreeLocation } from "@/shared/worktree";
import type { AgentSlashCommand, Project, Thread } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { i18n } from "@/renderer/i18n/i18n";
import { captureThreadPromptSubmitted } from "@/renderer/analytics/posthog";
import { addExistingProject } from "@/renderer/actions/createProjectActions";
import { getCurrentProjectId, resolveActivePaneId } from "@/renderer/actions/currentProject";
import {
  openChangelogSettings,
  openFilesPanel,
  openGitReview,
  openProjectSettings,
  openSettings,
  toggleBrowserPanel,
} from "@/renderer/actions/panelActions";
import {
  archiveThread,
  openNewThread,
  openNewThreadSideBySide,
  switchToAdjacentThread,
  toggleStarThread,
} from "@/renderer/actions/threadActions";
import {
  openTerminal,
  openWorktreeTerminal,
  runProjectAction,
} from "@/renderer/actions/terminalActions";
import { cycleRecentThread } from "@/renderer/actions/recentThreadCycle";
import { useAppStore } from "@/renderer/state/appStore";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { toggleSidebar } from "@/renderer/state/sidebarOverlayStore";
import { useSidebarUiStore } from "@/renderer/state/sidebarUiStore";
import { startShellWithToast, writeScriptToShell } from "@/renderer/utils/shellUtils";
import { openFindForActiveSurface } from "@/renderer/components/find/findController";
import { isEditorFocusElement, isTerminalFocusElement } from "./focusedSurface";
import { useCommandPaletteStore } from "./commandPaletteStore";
import type { CommandWhenContext } from "./when";
import { evaluateWhenClause } from "./when";

export interface AppCommand {
  id: string;
  title: string | MessageDescriptor;
  group: string | MessageDescriptor;
  subtitle?: string | MessageDescriptor;
  keywords?: string[];
  when?: string;
  /**
   * Documentation-only keybinding shown in the Shortcuts settings when the
   * command has no entry in keybindings.json. Used for commands whose key is
   * handled by a local listener rather than the global keybinding hook (e.g.
   * editor.close → ⌘W in FileEditorPane). The global hook never reads this; it
   * only resolves keys from the keybindings store, so it has no runtime effect.
   */
  keys?: string[];
  showInShortcuts?: boolean;
  run: (args?: unknown) => void | Promise<void>;
}

interface ActiveContext {
  project?: Project | undefined;
  thread?: Thread | undefined;
  draftProjectId?: string | undefined;
  worktreePath?: string | undefined;
}

export function buildWhenContext(
  target: EventTarget | null = document.activeElement,
): CommandWhenContext {
  const app = useAppStore.getState();
  const fileEditor = useFileEditorStore.getState();
  const terminal = useDevTerminalStore.getState();
  const paletteOpen = useCommandPaletteStore.getState().isOpen;
  const active = resolveActiveContext();
  const element = target instanceof Element ? target : document.activeElement;
  const inputFocus = isTextInputElement(element);
  const editorFocus = isEditorFocusElement(element);
  const terminalFocus = isTerminalFocusElement(element);
  const composerFocus = Boolean(
    element?.closest("[data-poracode-composer], .poracode-composer-shell"),
  );
  const panelFocus = Boolean(element?.closest("[data-poracode-panel], [data-overlay-surface]"));
  const sidebarFocus = Boolean(element?.closest(".poracode-sidebar-aside"));
  const browserFocus = Boolean(element?.closest("[data-poracode-browser]"));

  return {
    paletteOpen,
    inputFocus,
    editorFocus,
    composerFocus,
    editorOpen: Boolean(fileEditor.activePath || fileEditor.rootContext),
    terminalFocus,
    terminalOpen: terminal.isOpen,
    panelFocus,
    sidebarFocus,
    browserFocus,
    hasProject: Boolean(active.project),
    hasThread: Boolean(active.thread),
    view: app.view.kind,
    homeView: app.view.kind === "home",
    draftView: app.view.kind === "draft" || Boolean(active.draftProjectId),
    threadView: app.view.kind === "thread",
    guiThread: active.thread?.presentationMode === "gui",
    terminalThread: (active.thread?.presentationMode ?? "terminal") === "terminal",
    worktree: Boolean(active.worktreePath),
  };
}

export function isCommandAvailable(command: AppCommand, context: CommandWhenContext): boolean {
  return evaluateWhenClause(command.when, context);
}

export function buildCommandRegistry(): AppCommand[] {
  return [...baseCommands(), ...projectScriptCommands(), ...activeChatCommands()];
}

function baseCommands(): AppCommand[] {
  return [
    {
      id: "palette.open",
      title: msg`Open Command Palette`,
      group: "Poracode",
      run: () => useCommandPaletteStore.getState().open(),
    },
    {
      id: "settings.open",
      title: msg`Open Settings`,
      group: "Poracode",
      run: openSettings,
    },
    {
      id: "changelog.open",
      title: msg`What's New`,
      subtitle: msg`View the changelog`,
      group: "Poracode",
      keywords: ["changelog", "release notes", "what's new", "updates"],
      run: openChangelogSettings,
    },
    {
      id: "find.open",
      title: msg`Find`,
      subtitle: msg`Search the current view`,
      group: "Poracode",
      keywords: ["find", "search", "filter"],
      run: openFindForActiveSurface,
    },
    {
      id: "sidebar.toggle",
      title: msg`Toggle sidebar`,
      subtitle: msg`Show or hide the sidebar`,
      group: "Poracode",
      run: toggleSidebar,
    },
    {
      id: "project.add",
      title: msg`Open folder`,
      subtitle: msg`Add a local project`,
      group: msg`Project`,
      // No `when`: opening a folder must work before any project exists (e.g.
      // the welcome screen), so it stays globally available like palette.open.
      run: () => void addExistingProject(),
    },
    {
      id: "project.settings.open",
      title: msg`Open Project Settings`,
      group: msg`Project`,
      when: "hasProject",
      run: () => {
        const project = resolveActiveContext().project;
        if (project) openProjectSettings(project.id);
      },
    },
    {
      id: "thread.new",
      title: msg`New Thread`,
      group: msg`Thread`,
      when: "hasProject",
      run: () => openNewThread(resolveActiveContext().project?.id),
    },
    {
      id: "thread.new.panel",
      title: msg`New quick thread`,
      subtitle: msg`Start a new thread as panel instead of page`,
      group: msg`Thread`,
      when: "hasProject",
      run: () => {
        const project = resolveActiveContext().project;
        if (project) openNewThreadSideBySide(project.id);
      },
    },
    {
      id: "thread.search.open",
      title: msg`Search Threads`,
      group: msg`Thread`,
      run: () => usePanelStore.getState().openThreadSearch(),
    },
    {
      id: "thread.archive",
      title: msg`Archive thread`,
      subtitle: msg`Archive the current thread`,
      group: msg`Thread`,
      // Active while navigating the sidebar or a side panel, but not while
      // typing in the composer/editor/terminal. Archives the open thread.
      when: "hasThread && (sidebarFocus || panelFocus)",
      run: () => {
        const thread = resolveActiveContext().thread;
        if (thread) archiveThread(thread.id);
      },
    },
    {
      id: "thread.star",
      title: msg`Toggle star`,
      subtitle: msg`Star or unstar the current chat or model`,
      group: msg`Thread`,
      keywords: ["star", "unstar", "favorite", "favourite", "pin"],
      // Threads mirror archive scope; drafts have no thread yet, so they toggle
      // the selected model favorite instead.
      when: "(hasThread && (sidebarFocus || panelFocus)) || draftView",
      run: toggleStarCurrent,
    },
    {
      id: "thread.rename",
      title: msg`Rename chat`,
      subtitle: msg`Rename the current chat`,
      group: msg`Thread`,
      // Mirrors thread.archive/thread.star: active from the sidebar or a side
      // panel, never while typing. Opens the inline rename input on the open
      // thread's sidebar row (the input autofocuses on mount).
      when: "hasThread && (sidebarFocus || panelFocus)",
      run: () => {
        const thread = resolveActiveContext().thread;
        if (thread) useSidebarUiStore.getState().setEditingThreadId(thread.id);
      },
    },
    {
      id: "thread.next",
      title: msg`Next chat`,
      subtitle: msg`Switch to the next chat`,
      group: msg`Thread`,
      // Switch chats from anywhere in the chat shell (the composer included), but
      // yield to the editor/terminal/in-app browser where these chords carry a
      // local meaning. Unlike archive/star/rename this stays live while typing —
      // the chords don't produce text, so navigating mid-compose is intentional.
      when: "hasThread && !editorFocus && !terminalFocus && !browserFocus",
      run: () => {
        const thread = resolveActiveContext().thread;
        if (thread) switchToAdjacentThread(thread, "next");
      },
    },
    {
      id: "thread.previous",
      title: msg`Previous chat`,
      subtitle: msg`Switch to the previous chat`,
      group: msg`Thread`,
      when: "hasThread && !editorFocus && !terminalFocus && !browserFocus",
      run: () => {
        const thread = resolveActiveContext().thread;
        if (thread) switchToAdjacentThread(thread, "previous");
      },
    },
    {
      id: "thread.recent.next",
      title: msg`Next recently viewed chat`,
      subtitle: msg`Cycle to the next recently viewed chat`,
      group: msg`Thread`,
      // MRU chat switching (Ctrl+Tab). Shares the chat-shell scope of
      // thread.next/previous and yields to the editor/terminal/in-app browser,
      // where Ctrl+Tab cycles that surface's own tabs (tab.next/previous).
      when: "hasThread && !editorFocus && !terminalFocus && !browserFocus",
      run: () => cycleRecentThread(1),
    },
    {
      id: "thread.recent.previous",
      title: msg`Previous recently viewed chat`,
      subtitle: msg`Cycle to the previous recently viewed chat`,
      group: msg`Thread`,
      when: "hasThread && !editorFocus && !terminalFocus && !browserFocus",
      run: () => cycleRecentThread(-1),
    },
    {
      id: "terminal.toggle",
      title: msg`Toggle Terminal`,
      group: msg`Terminal`,
      when: "hasProject",
      run: () => {
        const active = resolveActiveContext();
        if (!active.project) return;
        if (active.worktreePath) {
          openWorktreeTerminal(active.project.id, active.worktreePath);
        } else {
          openTerminal(active.project.id);
        }
      },
    },
    {
      id: "terminal.command.run",
      title: msg`Run Terminal Command`,
      group: msg`Terminal`,
      when: "hasProject",
      run: (args) => runTerminalCommand(args),
    },
    {
      id: "files.open",
      title: msg`Open Files`,
      group: msg`Project`,
      when: "hasProject",
      run: () => {
        const active = resolveActiveContext();
        if (active.project) openFilesPanel(active.project.id, active.worktreePath);
      },
    },
    {
      id: "files.toggle",
      title: msg`Toggle File Tree`,
      subtitle: msg`Toggle the file tree panel`,
      group: msg`Project`,
      when: "hasProject",
      // openFilesPanel already closes the panel when it's the active right-panel
      // tab for this context, so a single chord toggles the file tree.
      run: () => {
        const active = resolveActiveContext();
        if (active.project) openFilesPanel(active.project.id, active.worktreePath);
      },
    },
    {
      id: "git.open",
      title: msg`Open Git Review`,
      group: msg`Project`,
      when: "hasProject",
      run: () => {
        const active = resolveActiveContext();
        if (active.project)
          openGitReview(active.project.id, active.worktreePath, active.thread?.id);
      },
    },
    {
      id: "pane.close",
      title: msg`Close Pane`,
      group: msg`Thread`,
      when: "threadView",
      run: closeFocusedPane,
    },
    {
      id: "editor.save",
      title: msg`Save File`,
      group: msg`Editor`,
      when: "editorOpen",
      run: () => {
        const editor = useFileEditorStore.getState();
        if (editor.activePath) void editor.saveFile(editor.activePath);
      },
    },
    {
      id: "editor.close",
      title: msg`Close Editor Tab`,
      group: msg`Editor`,
      when: "editorOpen",
      keys: ["Mod+W"],
      run: () => {
        const editor = useFileEditorStore.getState();
        const path = editor.activePath;
        if (!path) return;
        const buffer = editor.buffers[path];
        if (buffer?.isDirty && !window.confirm(i18n._(msg`Discard unsaved changes in ${path}?`)))
          return;
        editor.closeTab(path);
      },
    },
    {
      id: "editor.open",
      title: msg`Open File`,
      group: msg`Editor`,
      when: "hasProject",
      run: (args) => openFileFromArgs(args),
    },
    {
      id: "tab.next",
      title: msg`Next tab`,
      subtitle: msg`Switch to the next tab`,
      group: "Poracode",
      // Context-aware tab switching: cycles whichever surface holds focus — the
      // editor tab strip or the terminal tab strip. thread.next/previous own the
      // same chords elsewhere but stand down inside the editor/terminal (see
      // their `when`), leaving them free here.
      when: "editorFocus || terminalFocus",
      run: () => switchFocusedSurfaceTab("next"),
    },
    {
      id: "tab.previous",
      title: msg`Previous tab`,
      subtitle: msg`Switch to the previous tab`,
      group: "Poracode",
      when: "editorFocus || terminalFocus",
      run: () => switchFocusedSurfaceTab("previous"),
    },
    {
      id: "browser.focus-address-bar",
      title: msg`Focus browser address bar`,
      subtitle: msg`Focus the in-app browser address bar`,
      group: msg`Browser`,
      // Only while the in-app browser holds focus — same scope as the other
      // browser shortcuts, and avoids swallowing Ctrl+L elsewhere in the app.
      when: "browserFocus",
      run: focusBrowserAddressBar,
    },
    {
      id: "browser.toggle",
      title: msg`Toggle browser panel`,
      subtitle: msg`Show or hide the browser panel`,
      group: msg`Browser`,
      run: toggleBrowserPanel,
    },
    {
      id: "browser.tab.new",
      title: msg`Open browser tab`,
      subtitle: msg`Open a new browser tab`,
      group: msg`Browser`,
      // Only while the in-app browser holds focus, so it can reuse Ctrl+T — the
      // composer's cycle-effort chord lives in the disjoint composerFocus scope.
      when: "browserFocus",
      run: openNewBrowserTab,
    },
  ];
}

function projectScriptCommands(): AppCommand[] {
  const active = resolveActiveContext();
  const actions = active.project?.scripts?.actions ?? [];
  return actions.map((action) => {
    const command: AppCommand = {
      id: `script.${action.id}.run`,
      title: action.name,
      group: msg`Scripts`,
      keywords: [action.command, "project action", "script"],
      when: "hasProject",
      run: () =>
        active.project && runProjectAction(active.project.id, action.id, active.worktreePath),
    };
    if (active.project?.name) command.subtitle = active.project.name;
    return command;
  });
}

function activeChatCommands(): AppCommand[] {
  const thread = resolveActiveContext().thread;
  if (!thread) return [];
  const commands = thread?.slashCommands ?? [];
  return commands.map((command) => chatCommand(command, thread));
}

function chatCommand(command: AgentSlashCommand, thread: Thread): AppCommand {
  const displayId = command.section === "skills" ? (command.skillName ?? command.id) : command.id;
  return {
    id: `chat.command.${command.id}`,
    title: `/${displayId}`,
    group: msg`Chat Commands`,
    subtitle: command.description ?? command.label,
    keywords: [displayId, command.id, command.label, command.description ?? ""],
    when: "hasThread",
    showInShortcuts: false,
    run: async () => {
      await readBridge().sendThreadInput({
        threadId: thread.id,
        prompt: `/${command.id}`,
        config: thread.config,
      });
      captureThreadPromptSubmitted(thread, `/${command.id}`, undefined, "command_palette");
      useAppStore.getState().touchThread(thread.id);
    },
  };
}

function resolveActiveContext(): ActiveContext {
  const app = useAppStore.getState();
  let thread: Thread | undefined;
  let draftProjectId: string | undefined;
  if (app.view.kind === "thread") {
    const paneId = resolveActivePaneId(app.view.panes, app.focusedPaneId);
    draftProjectId = parseDraftProjectId(paneId);
    if (!draftProjectId) {
      thread = app.threads.find((item) => item.id === paneId);
    }
  }

  const projectId = draftProjectId ?? thread?.projectId ?? getCurrentProjectId();
  const project = projectId ? app.projects.find((item) => item.id === projectId) : undefined;
  return {
    project,
    thread,
    draftProjectId,
    worktreePath: thread?.worktreePath,
  };
}

function openNewBrowserTab(): void {
  // Mirrors the browser toolbar "+" / empty-state action: a new tab on the home
  // page, activated. Keep the home URL in sync with BrowserPanel's DEFAULT_HOME.
  void readBridge()
    .browserCreateTab({ url: "https://www.google.com", activate: true })
    .catch(() => {});
}

function focusBrowserAddressBar(): void {
  // The browser panel can be mounted twice (right panel + overlay), so target
  // the address bar inside the browser that currently holds focus, falling back
  // to the first mounted instance.
  const active = document.activeElement;
  const container =
    (active instanceof Element ? active.closest("[data-poracode-browser]") : null) ??
    document.querySelector("[data-poracode-browser]");
  const input = container?.querySelector<HTMLInputElement>("[data-poracode-browser-address]");
  if (!input) return;
  input.focus();
  input.select();
}

function switchFocusedSurfaceTab(direction: "next" | "previous"): void {
  // The binding's `when` (editorFocus || terminalFocus) guarantees one of these
  // surfaces holds focus when this runs; cycle that surface's own tab strip.
  const element = document.activeElement;
  if (isTerminalFocusElement(element)) {
    useDevTerminalStore.getState().cycleTab(direction);
    return;
  }
  if (isEditorFocusElement(element)) {
    useFileEditorStore.getState().cycleTab(direction);
  }
}

function closeFocusedPane(): void {
  const app = useAppStore.getState();
  if (app.view.kind !== "thread") return;
  const target =
    app.focusedPaneId && app.view.panes.includes(app.focusedPaneId)
      ? app.focusedPaneId
      : app.view.panes.at(-1);
  if (target) app.closePane(target);
}

/**
 * Context-aware star toggle. In a thread the "current chat" is the focused
 * thread, so we flip its star. On the new-thread (draft) screen there is no
 * chat yet, so we flip the favorite on the model selected in the composer —
 * read from the project's persisted draft config, which updates on every model
 * pick. The draft has no active presentation mode to scope by, so the favorite
 * is toggled across every mode; the agent's last-used mode is only used to key
 * a freshly-added entry.
 */
function toggleStarCurrent(): void {
  const active = resolveActiveContext();
  if (active.thread) {
    const thread = active.thread;
    const willStar = !thread.starred;
    toggleStarThread(thread.id);
    toast.success(willStar ? i18n._(msg`Chat starred`) : i18n._(msg`Chat unstarred`));
    return;
  }

  const draft = active.project?.lastDraftConfig;
  if (!draft?.agentKind || !draft.model) return;

  const settings = useSharedSettings.getState();
  const fallbackMode = settings.lastPresentationModeByAgent[draft.agentKind] ?? "terminal";
  const nowFavorite = settings.toggleFavoriteModelAnyMode(
    draft.agentKind,
    draft.model,
    fallbackMode,
  );
  toast.success(
    nowFavorite ? i18n._(msg`Model added to favorites`) : i18n._(msg`Model removed from favorites`),
  );
}

function openFileFromArgs(args: unknown): void {
  const active = resolveActiveContext();
  if (!active.project) return;
  const editor = useFileEditorStore.getState();
  if (!editor.rootContext) {
    openFilesPanel(active.project.id, active.worktreePath);
  }
  if (!isRecord(args) || typeof args.path !== "string" || args.path.trim() === "") {
    openFilesPanel(active.project.id, active.worktreePath);
    return;
  }
  void useFileEditorStore
    .getState()
    .openFile(args.path, "fullscreen", false, readLineNumber(args))
    .catch((error) =>
      toast.danger(error instanceof Error ? error.message : i18n._(msg`Unable to open file`)),
    );
}

function readLineNumber(args: Record<string, unknown>): { lineNumber?: number } | undefined {
  if (typeof args.lineNumber !== "number") return undefined;
  return { lineNumber: args.lineNumber };
}

function runTerminalCommand(args: unknown): void {
  const command = isRecord(args) && typeof args.command === "string" ? args.command : "";
  if (!command.trim()) {
    toast.warning("terminal.command.run requires args.command.");
    return;
  }
  const active = resolveActiveContext();
  if (!active.project) return;

  const worktreePath =
    isRecord(args) && typeof args.worktreePath === "string"
      ? args.worktreePath
      : active.worktreePath;
  const location = worktreePath
    ? buildWorktreeLocation(active.project.location, worktreePath)
    : active.project.location;
  const title = isRecord(args) && typeof args.name === "string" ? args.name : "command";
  const terminal = useDevTerminalStore.getState();
  const tab = terminal.addTab(active.project.id, title, worktreePath);

  if (useSharedSettings.getState().autoShowTerminalPanel) {
    if (worktreePath) terminal.openWorktreePanel(active.project.id, worktreePath);
    else terminal.openPanel(active.project.id);
  }
  terminal.setActiveTab(tab.id);

  void startShellWithToast(
    {
      shellId: tab.id,
      projectLocation: location,
      ...(worktreePath ? { worktreePath } : {}),
    },
    title,
  );
  writeScriptToShell(tab.id, command, active.project.remoteServerId);
}

function isTextInputElement(element: Element | null): boolean {
  if (!element) return false;
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLElement && element.isContentEditable) return true;
  return element.getAttribute("role") === "textbox";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
