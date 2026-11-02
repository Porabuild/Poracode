import { isAbsolute, dirname, join, relative, resolve, sep, toNamespacedPath } from "node:path";
import { readFile, realpath } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  cursorSdkVersionIncompatibleMessage,
  CURSOR_SDK_PACKAGE_NAME,
} from "@/shared/agents/cursorSdkPackage";
import { loadCursorSdk, type CursorSdkModule } from "./sdkLoader";
import { isSupportedCursorSdkVersion } from "./sdkLoaderSupport";
import { CursorSdkMaxModeQualification } from "./sdkMaxMode";
import { cursorSdkParamFamily } from "./sdkModels";
import { asWorkerRecord, WorkerDiagnosticError } from "./sdkWorkerDiagnostics";
import type {
  CursorSdkWorkerAgentMessage,
  CursorSdkWorkerAgentOptions,
  CursorSdkWorkerDiscovery,
  CursorSdkWorkerModel,
  CursorSdkWorkerModelSelection,
  CursorSdkWorkerProbeResult,
  CursorSdkWorkerSendOptions,
  CursorSdkWorkerSteerResult,
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
  /** `@cursor/sdk` 1.2.0+: summarize the saved conversation as its own run. */
  summarize?(): Promise<RuntimeRun>;
  close(): void;
  [Symbol.asyncDispose]?(): Promise<void>;
  reload(): Promise<void>;
}

export interface RuntimeRun {
  readonly id: string;
  stream(): AsyncGenerator<unknown, void>;
  wait(): Promise<unknown>;
  cancel(): Promise<void>;
  steer?(text: string): Promise<CursorSdkWorkerSteerResult>;
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
  getDefaultSdkStateRoot?: (workspaceRef: string) => string;
  configureCursorSdk?: (options: { local: { store: unknown } }) => void;
}

/**
 * Owns external package selection for one worker process. A worker may load
 * exactly one SDK installation so native helpers and module singletons cannot
 * accidentally cross package roots.
 */
export class CursorSdkWorkerRuntime {
  private readonly maxMode = new CursorSdkMaxModeQualification();
  private loadedSdk: RuntimeSdkModule | undefined;
  private entrySpecifier: string | undefined;
  private localStore: { dispose(): Promise<void> } | undefined;
  private localStoreCwd: string | undefined;
  private discoveryKey: string | undefined;
  private sdkMetadata:
    | Pick<CursorSdkWorkerProbeResult, "sdkVersion" | "source" | "packageRoot">
    | undefined;

  get module(): RuntimeSdkModule | undefined {
    return this.loadedSdk;
  }

  get metadata(): Pick<CursorSdkWorkerProbeResult, "sdkVersion" | "source" | "packageRoot"> {
    return this.sdkMetadata ?? { sdkVersion: "unknown", source: "explicit-entry" };
  }

  setModelCatalog(models: readonly CursorSdkWorkerModel[]): void {
    this.maxMode.setCatalog(models);
  }

  /**
   * Qualify Max Mode onto the selection's public `maxMode` field, the only
   * mechanism the supported SDKs accept it through. A send must carry the
   * qualified selection explicitly, including when it falls back to the
   * agent's model after a resume without a catalog.
   */
  qualifyModelSelection(selection: CursorSdkWorkerModelSelection): CursorSdkWorkerModelSelection {
    return this.maxMode.withNativeMaxMode(selection);
  }

  async prepareModelSelection(
    model: CursorSdkWorkerModelSelection | undefined,
    apiKey?: string,
  ): Promise<void> {
    if (
      this.maxMode.hasCatalog ||
      !model?.params?.some(({ id }) => cursorSdkParamFamily(id) === "context")
    )
      return;
    const loaded = this.loadedSdk;
    if (!loaded) throw new Error("The Cursor SDK has not been loaded.");
    this.setModelCatalog(await loaded.Cursor.models.list(apiKey ? { apiKey } : undefined));
  }

  private async importModule(specifier: string): Promise<unknown> {
    // Node resolves symlinks before invoking the import (including macOS /var
    // and package-manager links); keep the URL canonical so a cached module
    // and its native helpers resolve from one package root.
    const canonicalSpecifier = pathToFileURL(await realpath(fileURLToPath(specifier))).href;
    this.entrySpecifier = canonicalSpecifier;
    return import(canonicalSpecifier);
  }

