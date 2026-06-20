import { toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { parseDraftProjectId } from "@/shared/paneId";
import { buildWorktreeLocation } from "@/shared/worktree";
import type { AgentSlashCommand, Project, Thread } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { i18n } from "@/renderer/i18n/i18n";
import { captureThreadInputSubmitted } from "@/renderer/analytics/posthog";
import { getCurrentProjectId, resolveActivePaneId } from "@/renderer/actions/currentProject";
import {
  openFilesPanel,
  openGitReview,
  openProjectSettings,
  openSettings,
} from "@/renderer/actions/panelActions";
import { openNewThread, toggleStarThread } from "@/renderer/actions/threadActions";
import { runProjectAction, showTerminalPanel } from "@/renderer/actions/terminalActions";
import { useAppStore } from "@/renderer/state/appStore";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { startShellWithToast, writeScriptToShell } from "@/renderer/utils/shellUtils";
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
  const editorFocus = Boolean(element?.closest(".monaco-editor"));
  const terminalFocus = Boolean(element?.closest(".xterm"));

  return {
    paletteOpen,
    inputFocus,
    editorFocus,
    editorOpen: Boolean(fileEditor.activePath || fileEditor.rootContext),
    terminalFocus,
    terminalOpen: terminal.isOpen,
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
      group: "Lightcode",
      run: () => useCommandPaletteStore.getState().open(),
    },
    {
      id: "settings.open",
      title: msg`Open Settings`,
      group: "Lightcode",
      run: openSettings,
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
      id: "thread.search.open",
      title: msg`Search Threads`,
      group: msg`Thread`,
      run: () => usePanelStore.getState().openThreadSearch(),
    },
    {
      id: "star.toggle",
      title: msg`Toggle Star`,
      subtitle: msg`Star or unstar the current chat or model`,
      group: msg`Thread`,
      keywords: ["star", "unstar", "favorite", "favourite", "pin"],
      when: "hasThread || draftView",
      run: toggleStarCurrent,
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
          showTerminalPanel(active.project.id, active.worktreePath);
        } else {
          useDevTerminalStore.getState().togglePanel(active.project.id);
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
      id: "git.open",
      title: msg`Open Git Review`,
      group: msg`Project`,
      when: "hasProject",
      run: () => {
        const active = resolveActiveContext();
        if (active.project) openGitReview(active.project.id, active.worktreePath);
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
  return {
    id: `chat.command.${command.id}`,
    title: `/${command.id}`,
    group: msg`Chat Commands`,
    subtitle: command.description ?? command.label,
    keywords: [command.label, command.description ?? ""],
    when: "hasThread",
    run: async () => {
      await readBridge().sendThreadInput({
        threadId: thread.id,
        prompt: `/${command.id}`,
        config: thread.config,
      });
      captureThreadInputSubmitted(thread);
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

  startShellWithToast(
    {
      shellId: tab.id,
      projectLocation: location,
      ...(worktreePath ? { worktreePath } : {}),
    },
    title,
  );
  writeScriptToShell(tab.id, command);
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
