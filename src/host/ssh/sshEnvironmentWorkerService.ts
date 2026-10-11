import type { SshConnectPayload } from "@/shared/ssh";
import { ensureSshRuntimeBundleAsync } from "./runtimeBundleAsync";
import { sshOperationAbortError } from "./sshEnvironmentController";
import { SshConnectionManager } from "./SshConnectionManager";
import {
  isSshEnvironmentParentMessage,
  serializeSshEnvironmentError,
  SSH_ENVIRONMENT_PROTOCOL_VERSION,
  type SshEnvironmentPreparedRuntime,
  type SshEnvironmentRequestEnvelope,
  type SshEnvironmentWorkerConfig,
} from "./sshEnvironmentProtocol";

/** Transport the host process adapts (Electron `parentPort` or an IPC channel). */
export interface SshEnvironmentWorkerPort {
  postMessage(message: unknown): void;
  onMessage(listener: (message: unknown) => void): void;
}

export interface SshEnvironmentWorkerLocalStats {
  readonly activeOperations: number;
  readonly refusedRequests: number;
  readonly closing: boolean;
}

export interface SshEnvironmentWorkerService {
  handleMessage(message: unknown): void;
  /** Resolves when the parent requested shutdown (the host exits afterwards). */
  readonly shutdownRequested: Promise<void>;
  /** Joins every admitted request and the manager. */
  dispose(): Promise<void>;
  /** Payload-free lifecycle counters for diagnostics. */
  localStats(): SshEnvironmentWorkerLocalStats;
}

/**
 * Electron-free worker core for the device-local SSH utility (C3/A5).
 *
 * The worker owns the `SshConnectionManager` — discovery, runtime archive
 * staging, probe/install/launch, uploads and tunnels — and never touches
 * Electron APIs, so the same service is drivable from a utility process, a
 * plain IPC child, or a test fixture.
 *
 * Lifecycle custody rules (C3 correction):
 * - every admitted request is tracked by its completion promise, including
 *   `prepare-runtime` and `discover-hosts`, which the manager does not own;
 * - `dispose` aborts, then joins every admitted operation *and* the manager, so
 *   the host's `process.exit` can never orphan a tar spawn or staging work;
 * - a request admitted after close is refused, never started;
 * - a failed `postMessage` during intentional channel close is swallowed, so
 *   no settlement path can escape as an unhandled rejection.
 */
