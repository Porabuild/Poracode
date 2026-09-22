import { fork, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import {
  RUNTIME_CAPTURE_PROTOCOL_VERSION,
  RUNTIME_CODE_MAX_FILES,
  RUNTIME_CODE_MAX_FILE_BYTES,
  RUNTIME_CODE_MAX_TOTAL_BYTES,
  RUNTIME_MANIFEST_MAX_BYTES,
} from "@/shared/runtimeCodeManifest";
import { SSH_RUNTIME_MANIFEST_VERSION } from "@/shared/sshRuntimeManifest";
import { createCapturedRuntimeBootstrap } from "./capturedRuntimeBootstrap";
import { readVerifiedRuntimeManifest, type RuntimeManifestExpectation } from "./runtimeManifest";
import { stopSupervisorChild } from "@/host/supervisor/stopSupervisorChild";

export interface CapturedRuntimeOptions extends RuntimeManifestExpectation {
  readonly entry: "supervisor";
  /** Pass the final merged environment; preload options are removed afterward. */
  readonly env?: NodeJS.ProcessEnv;
  readonly execPath?: string;
  readonly captureTimeoutMs?: number;
}

export interface CapturedRuntime {
  readonly child: ChildProcess;
  readonly sourceBytes: number;
  /** Loading the entry is separate from its settings-service readiness. */
  activate(): Promise<void>;
  dispose(): Promise<void>;
}

export function capturedRuntimeEnvironment(input: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...input };
  // Windows folds environment key case. Do not leave a second spelling which
  // can sort ahead of the sanitized key when Node constructs the child env.
  for (const key of Object.keys(env))
    if (["NODE_OPTIONS", "ELECTRON_RUN_AS_NODE"].includes(key.toUpperCase())) delete env[key];
  return { ...env, NODE_OPTIONS: "", ELECTRON_RUN_AS_NODE: "1" };
}

/** Inactive admission helper. SupervisorClient is wired only with the complete
 * authority/reverse-service conversion, never a legacy direct-file fallback. */
export async function prepareCapturedRuntime(
  options: CapturedRuntimeOptions,
): Promise<CapturedRuntime> {
  const manifest = await readVerifiedRuntimeManifest(options);
  options.signal?.throwIfAborted();
  const session = randomUUID();
  const deadlineMs = options.captureTimeoutMs ?? 10_000;
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 60_000)
    throw new Error("Runtime capture deadline is invalid.");
  const configuration = {
    session,
    version: RUNTIME_CAPTURE_PROTOCOL_VERSION,
    manifestVersion: SSH_RUNTIME_MANIFEST_VERSION,
    sourceHash: options.sourceHash,
    settingsServiceVersion: options.settingsServiceVersion,
    entry: options.entry,
    deadlineMs,
    manifestMaxBytes: RUNTIME_MANIFEST_MAX_BYTES,
    maxFiles: RUNTIME_CODE_MAX_FILES,
    maxFileBytes: RUNTIME_CODE_MAX_FILE_BYTES,
    maxTotalBytes: RUNTIME_CODE_MAX_TOTAL_BYTES,
  };
  const init = {
    type: "runtime-capture:init",
    version: configuration.version,
    session,
    root: resolve(options.root),
    manifest,
  };
  if (Buffer.byteLength(JSON.stringify(init), "utf8") > RUNTIME_MANIFEST_MAX_BYTES)
    throw new Error("Runtime capture initialization exceeds its byte limit.");
  const ready = Promise.withResolvers<number>();
  const active = Promise.withResolvers<void>();
  // Startup can fail before a caller asks to activate; retain the rejection for
  // that caller without creating an unhandled rejection in the meantime.
  void active.promise.catch(() => undefined);
  const forkOptions = {
    stdio: ["ignore", "pipe", "pipe", "ipc"] as const,
    env: capturedRuntimeEnvironment(options.env ?? process.env),
    execArgv: ["--eval", createCapturedRuntimeBootstrap(configuration)],
    ...(options.execPath ? { execPath: options.execPath } : {}),
  };
  options.signal?.throwIfAborted();
  const child = fork(resolve(options.root, "supervisor.cjs"), [], {
    ...forkOptions,
    stdio: [...forkOptions.stdio],
  });
  let disposal: Promise<void> | undefined;
  let activation: Promise<void> | undefined;
  let phase: "capturing" | "captured" | "activating" | "active" | "stopping" = "capturing";
  const fail = (error: unknown) => {
    ready.reject(error);
    active.reject(error);
  };
  const dispose = (): Promise<void> => {
    if (disposal) return disposal;
    phase = "stopping";
    fail(new Error("Runtime capture was stopped."));
    disposal = stopSupervisorChild(child).finally(() => {
      clearTimeout(deadline);
      options.signal?.removeEventListener("abort", aborted);
      child.off("message", message);
      child.off("error", fail);
    });
    return disposal;
  };
  const aborted = () => {
    fail(options.signal?.reason ?? new Error("Runtime capture canceled."));
    void dispose().catch(fail);
  };
  const deadline = setTimeout(() => {
    fail(new Error("Runtime capture deadline expired."));
    void dispose().catch(fail);
  }, deadlineMs);
  const message = (input: unknown) => {
    if (!input || typeof input !== "object") return;
    const data = input as Record<string, unknown>;
    if (typeof data.type !== "string" || !data.type.startsWith("runtime-capture:")) return;
    if (data.session !== session || data.version !== configuration.version) {
      fail(new Error("Runtime capture reply session/version differs."));
      void dispose().catch(fail);
      return;
    }
    if (
      data.type === "runtime-capture:ready" &&
      phase === "capturing" &&
      Number.isSafeInteger(data.sourceBytes) &&
      (data.sourceBytes as number) >= 0 &&
      (data.sourceBytes as number) <= RUNTIME_CODE_MAX_TOTAL_BYTES
    ) {
      phase = "captured";
      ready.resolve(data.sourceBytes as number);
    } else if (data.type === "runtime-capture:active" && phase === "activating") {
      phase = "active";
      clearTimeout(deadline);
      active.resolve();
    } else {
      fail(
        new Error(
          typeof data.error === "string"
            ? data.error.slice(0, 300)
            : "Invalid runtime capture reply.",
        ),
      );
      void dispose().catch(fail);
    }
  };
  child.on("message", message);
  child.on("error", fail);
  child.once("close", () => {
    clearTimeout(deadline);
    options.signal?.removeEventListener("abort", aborted);
    fail(new Error("Captured runtime exited before startup completed."));
  });
  options.signal?.addEventListener("abort", aborted, { once: true });
  try {
    options.signal?.throwIfAborted();
    child.send(init, (error) => {
      if (error) fail(error);
    });
    const sourceBytes = await ready.promise;
    options.signal?.throwIfAborted();
    return {
      child,
      sourceBytes,
      activate() {
        if (phase === "stopping") return Promise.reject(new Error("Runtime capture was stopped."));
        if (activation) return activation;
        options.signal?.throwIfAborted();
        phase = "activating";
        activation = active.promise;
        child.send(
          { type: "runtime-capture:activate", version: configuration.version, session },
          (error) => {
            if (error) {
              fail(error);
              void dispose().catch(fail);
            }
          },
        );
        return activation;
      },
      dispose,
    };
  } catch (error) {
    try {
      await dispose();
    } catch (stopError) {
      throw new AggregateError(
        [error, stopError],
        "Runtime capture failed and child closure was not confirmed.",
        { cause: stopError },
      );
    }
    throw error;
  }
}
