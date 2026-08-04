import { isAbsolute, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { loadCursorSdk, type CursorSdkModule } from "./sdkLoader";
import { asWorkerRecord, WorkerDiagnosticError } from "./sdkWorkerDiagnostics";
import type {
  CursorSdkWorkerAgentMessage,
  CursorSdkWorkerAgentOptions,
  CursorSdkWorkerDiscovery,
  CursorSdkWorkerModel,
  CursorSdkWorkerModelSelection,
  CursorSdkWorkerProbeResult,
  CursorSdkWorkerSendOptions,
  CursorSdkWorkerUserMessage,
} from "./sdkWorkerProtocol";

const AGENT_ASYNC_DISPOSE_TIMEOUT_MS = 5_000;

export interface RuntimeAgent {
  readonly agentId: string;
  readonly model?: CursorSdkWorkerModelSelection;
  send(
    message: string | CursorSdkWorkerUserMessage,
    options?: CursorSdkWorkerSendOptions & {
      onDelta?: (args: { update: unknown }) => void | Promise<void>;
    },
  ): Promise<RuntimeRun>;
  close(): void;
  [Symbol.asyncDispose]?(): Promise<void>;
  reload(): Promise<void>;
}

export interface RuntimeRun {
  readonly id: string;
  stream(): AsyncGenerator<unknown, void>;
  wait(): Promise<unknown>;
  cancel(): Promise<void>;
}

interface RuntimeAgentApi {
  create(options: CursorSdkWorkerAgentOptions & { apiKey?: string }): Promise<RuntimeAgent>;
  resume(
    agentId: string,
    options?: Partial<CursorSdkWorkerAgentOptions> & { apiKey?: string },
  ): Promise<RuntimeAgent>;
  messages: {
    list(
      agentId: string,
      options?: { limit?: number; offset?: number; runtime?: "local"; cwd?: string },
    ): Promise<CursorSdkWorkerAgentMessage[]>;
  };
  archive(agentId: string, options?: { cwd?: string; apiKey?: string }): Promise<void>;
  unarchive(agentId: string, options?: { cwd?: string; apiKey?: string }): Promise<void>;
  delete(agentId: string, options?: { cwd?: string; apiKey?: string }): Promise<void>;
}

interface RuntimeCursorApi {
  models: {
    list(options?: { apiKey?: string }): Promise<CursorSdkWorkerModel[]>;
  };
}

export interface RuntimeSdkModule extends CursorSdkModule {
  Agent: RuntimeAgentApi & CursorSdkModule["Agent"];
  Cursor: RuntimeCursorApi & CursorSdkModule["Cursor"];
}

/**
 * Owns external package selection for one worker process. A worker may load
 * exactly one SDK installation so native helpers and module singletons cannot
 * accidentally cross package roots.
 */
export class CursorSdkWorkerRuntime {
  private loadedSdk: RuntimeSdkModule | undefined;
  private discoveryKey: string | undefined;
  private sdkMetadata: Pick<CursorSdkWorkerProbeResult, "sdkVersion" | "source"> | undefined;

  get module(): RuntimeSdkModule | undefined {
    return this.loadedSdk;
  }

  get metadata(): Pick<CursorSdkWorkerProbeResult, "sdkVersion" | "source"> {
    return this.sdkMetadata ?? { sdkVersion: "unknown", source: "explicit-entry" };
  }

  async load(
    discovery: CursorSdkWorkerDiscovery,
    projectCwd: string,
    apiKey?: string,
  ): Promise<RuntimeSdkModule> {
    const key = JSON.stringify(discovery);
    if (this.loadedSdk) {
      if (this.discoveryKey !== key) {
        throw new WorkerDiagnosticError(
          "sdk_already_loaded",
          "The Cursor SDK worker cannot switch package installations after loading.",
        );
      }
      return this.loadedSdk;
    }

    let imported: unknown;
    if (discovery.entryPath) {
      validateExplicitEntry(discovery);
      anchorProcessArgvAtSdk(discovery.entryPath);
      imported = await import(pathToFileURL(discovery.entryPath).href);
    } else {
      const result = await loadCursorSdk({
        ...(discovery.configuredPath ? { configuredPath: discovery.configuredPath } : {}),
        projectCwd,
        ...(apiKey ? { apiKey } : {}),
        env: process.env,
        environment: { kind: "native" },
      });
      if (!result.ok) {
        throw new WorkerDiagnosticError(result.diagnostic.code, result.diagnostic.message);
      }
      anchorProcessArgvAtSdk(result.value.entryPath);
      imported = result.value.module;
      this.sdkMetadata = {
        sdkVersion: result.value.version,
        source: result.value.source,
      };
    }

    const validated = validateRuntimeModule(imported);
    if (!validated) {
      throw new WorkerDiagnosticError(
        "module_api_incompatible",
        "The installed package does not expose the expected public Cursor SDK API.",
      );
    }
    this.discoveryKey = key;
    this.sdkMetadata ??= { sdkVersion: "unknown", source: "explicit-entry" };
    this.loadedSdk = validated;
    return validated;
  }
}

export async function openCursorSdkAgent(
  loaded: RuntimeSdkModule,
  options: CursorSdkWorkerAgentOptions & { apiKey?: string },
  resumeAgentId?: string,
): Promise<{ agent: RuntimeAgent; recoveredExisting: boolean }> {
  if (resumeAgentId) {
    return {
      agent: await loaded.Agent.resume(resumeAgentId, options),
      recoveredExisting: false,
    };
  }

  try {
    return {
      agent: await loaded.Agent.create(options),
      recoveredExisting: false,
    };
  } catch (error) {
    const deterministicAgentId = options.agentId;
    if (!deterministicAgentId || !isLocalAgentAlreadyExistsError(error, deterministicAgentId)) {
      throw error;
    }
    const resumeOptions: Partial<CursorSdkWorkerAgentOptions> & { apiKey?: string } = {
      ...options,
    };
    delete resumeOptions.agentId;
    return {
      agent: await loaded.Agent.resume(deterministicAgentId, resumeOptions),
      recoveredExisting: true,
    };
  }
}

export async function disposeCursorSdkAgent(currentAgent: RuntimeAgent): Promise<void> {
  const asyncDispose = currentAgent[Symbol.asyncDispose];
  if (typeof asyncDispose === "function") {
    try {
      const settled = await settlesWithin(
        Promise.resolve(asyncDispose.call(currentAgent)),
        AGENT_ASYNC_DISPOSE_TIMEOUT_MS,
      );
      if (settled) return;
    } catch {
      // Fall through to the synchronous close fallback.
    }
  }

  try {
    currentAgent.close();
  } catch {
    // Disposal remains idempotent and best effort.
  }
}

function isLocalAgentAlreadyExistsError(error: unknown, agentId: string): boolean {
  const record = asWorkerRecord(error);
  const message =
    error instanceof Error
      ? error.message
      : typeof record?.message === "string"
        ? record.message
        : "";
  if (message === `Agent ${agentId} already exists`) return true;

  const code =
    typeof record?.code === "string"
      ? record.code.trim().toUpperCase().replaceAll(/[- ]/g, "_")
      : "";
  return (
    (code === "ALREADY_EXISTS" || code === "AGENT_ALREADY_EXISTS") &&
    /\bagent\b/i.test(message) &&
    message.includes(agentId)
  );
}

/**
 * Cursor SDK 1.x locates its sibling platform package by walking ancestors of
 * `process.argv[1]`. The worker helper lives in Poracode (and in a staged WSL
 * temp directory), so leave argv anchored at the verified external SDK entry
 * before invoking any SDK API. This changes only process-local discovery; it
 * neither executes nor copies the user-installed package.
 */
function anchorProcessArgvAtSdk(entryPath: string): void {
  process.argv[1] = entryPath;
}

async function settlesWithin(promise: Promise<unknown>, timeoutMs: number): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.then(
        () => true,
        () => false,
      ),
      new Promise<boolean>((resolvePromise) => {
        timeout = setTimeout(() => resolvePromise(false), timeoutMs);
        timeout.unref?.();
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function validateExplicitEntry(discovery: CursorSdkWorkerDiscovery): void {
  const entryPath = discovery.entryPath!;
  if (!isAbsolute(entryPath)) {
    throw new WorkerDiagnosticError(
      "configured_path_invalid",
      "The explicit Cursor SDK entry path must be absolute.",
    );
  }
  if (!discovery.packageRoot) return;
  if (!isAbsolute(discovery.packageRoot)) {
    throw new WorkerDiagnosticError(
      "configured_path_invalid",
      "The explicit Cursor SDK package root must be absolute.",
    );
  }
  const fromRoot = relative(discovery.packageRoot, entryPath);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new WorkerDiagnosticError(
      "configured_path_invalid",
      "The explicit Cursor SDK entry path is outside its package root.",
    );
  }
}

function validateRuntimeModule(imported: unknown): RuntimeSdkModule | undefined {
  const direct = asWorkerRecord(imported);
  const fallback = asWorkerRecord(direct?.default);
  for (const candidate of [direct, fallback]) {
    const agentValue = asWorkerRecord(candidate?.Agent);
    const cursorValue = asWorkerRecord(candidate?.Cursor);
    const models = asWorkerRecord(cursorValue?.models);
    const messages = asWorkerRecord(agentValue?.messages);
    if (
      typeof agentValue?.create === "function" &&
      typeof agentValue.resume === "function" &&
      typeof messages?.list === "function" &&
      typeof models?.list === "function"
    ) {
      return candidate as unknown as RuntimeSdkModule;
    }
  }
  return undefined;
}