  async prepareLocalStore(cwd: string): Promise<void> {
    const loaded = this.loadedSdk;
    if (
      process.platform !== "win32" ||
      !this.entrySpecifier ||
      !loaded?.getDefaultSdkStateRoot ||
      !loaded.configureCursorSdk
    )
      return;
    if (this.localStore) {
      if (this.localStoreCwd === cwd) return;
      await this.disposeLocalStore();
    }

    // SQLite does not add Windows' long-path prefix itself. The SDK's two
    // SHA-256 directory names can push checkpoint store.db beyond MAX_PATH.
    // Keep the SDK's existing root and layout so old sessions still resume.
    let sqlite: {
      SqliteLocalAgentStore?: {
        open?: (options: { workspaceRef: string; stateRoot: string }) => Promise<{
          dispose(): Promise<void>;
        }>;
      };
    };
    try {
      sqlite = (await import(new URL("./sqlite.js", this.entrySpecifier).href)) as typeof sqlite;
    } catch (error) {
      if ((error as { code?: string })?.code === "ERR_MODULE_NOT_FOUND") return;
      throw error;
    }
    if (typeof sqlite?.SqliteLocalAgentStore?.open !== "function") return;
    const store = await sqlite.SqliteLocalAgentStore.open({
      workspaceRef: cwd,
      stateRoot: toNamespacedPath(loaded.getDefaultSdkStateRoot(cwd)),
    });
    try {
      loaded.configureCursorSdk({ local: { store } });
    } catch (error) {
      await store.dispose();
      throw error;
    }
    this.localStore = store;
    this.localStoreCwd = cwd;
  }

  async disposeLocalStore(): Promise<void> {
    const store = this.localStore;
    this.localStore = undefined;
    this.localStoreCwd = undefined;
    if (store) {
      this.loadedSdk!.configureCursorSdk!({ local: { store: null } });
      await store.dispose();
    }
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
      rejectUnsupportedExplicitEntry(await readExplicitEntrySdkVersion(discovery));
      anchorProcessArgvAtSdk(discovery.entryPath);
      imported = await this.importModule(pathToFileURL(discovery.entryPath).href);
    } else {
      const result = await loadCursorSdk(
        {
          ...(discovery.configuredPath ? { configuredPath: discovery.configuredPath } : {}),
          ...(discovery.pinnedRoot ? { pinnedRoot: discovery.pinnedRoot } : {}),
          projectCwd,
          ...(apiKey ? { apiKey } : {}),
          env: process.env,
          environment: { kind: "native" },
        },
        { importModule: (specifier) => this.importModule(specifier) },
      );
      if (!result.ok) {
        throw new WorkerDiagnosticError(result.diagnostic.code, result.diagnostic.message);
      }
      anchorProcessArgvAtSdk(result.value.entryPath);
      imported = result.value.module;
      this.sdkMetadata = {
        sdkVersion: result.value.version,
        source: result.value.source,
        packageRoot: result.value.packageRoot,
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

/**
 * An explicit entry skips package discovery and its supported-version check,
 * so the version is read from the installation's own manifest, starting at
 * the configured package root or the entry's directory. An unreadable or
 * unidentifiable manifest returns undefined: the entry then stays loadable,
 * because the module API is still validated and such installations are
 * theoretical for `@cursor/sdk`.
 */
async function readExplicitEntrySdkVersion(
  discovery: CursorSdkWorkerDiscovery,
): Promise<string | undefined> {
  let current = resolve(discovery.packageRoot ?? dirname(discovery.entryPath!));
  while (true) {
    let manifest: unknown;
    try {
      manifest = JSON.parse(await readFile(join(current, "package.json"), "utf8"));
    } catch {
      manifest = undefined;
    }
    const record = asWorkerRecord(manifest);
    if (record?.name === CURSOR_SDK_PACKAGE_NAME && typeof record.version === "string") {
      return record.version;
    }
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

/**
 * Max Mode qualification relies on the public `ModelSelection.maxMode` field,
 * which releases below the supported minimum silently ignore. An explicitly
 * configured old installation therefore fails the load with the same
 * recoverable diagnostic as a discovered one instead of degrading quietly.
 */
function rejectUnsupportedExplicitEntry(version: string | undefined): void {
  if (version === undefined || isSupportedCursorSdkVersion(version)) return;
  throw new WorkerDiagnosticError(
    "version_incompatible",
    cursorSdkVersionIncompatibleMessage(version),
  );
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
