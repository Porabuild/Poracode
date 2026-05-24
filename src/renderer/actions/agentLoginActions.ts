import { toast } from "@heroui/react";
import type { Project } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { useLoginTerminalStore } from "@/renderer/state/loginTerminalStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { writeScriptToShell } from "@/renderer/utils/shellUtils";

function resolveLoginProject(): Project | undefined {
  const app = useAppStore.getState();
  const view = app.view;
  const terminalProjectId = useDevTerminalStore.getState().activeProjectId;
  if (terminalProjectId) {
    const project = app.projects.find((candidate) => candidate.id === terminalProjectId);
    if (project) return project;
  }

  if (view.kind === "draft") {
    const project = app.projects.find((candidate) => candidate.id === view.projectId);
    if (project) return project;
  }

  if (view.kind === "thread") {
    const focusedThreadId =
      app.focusedPaneId && view.panes.includes(app.focusedPaneId)
        ? app.focusedPaneId
        : view.panes[0];
    const thread = app.threads.find((candidate) => candidate.id === focusedThreadId);
    const project = thread
      ? app.projects.find((candidate) => candidate.id === thread.projectId)
      : undefined;
    if (project) return project;
  }

  return app.projects[0];
}

export function runAgentTerminalCommand(input: {
  label: string;
  command: string | ((project: Project) => string);
  env?: Record<string, string>;
  onCommandComplete?: (exitCode: number) => void;
  openUrlsInNativeBrowser?: boolean;
  project?: Project;
  tabPurpose?: string;
  toastPurpose?: string;
}): boolean {
  const project = input.project ?? resolveLoginProject();
  if (!project) {
    toast.warning("Add a project before opening an agent terminal.");
    return false;
  }

  const terminal = useDevTerminalStore.getState();
  const purpose = input.tabPurpose ?? "login";
  const tab = terminal.addTab(project.id, `${input.label} ${purpose}`);
  terminal.openPanel(project.id);
  terminal.setActiveTab(tab.id);
  if (useSharedSettings.getState().terminalPosition !== "bottom") {
    usePanelStore.getState().setRightPanelTab("terminal");
  }

  void readBridge()
    .startShell({
      shellId: tab.id,
      projectLocation: project.location,
    })
    .catch((error) =>
      toast.danger(
        error instanceof Error
          ? error.message
          : `Unable to open ${input.label} ${input.toastPurpose ?? purpose}.`,
      ),
    );
  const command = buildTerminalCommand({
    command: typeof input.command === "function" ? input.command(project) : input.command,
    env: input.env,
    openUrlsInNativeBrowser: input.openUrlsInNativeBrowser === true,
    project,
  });
  const completionToken = input.onCommandComplete ? createCompletionToken() : undefined;
  if (completionToken && input.onCommandComplete) {
    watchCommandCompletion(tab.id, completionToken, input.onCommandComplete);
  }
  writeScriptToShell(
    tab.id,
    completionToken ? appendCompletionSignal(command, project, completionToken) : command,
  );
  toast.success(`Opened ${input.label} ${input.toastPurpose ?? purpose} in terminal.`);
  return true;
}

export function runAgentLoginCommand(input: {
  label: string;
  command: string;
  env?: Record<string, string>;
  onCommandComplete?: (exitCode: number) => void;
  project?: Project;
}): boolean {
  const project = input.project ?? resolveLoginProject();
  if (!project) {
    toast.warning("Add a project before signing in.");
    return false;
  }

  // Replace any active login session — only one terminal panel at a time.
  const previous = useLoginTerminalStore.getState().active;
  if (previous) {
    previous.onForceClose?.();
    void readBridge()
      .closeThread({ threadId: previous.shellId })
      .catch(() => undefined);
  }

  const shellId = `login:${crypto.randomUUID()}`;
  // Wipe the bash prompt + echoed script line that briefly appear before the
  // TUI takes over. `clear` (POSIX) / `Clear-Host` (PowerShell) gives the
  // overlay a clean canvas so the user only sees the agent's own UI.
  const cleared =
    project.location.kind === "windows"
      ? `Clear-Host; ${input.command}`
      : `clear; ${input.command}`;
  const command = buildTerminalCommand({
    command: cleared,
    env: input.env,
    openUrlsInNativeBrowser: true,
    project,
  });
  const completionToken = createCompletionToken();
  const script = appendCompletionSignal(command, project, completionToken);

  let fired = false;
  const fireOnce = (exitCode: number) => {
    if (fired) return;
    fired = true;
    input.onCommandComplete?.(exitCode);
  };

  const stopWatching = watchCommandCompletion(shellId, completionToken, (exitCode) => {
    fireOnce(exitCode);
    // Auto-dismiss the overlay shortly after the command exits so the user
    // can read any final success line before it slides away.
    window.setTimeout(() => useLoginTerminalStore.getState().close(), 1200);
  });

  useLoginTerminalStore.getState().open({
    shellId,
    label: input.label,
    projectLocation: project.location,
    onForceClose: () => {
      stopWatching();
      fireOnce(-1);
    },
  });

  void readBridge()
    .startShell({ shellId, projectLocation: project.location })
    .catch((error) => {
      toast.danger(error instanceof Error ? error.message : `Unable to open ${input.label} login.`);
      useLoginTerminalStore.getState().close();
    });
  writeScriptToShell(shellId, script);
  return true;
}

