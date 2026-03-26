import { randomUUID } from "node:crypto";
import { fork, type ChildProcess } from "node:child_process";
import { watch } from "node:fs";
import { join } from "node:path";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import type {
  SupervisorEvent,
  SupervisorReply,
  SupervisorRequest,
  WindowChromePayload,
} from "../shared/ipc";

const CHANNELS = {
  pickFolder: "lightcode:pick-folder",
  listWslDistros: "lightcode:list-wsl-distros",
  getAgentStatuses: "lightcode:get-agent-statuses",
  getThreadSnapshots: "lightcode:get-thread-snapshots",
  getThreadHistory: "lightcode:get-thread-history",
  startThread: "lightcode:start-thread",
  sendThreadInput: "lightcode:send-thread-input",
  writeTerminal: "lightcode:write-terminal",
  resizeTerminal: "lightcode:resize-terminal",
  resolveThreadServerRequest: "lightcode:resolve-thread-server-request",
  closeThread: "lightcode:close-thread",
  setWindowChrome: "lightcode:set-window-chrome",
  supervisorEvent: "lightcode:supervisor-event",
} as const;

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const hasSingleInstanceLock = app.requestSingleInstanceLock();
const WINDOW_CHROME_HEIGHT = 32;

let mainWindow: BrowserWindow | null = null;
let supervisor: ChildProcess | null = null;
const pendingRequests = new Map<
  string,
  {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
  }
>();

function createWindow(): BrowserWindow {
  const supportsTitleBarOverlay = process.platform === "win32" || process.platform === "linux";
  const window = new BrowserWindow({
    width: 1460,
    height: 920,
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
      : {}),
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL as string);
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }

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

function startSupervisor(): void {
  supervisor?.kill();

  for (const [id, pending] of pendingRequests) {
    pending.reject(new Error("Supervisor restarted."));
    pendingRequests.delete(id);
  }

  const child = fork(join(__dirname, "supervisor.cjs"), [], {
    stdio: ["inherit", "inherit", "inherit", "ipc"],
    env: {
      ...process.env,
      LIGHTCODE_DATA_DIR: app.getPath("userData"),
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

    mainWindow?.webContents.send(CHANNELS.supervisorEvent, message);
  });

  child.on("exit", () => {
    if (supervisor === child) {
      supervisor = null;
      for (const [id, pending] of pendingRequests) {
        pending.reject(new Error("Supervisor exited unexpectedly."));
        pendingRequests.delete(id);
      }
    }
  });
}

function callSupervisor<TRequest extends SupervisorRequest, TResult = unknown>(
  type: TRequest["type"],
  payload: TRequest["payload"],
): Promise<TResult> {
  if (!supervisor) {
    return Promise.reject(new Error("Supervisor is not running."));
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
    supervisor?.send(request);
  });
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

  ipcMain.handle(CHANNELS.listWslDistros, async () =>
    callSupervisor<SupervisorRequest, string[]>("listWslDistros", {}),
  );

  ipcMain.handle(CHANNELS.getAgentStatuses, async (_event, payload) =>
    callSupervisor("getAgentStatuses", payload ?? {}),
  );
  ipcMain.handle(CHANNELS.getThreadSnapshots, async () => callSupervisor("getThreadSnapshots", {}));

  ipcMain.handle(CHANNELS.getThreadHistory, async (_event, threadId: string) =>
    callSupervisor("getThreadHistory", { threadId }),
  );

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

  ipcMain.handle(CHANNELS.setWindowChrome, async (_event, payload: WindowChromePayload) => {
    if (!mainWindow || (process.platform !== "win32" && process.platform !== "linux")) {
      return;
    }

    mainWindow.setTitleBarOverlay({
      color: payload.backgroundColor,
      symbolColor: payload.symbolColor,
      height: WINDOW_CHROME_HEIGHT,
    });
  });
}

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
    registerIpcHandlers();
    startSupervisor();
    mainWindow = createWindow();

    if (isDev) {
      const supervisorPath = join(__dirname, "supervisor.cjs");
      let debounce: ReturnType<typeof setTimeout> | null = null;
      watch(supervisorPath, () => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          console.log("[lightcode] supervisor changed, restarting…");
          startSupervisor();
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
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
