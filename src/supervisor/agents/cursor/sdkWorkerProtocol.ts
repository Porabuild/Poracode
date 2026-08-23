import type {
  CursorSdkInteractionUpdate,
  CursorSdkMessage,
  CursorSdkRunResult,
} from "./sdkProtocol";

export const CURSOR_SDK_WORKER_PROTOCOL_VERSION = 1;

export interface CursorSdkWorkerModelParameter {
  id: string;
  value: string;
}

export interface CursorSdkWorkerModelSelection {
  id: string;
  params?: CursorSdkWorkerModelParameter[];
}

export interface CursorSdkWorkerModelParameterDefinition {
  id: string;
  displayName?: string;
  values: Array<{ value: string; displayName?: string }>;
}

export interface CursorSdkWorkerModelVariant {
  params: CursorSdkWorkerModelParameter[];
  displayName: string;
  description?: string;
  isDefault?: boolean;
}

export interface CursorSdkWorkerModel {
  id: string;
  displayName: string;
  description?: string;
  aliases?: string[];
  parameters?: CursorSdkWorkerModelParameterDefinition[];
  variants?: CursorSdkWorkerModelVariant[];
}

export interface CursorSdkWorkerProbeResult {
  models: CursorSdkWorkerModel[];
  sdkVersion: string;
  source:
    | "configured"
    | "project"
    | "node-path"
    | "global-explicit"
    | "global-inferred"
    | "global-npm"
    | "global-pnpm"
    | "explicit-entry";
  /** Account the probed API key belongs to, from `Cursor.me()`. */
  authenticatedAs?: string;
}

export type CursorSdkWorkerMcpServer =
  | {
      type?: "stdio";
      command: string;
      args?: string[];
      env?: Record<string, string>;
      cwd?: string;
    }
  | {
      type?: "http" | "sse";
      url: string;
      headers?: Record<string, string>;
      auth?: {
        CLIENT_ID: string;
        CLIENT_SECRET?: string;
        scopes?: string[];
      };
    };

export type CursorSdkWorkerSettingSource = "project" | "user" | "team" | "mdm" | "plugins" | "all";

export interface CursorSdkWorkerLocalOptions {
  cwd: string | string[];
  settingSources?: CursorSdkWorkerSettingSource[];
  sandboxOptions?: { enabled: boolean };
  autoReview?: boolean;
  enableAgentRetries?: boolean;
}

/**
 * Serializable subset of Cursor's public AgentOptions.
 *
 * `local.customTools` is deliberately absent because it contains executable
 * callbacks and cannot cross a process boundary. Poracode exposes external
 * tools through serializable MCP server definitions instead.
 */
export interface CursorSdkWorkerAgentOptions {
  model?: CursorSdkWorkerModelSelection;
  name?: string;
  local: CursorSdkWorkerLocalOptions;
  mcpServers?: Record<string, CursorSdkWorkerMcpServer>;
  mode?: "agent" | "plan";
  agentId?: string;
  idempotencyKey?: string;
}

export type CursorSdkWorkerImage =
  | {
      url: string;
      dimension?: { width: number; height: number };
    }
  | {
      data: string;
      mimeType: string;
      dimension?: { width: number; height: number };
    };

export interface CursorSdkWorkerUserMessage {
  text: string;
  images?: CursorSdkWorkerImage[];
}

export interface CursorSdkWorkerSendOptions {
  model?: CursorSdkWorkerModelSelection;
  mcpServers?: Record<string, CursorSdkWorkerMcpServer>;
  mode?: "agent" | "plan";
  local?: { force?: boolean };
  idempotencyKey?: string;
}

export interface CursorSdkWorkerInitializeInput {
  /**
   * Normally omitted so the SDK reads CURSOR_API_KEY inside the target
   * environment. Useful for callers that already hold a scoped key.
   */
  apiKey?: string;
  resumeAgentId?: string;
  createOptions: CursorSdkWorkerAgentOptions;
}

export interface CursorSdkWorkerInitializeResult {
  agentId: string;
  model?: CursorSdkWorkerModelSelection;
  /** Fresh create found the deterministic local agent and resumed it instead. */
  recoveredExisting?: boolean;
}

export interface CursorSdkWorkerStartInput {
  message: string | CursorSdkWorkerUserMessage;
  options?: CursorSdkWorkerSendOptions;
}

export interface CursorSdkWorkerStartResult {
  runId: string;
}

export interface CursorSdkWorkerAgentMessage {
  type: "user" | "assistant";
  uuid: string;
  agent_id: string;
  message: unknown;
}

export interface CursorSdkWorkerError {
  name: string;
  message: string;
  code?: string;
}

export type CursorSdkWorkerEvent =
  | {
      type: "delta";
      requestId: string;
      runId: string;
      update: CursorSdkInteractionUpdate;
    }
  | {
      type: "message";
      requestId: string;
      runId: string;
      message: CursorSdkMessage;
    }
  | {
      type: "result";
      requestId: string;
      runId: string;
      result: CursorSdkRunResult;
    }
  | {
      type: "run-error";
      requestId: string;
      runId: string;
      error: CursorSdkWorkerError;
    };

export interface CursorSdkWorkerDiscovery {
  configuredPath?: string;
  /**
   * Test/fast-path only. Normal callers let the worker discover the package
   * inside its own execution environment.
   */
  entryPath?: string;
  packageRoot?: string;
}

export interface CursorSdkWorkerInitializeParams extends CursorSdkWorkerInitializeInput {
  sdk: CursorSdkWorkerDiscovery;
}

export interface CursorSdkWorkerModelsListParams {
  apiKey?: string;
  sdk: CursorSdkWorkerDiscovery;
  projectCwd: string;
}

export type CursorSdkWorkerMethod =
  | "initialize"
  | "start"
  | "cancel"
  | "reload"
  | "messages.list"
  | "models.list"
  | "dispose";

export type CursorSdkWorkerRequest =
  | CursorSdkWorkerRequestFor<"initialize", CursorSdkWorkerInitializeParams>
  | CursorSdkWorkerRequestFor<"start", CursorSdkWorkerStartInput>
  | CursorSdkWorkerRequestFor<"cancel", { runId?: string }>
  | CursorSdkWorkerRequestFor<"reload", Record<string, never>>
  | CursorSdkWorkerRequestFor<"messages.list", { limit?: number; offset?: number }>
  | CursorSdkWorkerRequestFor<"models.list", CursorSdkWorkerModelsListParams>
  | CursorSdkWorkerRequestFor<"dispose", Record<string, never>>;

interface CursorSdkWorkerRequestFor<Method extends CursorSdkWorkerMethod, Params> {
  type: "request";
  id: string;
  method: Method;
  params: Params;
}

export type CursorSdkWorkerWireMessage =
  | {
      type: "ready";
      protocolVersion: typeof CURSOR_SDK_WORKER_PROTOCOL_VERSION;
    }
  | {
      type: "response";
      id: string;
      ok: true;
      result: unknown;
    }
  | {
      type: "response";
      id: string;
      ok: false;
      error: CursorSdkWorkerError;
    }
  | {
      type: "event";
      event: CursorSdkWorkerEvent;
    };
