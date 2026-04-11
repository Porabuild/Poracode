import { randomUUID } from "node:crypto";
import { fork, type ChildProcess } from "node:child_process";
import { mkdirSync, rmSync, watch, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  powerSaveBlocker,
  protocol,
  screen,
  shell,
} from "electron";
import { autoUpdater } from "electron-updater";
import {
  closeDatabase,
  dbDeleteProject,
  dbDeleteThread,
  dbGetProjects,
  dbGetState,
  dbGetThreads,
  dbSetState,
  dbSyncAll,
  dbUpsertProject,
  dbUpsertThread,
  initDatabase,
} from "./db";
import { cleanupOrphanedAttachments, prepareLightcodeDataRoot } from "./lightcodeData";
import {
  readSharedSettingsFile,
  writeSharedSettingsFile,
} from "./sharedSettingsFile";
import type {
  SupervisorEvent,
  SupervisorReply,
  SupervisorRequest,
  UpdateStatus,
  WindowChromePayload,
} from "../shared/ipc";
import type { SharedSettings } from "../shared/settings";
import type { LightcodePaths } from "../shared/lightcodePaths";
import { getAppName } from "../shared/appName";
import { msg } from "../shared/messages";

const CHANNELS = {
  pickFolder: "lightcode:pick-folder",
  pickFiles: "lightcode:pick-files",
  saveClipboardImage: "lightcode:save-clipboard-image",
  listWslDistros: "lightcode:list-wsl-distros",
  getAgentStatuses: "lightcode:get-agent-statuses",
  getThreadSnapshots: "lightcode:get-thread-snapshots",
  startThread: "lightcode:start-thread",
  sendThreadInput: "lightcode:send-thread-input",
  writeTerminal: "lightcode:write-terminal",
  resizeTerminal: "lightcode:resize-terminal",
  resolveThreadServerRequest: "lightcode:resolve-thread-server-request",
  closeThread: "lightcode:close-thread",
  startShell: "lightcode:start-shell",
  getGitStatus: "lightcode:get-git-status",
  getGitDiff: "lightcode:get-git-diff",
  getGitDiffBatch: "lightcode:get-git-diff-batch",
  getGitFileContent: "lightcode:get-git-file-content",
  gitStage: "lightcode:git-stage",
  gitUnstage: "lightcode:git-unstage",
  gitRevert: "lightcode:git-revert",
  gitStageAll: "lightcode:git-stage-all",
  gitUnstageAll: "lightcode:git-unstage-all",
  gitRevertAll: "lightcode:git-revert-all",
  gitCommit: "lightcode:git-commit",
  generateCommitMessage: "lightcode:generate-commit-message",
  generateTitle: "lightcode:generate-title",
  gitListBranches: "lightcode:git-list-branches",
  gitFetch: "lightcode:git-fetch",
  gitListWorktrees: "lightcode:git-list-worktrees",
  gitAddWorktree: "lightcode:git-add-worktree",
  gitRemoveWorktree: "lightcode:git-remove-worktree",
  gitPruneWorktrees: "lightcode:git-prune-worktrees",
  gitDeleteBranch: "lightcode:git-delete-branch",
  gitSwitchBranch: "lightcode:git-switch-branch",
  gitPull: "lightcode:git-pull",
  gitPush: "lightcode:git-push",
  gitSync: "lightcode:git-sync",
  gitGetWorktreeSourceBranch: "lightcode:git-get-worktree-source-branch",
  gitMergeToSource: "lightcode:git-merge-to-source",
  gitPullFromSource: "lightcode:git-pull-from-source",
  gitAbortMerge: "lightcode:git-abort-merge",
  gitRunMergetool: "lightcode:git-run-mergetool",
  gitFinishMerge: "lightcode:git-finish-merge",
  gitWatchProject: "lightcode:git-watch-project",
  gitWatchWorktrees: "lightcode:git-watch-worktrees",
  gitUnwatchProject: "lightcode:git-unwatch-project",
  searchProjectFiles: "lightcode:search-project-files",
  detectSetupScript: "lightcode:detect-setup-script",
  ghCheckAvailable: "lightcode:gh-check-available",
  ghCreatePr: "lightcode:gh-create-pr",
  ghGetPrForBranch: "lightcode:gh-get-pr-for-branch",
  ghMergePr: "lightcode:gh-merge-pr",
  ghClosePr: "lightcode:gh-close-pr",
  ghReopenPr: "lightcode:gh-reopen-pr",
  ghGetPrChecks: "lightcode:gh-get-pr-checks",
  openExternal: "lightcode:open-external",
  getSharedSettings: "lightcode:get-shared-settings",
  setSharedSettings: "lightcode:set-shared-settings",
  setWindowChrome: "lightcode:set-window-chrome",
  dbGetProjects: "lightcode:db-get-projects",
  dbGetThreads: "lightcode:db-get-threads",
  dbGetState: "lightcode:db-get-state",
  dbSetState: "lightcode:db-set-state",
  dbUpsertProject: "lightcode:db-upsert-project",
  dbUpsertThread: "lightcode:db-upsert-thread",
  dbDeleteThread: "lightcode:db-delete-thread",
  dbDeleteProject: "lightcode:db-delete-project",
  dbSyncAll: "lightcode:db-sync-all",
  supervisorEvent: "lightcode:supervisor-event",
  updateStatus: "lightcode:update-status",
  checkForUpdate: "lightcode:check-for-update",
  startUpdateDownload: "lightcode:start-update-download",
  installUpdate: "lightcode:install-update",
} as const;

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

