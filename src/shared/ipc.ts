import type {
  AgentStatus,
  CloseThreadPayload,
  ProjectLocation,
  ResizeTerminalPayload,
  ResolveThreadServerRequestPayload,
  SendThreadInputPayload,
  SessionRef,
  StartThreadPayload,
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
  | { id: string; type: "getAgentStatuses"; payload: Record<string, never> }
  | { id: string; type: "getThreadSnapshots"; payload: Record<string, never> }
  | { id: string; type: "startThread"; payload: StartThreadPayload }
  | { id: string; type: "sendThreadInput"; payload: SendThreadInputPayload }
  | { id: string; type: "writeTerminal"; payload: WriteTerminalPayload }
  | { id: string; type: "resizeTerminal"; payload: ResizeTerminalPayload }
  | { id: string; type: "getThreadHistory"; payload: { threadId: string } }
  | { id: string; type: "resolveThreadServerRequest"; payload: ResolveThreadServerRequestPayload }
  | { id: string; type: "closeThread"; payload: CloseThreadPayload };

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
    }
  | { type: "thread-exited"; threadId: string; exitCode: number | null };

export interface WindowChromePayload {
  backgroundColor: string;
  symbolColor: string;
}

export interface LightcodeBridge {
  pickFolder(): Promise<string | null>;
  listWslDistros(): Promise<string[]>;
  getAgentStatuses(): Promise<AgentStatus[]>;
  getThreadSnapshots(): Promise<ThreadRuntimeSnapshot[]>;
  getThreadHistory(threadId: string): Promise<ThreadHistorySnapshot>;
  startThread(payload: StartThreadPayload): Promise<StartThreadResult>;
  sendThreadInput(payload: SendThreadInputPayload): Promise<void>;
  writeTerminal(payload: WriteTerminalPayload): Promise<void>;
  resizeTerminal(payload: ResizeTerminalPayload): Promise<void>;
  resolveThreadServerRequest(payload: ResolveThreadServerRequestPayload): Promise<void>;
  closeThread(payload: CloseThreadPayload): Promise<void>;
  setWindowChrome(payload: WindowChromePayload): Promise<void>;
  onSupervisorEvent(listener: (event: SupervisorEvent) => void): () => void;
}

export interface AddProjectDraft {
  location: ProjectLocation;
  nameOverride?: string;
}