function quotePosixShellArg(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function shellEnvPrefix(env: Record<string, string> | undefined): string {
  if (!env) return "";
  return Object.entries(env)
    .filter(([key]) => /^[A-Za-z_][A-Za-z0-9_]*$/u.test(key))
    .map(([key, value]) => `${key}=${quotePosixShellArg(value)}`)
    .join(" ");
}

function openWslUrlsInNativeBrowser(command: string): string {
  const script = [
    `${command} 2>&1 | while IFS= read -r line; do`,
    'printf "%s\\n" "$line";',
    'url=$(printf "%s\\n" "$line" | sed -n "s/.*\\(https\\?:\\/\\/[^[:space:]]*\\).*/\\1/p" | head -n 1);',
    'cmd_url=$(printf "%s" "$url" | sed "s/&/^\\\\&/g");',
    'if [ -n "$cmd_url" ]; then cmd.exe /c start "" "$cmd_url" >/dev/null 2>&1 || true; fi;',
    "done",
  ].join(" ");
  return `sh -lc ${quotePosixShellArg(script)}`;
}

function buildTerminalCommand(input: {
  command: string;
  env: Record<string, string> | undefined;
  openUrlsInNativeBrowser: boolean;
  project: Project;
}): string {
  const envPrefix = shellEnvPrefix(input.env);
  const command = envPrefix ? `${envPrefix} ${input.command}` : input.command;
  if (input.project.location.kind !== "wsl" || !input.openUrlsInNativeBrowser) return command;
  return openWslUrlsInNativeBrowser(command);
}

function createCompletionToken(): string {
  return `lc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function completionMarker(token: string): string {
  return `\u001B]777;lightcode-login-complete=${token}:`;
}

function appendCompletionSignal(command: string, project: Project, token: string): string {
  if (project.location.kind === "windows") {
    return `${command}; $lcExit = if ($LASTEXITCODE -ne $null) { $LASTEXITCODE } else { 0 }; Write-Host "$([char]27)]777;lightcode-login-complete=${token}:$lcExit$([char]7)" -NoNewline`;
  }
  return `${command}; __lc_exit=$?; printf '\\033]777;lightcode-login-complete=${token}:%s\\007' "$__lc_exit"`;
}

function watchCommandCompletion(
  shellId: string,
  token: string,
  onCommandComplete: (exitCode: number) => void,
): () => void {
  const marker = completionMarker(token);
  let buffer = "";
  let done = false;
  let unsubscribe: () => void = () => undefined;
  const timeout = window.setTimeout(() => {
    if (done) return;
    done = true;
    unsubscribe();
  }, 10 * 60_000);
  unsubscribe = readBridge().onSupervisorEvent((event) => {
    if (done || event.type !== "thread-output" || event.threadId !== shellId) return;
    buffer = `${buffer}${event.data}`.slice(-1024);
    const start = buffer.indexOf(marker);
    if (start < 0) return;
    const rest = buffer.slice(start + marker.length);
    const match = /^(\d+)/u.exec(rest);
    if (!match) return;
    done = true;
    window.clearTimeout(timeout);
    unsubscribe();
    onCommandComplete(Number(match[1]));
  });
  return () => {
    if (done) return;
    done = true;
    window.clearTimeout(timeout);
    unsubscribe();
  };
}