// Separate user-data directory so the dev instance doesn't fight the
// production build over disk-cache, GPU-cache, or database lock files.
if (isDev) {
  app.setPath("userData", join(app.getPath("userData"), "Dev"));
}

const hasSingleInstanceLock = isDev || app.requestSingleInstanceLock();
const WINDOW_CHROME_HEIGHT = 32;

let mainWindow: BrowserWindow | null = null;
let supervisor: ChildProcess | null = null;
let lightcodePaths: LightcodePaths | null = null;
const pendingRequests = new Map<
  string,
  {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
  }
>();

// ── Power save blocker (prevent sleep while threads are working) ──────
let powerSaveBlockerId: number | null = null;
const workingThreads = new Set<string>();

function updatePowerSaveBlocker(): void {
  const settings = lightcodePaths
    ? readSharedSettingsFile(lightcodePaths.settingsPath)
    : null;
  const enabled = settings?.preventSleepWhileWorking ?? true;
  const shouldBlock = enabled && workingThreads.size > 0;

  if (shouldBlock && powerSaveBlockerId === null) {
    powerSaveBlockerId = powerSaveBlocker.start("prevent-app-suspension");
  } else if (!shouldBlock && powerSaveBlockerId !== null) {
    if (powerSaveBlocker.isStarted(powerSaveBlockerId)) {
      powerSaveBlocker.stop(powerSaveBlockerId);
    }
    powerSaveBlockerId = null;
  }
}

function handleSupervisorEventForSleep(event: SupervisorEvent): void {
  if (event.type === "thread-state") {
    const active = event.status === "working" || event.status === "launching";
    if (active) {
      workingThreads.add(event.threadId);
    } else {
      workingThreads.delete(event.threadId);
    }
    updatePowerSaveBlocker();
  } else if (event.type === "thread-exited") {
    workingThreads.delete(event.threadId);
    updatePowerSaveBlocker();
  }
}

interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

function getSavedWindowBounds(): WindowBounds | null {
  try {
    const raw = dbGetState("window-bounds");
    if (!raw) return null;
    const bounds = JSON.parse(raw) as WindowBounds;
    if (typeof bounds.width !== "number" || typeof bounds.height !== "number") return null;

    // Validate that the saved position overlaps a visible display
    if (typeof bounds.x === "number" && typeof bounds.y === "number") {
      const rect = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
      const display = screen.getDisplayMatching(rect);
      const { x: dx, y: dy, width: dw, height: dh } = display.workArea;
      const overlapX = Math.max(0, Math.min(rect.x + rect.width, dx + dw) - Math.max(rect.x, dx));
      const overlapY = Math.max(0, Math.min(rect.y + rect.height, dy + dh) - Math.max(rect.y, dy));
      if (overlapX < 50 || overlapY < 50) {
        // Window would be mostly off-screen — discard position, keep size
        return { ...bounds, x: undefined!, y: undefined! };
      }
    }

    return bounds;
  } catch {
    return null;
  }
}

