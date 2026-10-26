import { spawn as spawnProcess, type ChildProcess } from "node:child_process";
import { basename, dirname, resolve } from "node:path";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import {
  HostControlRefusedError,
  HostControlUnsupportedOperationError,
} from "@/backend/ownership/hostControlClient";
import type { HostBuildIdentity } from "@/shared/hostControlProtocol";
import { requestHostStatusFromRunningServer, type HostStatusResponse } from "./pairingControl";
import { serverLogFilePath } from "./serverLogFile";
import {
  probeRunningOwner,
  RunningOwnerRefusedError,
  RunningOwnerUnreachableError,
} from "./serverUpgradeIdentity";

const OWNER_START_TIMEOUT_MS = 30_000;
const OWNER_START_POLL_MS = 250;

type OwnerChild = Pick<ChildProcess, "once" | "unref">;
type OwnerSpawner = (
  command: string,
  args: string[],
  options: {
    detached: true;
    env: NodeJS.ProcessEnv;
    stdio: "ignore";
    windowsHide: true;
  },
) => OwnerChild;

export interface EnsureCliOwnerOptions {
  readonly baseDir?: string;
  readonly capturedBuild?: HostBuildIdentity;
  readonly statusProbe?: (
    profileNamespace: string,
    timeoutMs?: number,
  ) => Promise<HostStatusResponse>;
  readonly ownerProbe?: (profileNamespace: string) => Promise<unknown | null>;
  readonly spawn?: OwnerSpawner;
  readonly execPath?: string;
  readonly execArgv?: readonly string[];
  readonly entrypoint?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly writeStderr?: (text: string) => void;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly now?: () => number;
  readonly timeoutMs?: number;
  readonly pollIntervalMs?: number;
}

export async function ensureCliOwner(
  profileNamespace: string,
  options: EnsureCliOwnerOptions = {},
): Promise<HostStatusResponse> {
  const paths = resolveHostRootPaths(profileNamespace);
  const statusProbe =
    options.statusProbe ??
    ((profile: string, timeoutMs?: number) =>
      requestHostStatusFromRunningServer(profile, timeoutMs === undefined ? {} : { timeoutMs }));
  try {
    return await statusProbe(profileNamespace);
  } catch (error) {
    if (isOwnerRefusal(error)) throw error;
    const probe =
      options.ownerProbe ??
      (async (profile: string) => probeRunningOwner(resolveHostRootPaths(profile)));
    const existing = await probe(profileNamespace);
    if (existing !== null) {
      try {
        return await statusProbe(profileNamespace);
      } catch (retryError) {
        throw new RunningOwnerUnreachableError(
          "A Poracode owner exists but its local control endpoint is unavailable; refusing to start another server.",
          { cause: retryError ?? error },
        );
      }
    }
  }

  const entrypoint = options.entrypoint ?? process.argv[1];
  if (!entrypoint)
    throw new Error("Cannot auto-start the Poracode server without a CLI entrypoint.");
  if (options.capturedBuild && !isCapturedDesktopBootstrap(entrypoint, options.env ?? process.env))
    throw new Error(
      "The desktop-provided CLI cannot safely re-invoke its captured bootstrap. Open the Poracode desktop app or start the owner explicitly with poracode serve, then retry.",
    );
  (options.writeStderr ?? ((text) => process.stderr.write(text)))(
    "Starting Poracode background server:\n",
  );

  let spawnFailure: Error | undefined;
  let childExitCode: number | null | undefined;
  try {
    const child = (options.spawn ?? spawnProcess)(
      options.execPath ?? process.execPath,
      [
        ...(options.execArgv ?? process.execArgv),
        entrypoint,
        "serve",
        ...(options.baseDir !== undefined ? ["--base-dir", options.baseDir] : []),
      ],
      {
        detached: true,
        env: options.env ?? process.env,
        stdio: "ignore",
        windowsHide: true,
      },
    );
    child.once("error", (error) => {
      spawnFailure = error;
    });
    child.once("exit", (code) => {
      childExitCode = code;
    });
    child.unref();
  } catch (error) {
    throw new Error("Could not start the Poracode background server.", { cause: error });
  }

  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ??
    ((milliseconds: number) => new Promise((settle) => setTimeout(settle, milliseconds)));
  const timeoutMs = options.timeoutMs ?? OWNER_START_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? OWNER_START_POLL_MS;
  const deadline = now() + timeoutMs;
  for (;;) {
    try {
      return await statusProbe(profileNamespace, Math.min(pollIntervalMs, 1_000));
    } catch (error) {
      if (isOwnerRefusal(error)) throw error;
    }
    if (spawnFailure)
      throw new Error("Could not start the Poracode background server.", { cause: spawnFailure });
    const remaining = deadline - now();
    if (remaining <= 0) break;
    if (childExitCode !== undefined)
      throw new Error(
        `The Poracode background server exited with code ${childExitCode} before becoming ready. Check ${serverLogFilePath(paths.dataRoot)} and run poracode doctor with the same --base-dir.`,
      );
    await sleep(Math.min(pollIntervalMs, remaining));
  }

  throw new Error(
    `Timed out waiting for the Poracode background server. Check ${serverLogFilePath(paths.dataRoot)} and run poracode doctor with the same --base-dir.`,
  );
}

function isOwnerRefusal(error: unknown): error is Error {
  return (
    error instanceof HostControlRefusedError ||
    error instanceof HostControlUnsupportedOperationError ||
    error instanceof RunningOwnerRefusedError ||
    error instanceof RunningOwnerUnreachableError
  );
}

function isCapturedDesktopBootstrap(entrypoint: string, env: NodeJS.ProcessEnv) {
  const path = resolve(entrypoint);
  return (
    env.ELECTRON_RUN_AS_NODE === "1" &&
    basename(path).toLowerCase() === "bootstrap.mjs" &&
    basename(dirname(path)).toLowerCase() === "desktop-cli"
  );
}