export function createSshEnvironmentWorkerService(
  config: SshEnvironmentWorkerConfig,
  port: SshEnvironmentWorkerPort,
): SshEnvironmentWorkerService {
  const manager = new SshConnectionManager({
    mainBundleDir: config.mainBundleDir,
    agentPluginsDir: config.agentPluginsDir,
    wslHelpersDir: config.wslHelpersDir,
    ...(config.bundledSkillsDir ? { bundledSkillsDir: config.bundledSkillsDir } : {}),
    ...(config.bundledPluginsDir ? { bundledPluginsDir: config.bundledPluginsDir } : {}),
    cacheDir: config.cacheDir,
    ...(config.sshCommand ? { sshCommand: config.sshCommand } : {}),
    ...(config.scpCommand ? { scpCommand: config.scpCommand } : {}),
    ...(config.sshConfigFile ? { sshConfigFile: config.sshConfigFile } : {}),
    ...(config.preassembledArchiveDir
      ? { preassembledArchiveDir: config.preassembledArchiveDir }
      : {}),
  });

  interface AdmittedOperation {
    readonly requestId: string;
    readonly generation: number;
    readonly controller: AbortController;
    /** Settles when the work (and its own child joins) is complete. */
    readonly completion: Promise<void>;
  }

  const operations = new Map<string, AdmittedOperation>();
  let closing = false;
  let refusedRequests = 0;
  let resolveShutdown: () => void = () => undefined;
  const shutdownRequested = new Promise<void>((resolve) => {
    resolveShutdown = resolve;
  });
  let disposeStarted: Promise<void> | null = null;

  function safePost(message: unknown): void {
    try {
      port.postMessage(message);
    } catch {
      // The channel may already be closed during an intentional shutdown; a
      // failed post is not a request failure and must not reject a caller.
    }
  }

  function postResult(
    generation: number,
    requestId: string,
    outcome: { ok: true; result: unknown } | { ok: false; error: unknown },
  ): void {
    safePost({
      v: SSH_ENVIRONMENT_PROTOCOL_VERSION,
      kind: "result",
      generation,
      requestId,
      ...outcome,
    });
  }

  function refuse(generation: number, requestId: string, error: unknown): void {
    refusedRequests += 1;
    postResult(generation, requestId, { ok: false, error: serializeSshEnvironmentError(error) });
  }

  function admit(
    generation: number,
    requestId: string,
    work: (signal: AbortSignal) => Promise<unknown>,
  ): void {
    if (closing) {
      refuse(generation, requestId, sshOperationAbortError("The SSH utility is shutting down."));
      return;
    }
    if (operations.has(requestId)) {
      refuse(generation, requestId, new Error("Duplicate SSH utility request id."));
      return;
    }
    const controller = new AbortController();
    const completion = (async () => {
      try {
        const result = await work(controller.signal);
        postResult(generation, requestId, { ok: true, result });
      } catch (error) {
        postResult(generation, requestId, {
          ok: false,
          error: serializeSshEnvironmentError(error),
        });
      }
    })();
    const record: AdmittedOperation = { requestId, generation, controller, completion };
    operations.set(requestId, record);
    // Tracking is released only after the operation settles, so an abort can
    // reject the caller promptly while dispose still joins the real completion.
    void completion.finally(() => {
      if (operations.get(requestId) === record) operations.delete(requestId);
    });
  }

  function handleRequest(envelope: SshEnvironmentRequestEnvelope): void {
    const { generation, requestId, request } = envelope;
    switch (request.kind) {
      case "cancel": {
        const record = operations.get(request.requestId);
        // Identity: only the generation that admitted the request may cancel it.
        if (record && record.generation === generation) {
          record.controller.abort(sshOperationAbortError("The SSH utility request was cancelled."));
        }
        return;
      }
      case "shutdown": {
        closing = true;
        resolveShutdown();
        return;
      }
      default:
        break;
    }
    if (closing) {
      refuse(generation, requestId, sshOperationAbortError("The SSH utility is shutting down."));
      return;
    }
    switch (request.kind) {
      case "discover-hosts": {
        admit(generation, requestId, async () => manager.discoverHosts());
        return;
      }
      case "prepare-runtime": {
        admit(generation, requestId, async (signal) => {
          const bundle = await ensureSshRuntimeBundleAsync({
            mainBundleDir: config.mainBundleDir,
            agentPluginsDir: config.agentPluginsDir,
            wslHelpersDir: config.wslHelpersDir,
            ...(config.bundledSkillsDir ? { bundledSkillsDir: config.bundledSkillsDir } : {}),
            ...(config.bundledPluginsDir ? { bundledPluginsDir: config.bundledPluginsDir } : {}),
            cacheDir: config.cacheDir,
            ...(config.preassembledArchiveDir
              ? { preassembledArchiveDir: config.preassembledArchiveDir }
              : {}),
            signal,
          });
          return {
            hash: bundle.hash,
            version: bundle.version,
            source: bundle.source,
          } satisfies SshEnvironmentPreparedRuntime;
        });
        return;
      }
      case "connect": {
        const payload: SshConnectPayload = request.payload;
        admit(generation, requestId, (signal) => manager.connect(payload, { signal }));
        return;
      }
      case "disconnect": {
        // Not cancellable: disconnect is the join path and must run to completion.
        admit(generation, requestId, () => manager.disconnect(request.connectionId));
        return;
      }
    }
  }

  const service: SshEnvironmentWorkerService = {
    handleMessage(message: unknown): void {
      if (!isSshEnvironmentParentMessage(message)) return;
      handleRequest(message);
    },
    shutdownRequested,
    dispose(): Promise<void> {
      if (!disposeStarted) {
        closing = true;
        const started = (async () => {
          for (const record of [...operations.values()]) {
            record.controller.abort(sshOperationAbortError("The SSH utility is shutting down."));
          }
          // Join every admitted operation before the manager join: the host
          // exits only after this promise settles, so no tar spawn, staging
          // copy, or discovery can still be unwinding.
          await Promise.allSettled([...operations.values()].map((record) => record.completion));
          await manager.dispose();
        })();
        disposeStarted = started;
        void started.catch(() => undefined);
      }
      return disposeStarted;
    },
    localStats(): SshEnvironmentWorkerLocalStats {
      return {
        activeOperations: operations.size,
        refusedRequests,
        closing,
      };
    },
  };
  // The service owns protocol dispatch: subscribing here also keeps the host
  // channel referenced, so a utility with no in-flight work stays alive for
  // the next request instead of exiting after its ready frame.
  port.onMessage((message) => service.handleMessage(message));
  return service;
}