function saveWindowBounds(win: BrowserWindow): void {
  const isMaximized = win.isMaximized();
  const { x, y, width, height } = win.getNormalBounds();
  dbSetState("window-bounds", JSON.stringify({ x, y, width, height, isMaximized }));
}

function createWindow(): BrowserWindow {
  const saved = getSavedWindowBounds();
  const supportsTitleBarOverlay = process.platform === "win32" || process.platform === "linux";
  const window = new BrowserWindow({
    title: getAppName(isDev),
    show: false,
    width: saved?.width ?? 1460,
    height: saved?.height ?? 920,
    ...(saved?.x != null && saved?.y != null ? { x: saved.x, y: saved.y } : {}),
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: "#1c1f24",
    autoHideMenuBar: true,
    ...(supportsTitleBarOverlay
      ? {
          titleBarStyle: "hidden" as const,
          titleBarOverlay: {
            color: "#00000000",
            symbolColor: "#f8fafc",
            height: WINDOW_CHROME_HEIGHT,
          },
        }
      : {
          titleBarStyle: "hidden" as const,
        }),
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Show window only after it's fully ready — no size/position flicker
  window.once("ready-to-show", () => {
    if (saved?.isMaximized) window.maximize();
    window.show();
  });

  if (isDev) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL as string);
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  // Debounced save on move/resize
  let boundsTimer: ReturnType<typeof setTimeout> | null = null;
  const debouncedSave = () => {
    if (boundsTimer) clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => saveWindowBounds(window), 500);
  };
  window.on("resize", debouncedSave);
  window.on("move", debouncedSave);
  window.on("maximize", debouncedSave);
  window.on("unmaximize", debouncedSave);

  // Final save on close (synchronous, no debounce)
  window.on("close", () => {
    if (boundsTimer) clearTimeout(boundsTimer);
    saveWindowBounds(window);
  });

  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  return window;
}

function isSupervisorReply(message: unknown): message is SupervisorReply {
  return typeof message === "object" && message !== null && "replyTo" in message;
}

function requireLightcodePaths(): LightcodePaths {
  if (!lightcodePaths) {
    throw new Error("Lightcode paths are not initialized.");
  }
  return lightcodePaths;
}

function startSupervisor(baseDir: string): void {
  supervisor?.kill();

  for (const [id, pending] of pendingRequests) {
    pending.reject(new Error(msg("supervisor.restarted")));
    pendingRequests.delete(id);
  }

  workingThreads.clear();
  updatePowerSaveBlocker();

  const child = fork(join(__dirname, "supervisor.cjs"), [], {
    stdio: ["inherit", "inherit", "inherit", "ipc"],
    env: {
      ...process.env,
      LIGHTCODE_DATA_DIR: baseDir,
    },
  });

  supervisor = child;

  child.on("message", (message: SupervisorReply | SupervisorEvent) => {
    if (isSupervisorReply(message)) {
      const pending = pendingRequests.get(message.replyTo);
      if (!pending) {
        return;
      }

      pendingRequests.delete(message.replyTo);
      if (message.ok) {
        pending.resolve(message.data);
      } else {
        pending.reject(new Error(message.error));
      }
      return;
    }

    handleSupervisorEventForSleep(message);
    mainWindow?.webContents.send(CHANNELS.supervisorEvent, message);
  });

  child.on("exit", (code) => {
    if (supervisor === child) {
      supervisor = null;
      for (const [id, pending] of pendingRequests) {
        pending.reject(new Error(msg("supervisor.exited")));
        pendingRequests.delete(id);
      }

      if (code !== 0 && lightcodePaths) {
        console.error(`[lightcode] supervisor exited with code ${code}, restarting…`);
        setTimeout(() => {
          if (!supervisor && lightcodePaths) {
            startSupervisor(lightcodePaths.baseDir);
          }
        }, 1000);
      }
    }
  });
}

