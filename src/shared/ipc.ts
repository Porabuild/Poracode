import type {
  AgentStatus,
  CloseThreadPayload,
  GetAgentStatusesPayload,
  ProjectLocation,
  ResizeTerminalPayload,
  ResolveThreadServerRequestPayload,
  SendThreadInputPayload,
  SessionRef,
  StartShellPayload,
  StartThreadPayload,
  TerminalPrompt,
  StartThreadResult,
  ThreadServerRequestId,
  ThreadAttention,
  ThreadConfig,
  ThreadHistorySnapshot,
  ThreadRuntimeSnapshot,
  ThreadStatus,
  WriteTerminalPayload,
} from "./contracts";

export type SupervisorRequest =
  | { id: string; type: "listWslDistros"; payload: Record<string, never> }
  | { id: string; type: "getAgentStatuses"; payload: GetAgentStatusesPayload }
  | { id: string; type: "getThreadSnapshots"; payload: Record<string, never> }
  | { id: string; type: "startThread"; payload: StartThreadPayload }
  | { id: string; type: "sendThreadInput"; payload: SendThreadInputPayload }
  | { id: string; type: "writeTerminal"; payload: WriteTerminalPayload }
  | { id: string; type: "resizeTerminal"; payload: ResizeTerminalPayload }
  | { id: string; type: "getThreadHistory"; payload: { threadId: string } }
  | { id: string; type: "resolveThreadServerRequest"; payload: ResolveThreadServerRequestPayload }
  | { id: string; type: "closeThread"; payload: CloseThreadPayload }
  | { id: string; type: "startShell"; payload: StartShellPayload };

export type SupervisorReply =
  | { replyTo: string; ok: true; data: unknown }
  | { replyTo: string; ok: false; error: string };

export type SupervisorEvent =
  | { type: "thread-reset"; threadId: string }
  | { type: "thread-output"; threadId: string; data: string; outputLength: number }
  | {
      type: "thread-server-request";
      threadId: string;
      requestId: ThreadServerRequestId;
      method: string;
      params: unknown;
    }
  | {
      type: "thread-state";
      threadId: string;
      status: ThreadStatus;
      attention: ThreadAttention;
      config?: ThreadConfig;
      sessionRef?: SessionRef;
      canResumeWithConfig: boolean;
      errorMessage?: string;
      terminalPrompt?: TerminalPrompt;
    }
  | { type: "thread-exited"; threadId: string; exitCode: number | null };

export type UpdateStatus =
  | { type: "checking" }
  | { type: "update-available"; version: string }
  | { type: "update-not-available" }
  | {
      type: "downloading";
      percent: number;
      bytesPerSecond: number;
      transferred: number;
      total: number;
    }
  | { type: "downloaded"; version: string }
  | { type: "error"; message: string };

export interface WindowChromePayload {
  backgroundColor: string;
  symbolColor: string;
}

export interface LightcodeBridge {
  pickFolder(defaultPath?: string): Promise<string | null>;
  listWslDistros(): Promise<string[]>;
  getAgentStatuses(payload: GetAgentStatusesPayload): Promise<AgentStatus[]>;
  getThreadSnapshots(): Promise<ThreadRuntimeSnapshot[]>;
  getThreadHistory(threadId: string): Promise<ThreadHistorySnapshot>;
  startThread(payload: StartThreadPayload): Promise<StartThreadResult>;
  sendThreadInput(payload: SendThreadInputPayload): Promise<void>;
  writeTerminal(payload: WriteTerminalPayload): Promise<void>;
  resizeTerminal(payload: ResizeTerminalPayload): Promise<void>;
  resolveThreadServerRequest(payload: ResolveThreadServerRequestPayload): Promise<void>;
  closeThread(payload: CloseThreadPayload): Promise<void>;
  startShell(payload: StartShellPayload): Promise<void>;
  setWindowChrome(payload: WindowChromePayload): Promise<void>;
  onSupervisorEvent(listener: (event: SupervisorEvent) => void): () => void;
  checkForUpdate(): Promise<void>;
  startUpdateDownload(): Promise<void>;
  installUpdate(): Promise<void>;
  onUpdateStatus(listener: (status: UpdateStatus) => void): () => void;
}

export interface AddProjectDraft {
  location: ProjectLocation;
  nameOverride?: string;
}
