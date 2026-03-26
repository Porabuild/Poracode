import { contextBridge, ipcRenderer } from "electron";
import type { LightcodeBridge, SupervisorEvent, UpdateStatus } from "../shared/ipc";

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
  startShell: "lightcode:start-shell",
  setWindowChrome: "lightcode:set-window-chrome",
  supervisorEvent: "lightcode:supervisor-event",
  updateStatus: "lightcode:update-status",
  checkForUpdate: "lightcode:check-for-update",
  startUpdateDownload: "lightcode:start-update-download",
  installUpdate: "lightcode:install-update",
} as const;

const bridge: LightcodeBridge = {
  pickFolder: (defaultPath?) => ipcRenderer.invoke(CHANNELS.pickFolder, defaultPath),
  listWslDistros: () => ipcRenderer.invoke(CHANNELS.listWslDistros),
  getAgentStatuses: (payload) => ipcRenderer.invoke(CHANNELS.getAgentStatuses, payload),
  getThreadSnapshots: () => ipcRenderer.invoke(CHANNELS.getThreadSnapshots),
  getThreadHistory: (threadId) => ipcRenderer.invoke(CHANNELS.getThreadHistory, threadId),
  startThread: (payload) => ipcRenderer.invoke(CHANNELS.startThread, payload),
  sendThreadInput: (payload) => ipcRenderer.invoke(CHANNELS.sendThreadInput, payload),
  writeTerminal: (payload) => ipcRenderer.invoke(CHANNELS.writeTerminal, payload),
  resizeTerminal: (payload) => ipcRenderer.invoke(CHANNELS.resizeTerminal, payload),
  resolveThreadServerRequest: (payload) =>
    ipcRenderer.invoke(CHANNELS.resolveThreadServerRequest, payload),
  closeThread: (payload) => ipcRenderer.invoke(CHANNELS.closeThread, payload),
  startShell: (payload) => ipcRenderer.invoke(CHANNELS.startShell, payload),
  setWindowChrome: (payload) => ipcRenderer.invoke(CHANNELS.setWindowChrome, payload),
  onSupervisorEvent(listener) {
    const handler = (_event: Electron.IpcRendererEvent, payload: SupervisorEvent) => {
      listener(payload);
    };
    ipcRenderer.on(CHANNELS.supervisorEvent, handler);
    return () => {
      ipcRenderer.removeListener(CHANNELS.supervisorEvent, handler);
    };
  },
  checkForUpdate: () => ipcRenderer.invoke(CHANNELS.checkForUpdate),
  startUpdateDownload: () => ipcRenderer.invoke(CHANNELS.startUpdateDownload),
  installUpdate: () => ipcRenderer.invoke(CHANNELS.installUpdate),
  onUpdateStatus(listener) {
    const handler = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => {
      listener(status);
    };
    ipcRenderer.on(CHANNELS.updateStatus, handler);
    return () => {
      ipcRenderer.removeListener(CHANNELS.updateStatus, handler);
    };
  },
};

contextBridge.exposeInMainWorld("lightcode", bridge);