function callSupervisor<TRequest extends SupervisorRequest, TResult = unknown>(
  type: TRequest["type"],
  payload: TRequest["payload"],
): Promise<TResult> {
  const child = supervisor;
  if (!child || !child.connected) {
    return Promise.reject(new Error(msg("supervisor.notRunning")));
  }

  const id = randomUUID();
  const request = {
    id,
    type,
    payload,
  } as SupervisorRequest;

  return new Promise<TResult>((resolve, reject) => {
    pendingRequests.set(id, {
      resolve: (value) => resolve(value as TResult),
      reject,
    });
    try {
      child.send(request, (error) => {
        if (!error) {
          return;
        }
        pendingRequests.delete(id);
        reject(error);
      });
    } catch (error) {
      pendingRequests.delete(id);
      reject(error);
    }
  });
}

function sendUpdateStatus(status: UpdateStatus): void {
  mainWindow?.webContents.send(CHANNELS.updateStatus, status);
}

function setupAutoUpdater(): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    sendUpdateStatus({ type: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    sendUpdateStatus({ type: "update-available", version: info.version });
  });

  autoUpdater.on("update-not-available", () => {
    sendUpdateStatus({ type: "update-not-available" });
  });

  autoUpdater.on("download-progress", (progress) => {
    sendUpdateStatus({
      type: "downloading",
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    sendUpdateStatus({ type: "downloaded", version: info.version });
  });

  autoUpdater.on("error", (err) => {
    sendUpdateStatus({ type: "error", message: err.message });
  });

  // Delay the initial check so the window has time to load
  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch(() => undefined);
  }, 3000);
}

function registerIpcHandlers(): void {
  ipcMain.handle(CHANNELS.pickFolder, async (_event, defaultPath?: string) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ["openDirectory"],
      title: "Add Project",
      ...(defaultPath ? { defaultPath } : {}),
    });

    if (result.canceled) {
      return null;
    }

    return result.filePaths[0] ?? null;
  });

  ipcMain.handle(
    CHANNELS.pickFiles,
    async (
      _event,
      options?: { title?: string; filters?: { name: string; extensions: string[] }[] },
    ) => {
      const result = await dialog.showOpenDialog(mainWindow!, {
        properties: ["openFile", "multiSelections"],
        title: options?.title ?? "Add files or photos",
        filters: options?.filters ?? [{ name: "All Files", extensions: ["*"] }],
      });
      return result.canceled ? null : result.filePaths;
    },
  );

  ipcMain.handle(
    CHANNELS.saveClipboardImage,
    async (_event, payload: { threadId: string; data: Uint8Array; extension: string }) => {
      const paths = requireLightcodePaths();
      const threadDir = join(
        paths.attachmentsDir,
        payload.threadId.replace(/:/g, "-").slice(0, 12),
      );
      mkdirSync(threadDir, { recursive: true });
      const fileName = `${randomUUID().slice(0, 8)}.${payload.extension || "png"}`;
      const filePath = join(threadDir, fileName);
      writeFileSync(filePath, Buffer.from(payload.data));
      return filePath;
    },
  );

  ipcMain.handle(CHANNELS.listWslDistros, async () =>
    callSupervisor<SupervisorRequest, string[]>("listWslDistros", {}),
  );

  ipcMain.handle(CHANNELS.getAgentStatuses, async (_event, payload) =>
    callSupervisor("getAgentStatuses", payload ?? { wslDistros: [] }),
  );
  ipcMain.handle(CHANNELS.getThreadSnapshots, async () => callSupervisor("getThreadSnapshots", {}));

  ipcMain.handle(CHANNELS.startThread, async (_event, payload) =>
    callSupervisor("startThread", payload),
  );

  ipcMain.handle(CHANNELS.sendThreadInput, async (_event, payload) =>
    callSupervisor("sendThreadInput", payload),
  );

  ipcMain.handle(CHANNELS.writeTerminal, async (_event, payload) =>
    callSupervisor("writeTerminal", payload),
  );

  ipcMain.handle(CHANNELS.resizeTerminal, async (_event, payload) =>
    callSupervisor("resizeTerminal", payload),
  );

  ipcMain.handle(CHANNELS.resolveThreadServerRequest, async (_event, payload) =>
    callSupervisor("resolveThreadServerRequest", payload),
  );

  ipcMain.handle(CHANNELS.closeThread, async (_event, payload) =>
    callSupervisor("closeThread", payload),
  );

  ipcMain.handle(CHANNELS.startShell, async (_event, payload) =>
    callSupervisor("startShell", payload),
  );

  ipcMain.handle(CHANNELS.getGitStatus, async (_event, payload) =>
    callSupervisor("getGitStatus", payload),
  );

  ipcMain.handle(CHANNELS.getGitDiff, async (_event, payload) =>
    callSupervisor("getGitDiff", payload),
  );

  ipcMain.handle(CHANNELS.getGitDiffBatch, async (_event, payload) =>
    callSupervisor("getGitDiffBatch", payload),
  );

  ipcMain.handle(CHANNELS.getGitFileContent, async (_event, payload) =>
    callSupervisor("getGitFileContent", payload),
  );

  ipcMain.handle(CHANNELS.gitStage, async (_event, payload) => callSupervisor("gitStage", payload));

  ipcMain.handle(CHANNELS.gitUnstage, async (_event, payload) =>
    callSupervisor("gitUnstage", payload),
  );

  ipcMain.handle(CHANNELS.gitRevert, async (_event, payload) =>
    callSupervisor("gitRevert", payload),
  );

  ipcMain.handle(CHANNELS.gitStageAll, async (_event, payload) =>
    callSupervisor("gitStageAll", payload),
  );

  ipcMain.handle(CHANNELS.gitUnstageAll, async (_event, payload) =>
    callSupervisor("gitUnstageAll", payload),
  );

  ipcMain.handle(CHANNELS.gitRevertAll, async (_event, payload) =>
    callSupervisor("gitRevertAll", payload),
  );

  ipcMain.handle(CHANNELS.gitCommit, async (_event, payload) =>
    callSupervisor("gitCommit", payload),
  );

  ipcMain.handle(CHANNELS.generateCommitMessage, async (_event, payload) =>
    callSupervisor("generateCommitMessage", payload),
  );

  ipcMain.handle(CHANNELS.generateTitle, async (_event, payload) =>
    callSupervisor("generateTitle", payload),
  );

  ipcMain.handle(CHANNELS.gitListBranches, async (_event, payload) =>
    callSupervisor("gitListBranches", payload),
  );

  ipcMain.handle(CHANNELS.gitFetch, async (_event, payload) => callSupervisor("gitFetch", payload));

  ipcMain.handle(CHANNELS.gitListWorktrees, async (_event, payload) =>
    callSupervisor("gitListWorktrees", payload),
  );

  ipcMain.handle(CHANNELS.gitAddWorktree, async (_event, payload) =>
    callSupervisor("gitAddWorktree", payload),
  );

  ipcMain.handle(CHANNELS.gitRemoveWorktree, async (_event, payload) =>
    callSupervisor("gitRemoveWorktree", payload),
  );

  ipcMain.handle(CHANNELS.gitPruneWorktrees, async (_event, payload) =>
    callSupervisor("gitPruneWorktrees", payload),
  );

  ipcMain.handle(CHANNELS.gitDeleteBranch, async (_event, payload) =>
    callSupervisor("gitDeleteBranch", payload),
  );

  ipcMain.handle(CHANNELS.gitSwitchBranch, async (_event, payload) =>
    callSupervisor("gitSwitchBranch", payload),
  );

  ipcMain.handle(CHANNELS.gitPull, async (_event, payload) => callSupervisor("gitPull", payload));

  ipcMain.handle(CHANNELS.gitPush, async (_event, payload) => callSupervisor("gitPush", payload));

  ipcMain.handle(CHANNELS.gitSync, async (_event, payload) => callSupervisor("gitSync", payload));
  ipcMain.handle(CHANNELS.gitGetWorktreeSourceBranch, async (_event, payload) =>
    callSupervisor("gitGetWorktreeSourceBranch", payload),
  );
  ipcMain.handle(CHANNELS.gitMergeToSource, async (_event, payload) =>
    callSupervisor("gitMergeToSource", payload),
  );
  ipcMain.handle(CHANNELS.gitPullFromSource, async (_event, payload) =>
    callSupervisor("gitPullFromSource", payload),
  );
  ipcMain.handle(CHANNELS.gitAbortMerge, async (_event, payload) =>
    callSupervisor("gitAbortMerge", payload),
  );
  ipcMain.handle(CHANNELS.gitRunMergetool, async (_event, payload) =>
    callSupervisor("gitRunMergetool", payload),
  );
  ipcMain.handle(CHANNELS.gitFinishMerge, async (_event, payload) =>
    callSupervisor("gitFinishMerge", payload),
  );
  ipcMain.handle(CHANNELS.gitWatchProject, async (_event, payload) =>
    callSupervisor("gitWatchProject", payload),
  );
  ipcMain.handle(CHANNELS.gitWatchWorktrees, async (_event, payload) =>
    callSupervisor("gitWatchWorktrees", payload),
  );
  ipcMain.handle(CHANNELS.gitUnwatchProject, async (_event, payload) =>
    callSupervisor("gitUnwatchProject", payload),
  );
  ipcMain.handle(CHANNELS.searchProjectFiles, async (_event, payload) =>
    callSupervisor("searchProjectFiles", payload),
  );
  ipcMain.handle(CHANNELS.detectSetupScript, async (_event, payload) =>
    callSupervisor("detectSetupScript", payload),
  );

  // ── GitHub PR IPC handlers ──────────────────────────────────────
  ipcMain.handle(CHANNELS.ghCheckAvailable, async (_event, payload) =>
    callSupervisor("ghCheckAvailable", payload),
  );
  ipcMain.handle(CHANNELS.ghCreatePr, async (_event, payload) =>
    callSupervisor("ghCreatePr", payload),
  );
  ipcMain.handle(CHANNELS.ghGetPrForBranch, async (_event, payload) =>
    callSupervisor("ghGetPrForBranch", payload),
  );
  ipcMain.handle(CHANNELS.ghMergePr, async (_event, payload) =>
    callSupervisor("ghMergePr", payload),
  );
  ipcMain.handle(CHANNELS.ghClosePr, async (_event, payload) =>
    callSupervisor("ghClosePr", payload),
  );
  ipcMain.handle(CHANNELS.ghReopenPr, async (_event, payload) =>
    callSupervisor("ghReopenPr", payload),
  );
  ipcMain.handle(CHANNELS.ghGetPrChecks, async (_event, payload) =>
    callSupervisor("ghGetPrChecks", payload),
  );
  ipcMain.handle(CHANNELS.openExternal, async (_event, url: string) => {
    await shell.openExternal(url);
  });

  ipcMain.handle(CHANNELS.getSharedSettings, () =>
    readSharedSettingsFile(requireLightcodePaths().settingsPath),
  );

  ipcMain.handle(CHANNELS.setSharedSettings, (_event, settings: SharedSettings) => {
    writeSharedSettingsFile(requireLightcodePaths().settingsPath, settings);
    updatePowerSaveBlocker();
  });

  ipcMain.handle(CHANNELS.setWindowChrome, async (_event, payload: WindowChromePayload) => {
    if (!mainWindow) {
      return;
    }

    if (process.platform === "win32" || process.platform === "linux") {
      mainWindow.setTitleBarOverlay({
        color: payload.backgroundColor,
        symbolColor: payload.symbolColor,
        height: WINDOW_CHROME_HEIGHT,
      });
    }
    // macOS doesn't support titleBarOverlay, but we handle it via hidden titleBarStyle
  });

  // ── Database IPC handlers ───────────────────────────────────────
  ipcMain.handle(CHANNELS.dbGetProjects, () => dbGetProjects());
  ipcMain.handle(CHANNELS.dbGetThreads, () => dbGetThreads());
  ipcMain.handle(CHANNELS.dbGetState, (_event, key: string) => dbGetState(key));
  ipcMain.handle(CHANNELS.dbSetState, (_event, key: string, value: string) =>
    dbSetState(key, value),
  );
  ipcMain.handle(CHANNELS.dbUpsertProject, (_event, project, sortOrder: number = 0) =>
    dbUpsertProject(project, sortOrder),
  );
  ipcMain.handle(CHANNELS.dbUpsertThread, (_event, thread, sortOrder: number = 0) =>
    dbUpsertThread(thread, sortOrder),
  );
  ipcMain.handle(CHANNELS.dbDeleteThread, (_event, threadId: string) => {
    dbDeleteThread(threadId);
    // Clean up thread-linked attachments
    const paths = requireLightcodePaths();
    const threadAttachDir = join(paths.attachmentsDir, threadId.replace(/:/g, "-").slice(0, 12));
    rmSync(threadAttachDir, { recursive: true, force: true });
  });
  ipcMain.handle(CHANNELS.dbDeleteProject, (_event, projectId: string) =>
    dbDeleteProject(projectId),
  );
  ipcMain.handle(CHANNELS.dbSyncAll, (_event, projects, threads, viewJson: string) =>
    dbSyncAll(projects, threads, viewJson),
  );

  ipcMain.handle(CHANNELS.checkForUpdate, async () => {
    await autoUpdater.checkForUpdates();
  });

  ipcMain.handle(CHANNELS.startUpdateDownload, async () => {
    await autoUpdater.downloadUpdate();
  });

  ipcMain.handle(CHANNELS.installUpdate, () => {
    autoUpdater.quitAndInstall(false, true);
  });
}

// Register custom protocol for loading local attachment files in the renderer.
// Must be called before app "ready" event.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "lightcode-local",
    privileges: { standard: false, secure: true, supportFetchAPI: true, stream: true },
  },
]);

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) {
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    // Serve local files via lightcode-local:// protocol (used for attachment thumbnails).
    // Renderer encodes the absolute path as a URL path component, so we decode it
    // and convert to a proper file:// URL using pathToFileURL to handle Windows paths.
    protocol.handle("lightcode-local", (request) => {
      const raw = decodeURIComponent(new URL(request.url).pathname);
      // On Windows the pathname starts with /C:/... — pathToFileURL handles this correctly.
      const { pathToFileURL } = require("node:url") as typeof import("node:url");
      // Strip leading slash on Windows drive paths (e.g. /C:/... → C:/...)
      const filePath =
        process.platform === "win32" && /^\/[A-Za-z]:/.test(raw) ? raw.slice(1) : raw;
      return net.fetch(pathToFileURL(filePath).href);
    });

    lightcodePaths = prepareLightcodeDataRoot(isDev ? join(homedir(), ".lightcode-dev") : undefined);
    initDatabase(lightcodePaths.dbPath);
    registerIpcHandlers();
    startSupervisor(lightcodePaths.baseDir);
    mainWindow = createWindow();

    // Defer non-critical housekeeping to after window is visible.
    mainWindow.once("ready-to-show", () => {
      setTimeout(() => {
        const paths = requireLightcodePaths();
        cleanupOrphanedAttachments(
          paths.attachmentsDir,
          dbGetThreads().map((t) => t.id),
        );
      }, 0);
    });

    if (!isDev) {
      setupAutoUpdater();
    }

    if (isDev) {
      const supervisorPath = join(__dirname, "supervisor.cjs");
      let debounce: ReturnType<typeof setTimeout> | null = null;
      watch(supervisorPath, () => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          console.log("[lightcode] supervisor changed, restarting…");
          startSupervisor(requireLightcodePaths().baseDir);
        }, 200);
      });
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
      }
    });
  });
}

app.on("before-quit", () => {
  supervisor?.kill();
  closeDatabase();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
