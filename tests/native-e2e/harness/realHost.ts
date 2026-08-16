import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { LOOPBACK_HOST, STARTUP_TIMEOUT_MS } from "./constants.ts";
import { assertLoopbackHost } from "./loopback.ts";
import { consumePairingSecretIfPresent, writePairingSecret } from "./pairingSecrets.ts";
import { detectHeadlessServerEntrypoint, findRepoRoot } from "./paths.ts";
import { ProcessCleanup } from "./processCleanup.ts";
import {
  exchangeAndAddProject,
  launchHeadlessServer,
  pairingTokenFromPairingUrl,
  requestPairingJson,
  seedGitFixture,
  stopHeadlessChild,
  supportsProcessGroups,
} from "./realHostProcess.ts";
import type { HarnessBlocker, PairingControlResponse } from "./types.ts";

export interface RealHostOptions {
  readonly host?: string;
  readonly port: number;
  readonly repoRoot?: string;
  readonly startupTimeoutMs?: number;
  readonly cleanup?: ProcessCleanup;
  readonly secretsDir?: string;
  readonly baseDirRoot?: string;
}

export interface RealHostHandle {
  readonly mode: "real";
  readonly pid: number;
  readonly baseDir: string;
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
  readonly hostPort: number;
  readonly entrypoint: string;
  readonly blockers: readonly HarnessBlocker[];
  pair(): Promise<PairingControlResponse>;
  restart(): Promise<void>;
  stop(): Promise<void>;
}

export function missingServerArtifactBlocker(repoRoot = findRepoRoot()): HarnessBlocker {
  return {
    code: "missing-server-artifact",
    message:
      "Production headless server artifact is absent. Build with `pnpm run build` so dist/main/server.cjs exists.",
    path: join(repoRoot, "dist/main/server.cjs"),
  };
}

export async function startRealHost(options: RealHostOptions): Promise<RealHostHandle> {
  const repoRoot = options.repoRoot ?? findRepoRoot();
  const entrypoint = detectHeadlessServerEntrypoint(repoRoot);
  if (!entrypoint) {
    throw Object.assign(new Error(missingServerArtifactBlocker(repoRoot).message), {
      blocker: missingServerArtifactBlocker(repoRoot),
    });
  }
  if (!supportsProcessGroups()) {
    throw Object.assign(new Error("Machine-readable pairing requires a POSIX headless server."), {
      blocker: {
        code: "posix-pairing-required",
        message: "pair --json uses SIGUSR2 and is unavailable on this platform.",
      } satisfies HarnessBlocker,
    });
  }

  const host = assertLoopbackHost(options.host ?? LOOPBACK_HOST, "real host");
  const baseParent = options.baseDirRoot ?? join(findRepoRoot(), ".tmp", "native-e2e");
  mkdirSync(baseParent, { recursive: true, mode: 0o700 });
  const baseDir = mkdtempSync(join(baseParent, "poracode-base-"));
  options.cleanup?.trackTempDir(baseDir);
  const fixtureDir = seedGitFixture(baseDir);
  const startupTimeoutMs = options.startupTimeoutMs ?? STARTUP_TIMEOUT_MS;

  let launch = await launchHeadlessServer({
    host,
    port: options.port,
    repoRoot,
    entrypoint,
    baseDir,
    startupTimeoutMs,
    ...(options.cleanup ? { cleanup: options.cleanup } : {}),
  });

  const blockers: HarnessBlocker[] = [
    {
      code: "real-host-no-fault-injection",
      message:
        "The production RemoteAccessServer has no deterministic fault-injection seam. Use mock mode for adversarial wire faults.",
    },
    {
      code: "real-host-no-emit",
      message:
        "The production host has no public control-plane emit seam. Use mock mode to inject replay/runtime envelopes.",
    },
  ];

  const pair = async (): Promise<PairingControlResponse> => {
    const pairing = await requestPairingJson(
      launch.entrypoint,
      launch.baseDir,
      launch.repoRoot,
      launch.env,
    );
    const token = pairingTokenFromPairingUrl(pairing.pairingUrl);
    if (token && options.secretsDir) {
      writePairingSecret(options.secretsDir, { credential: token, expiresAt: pairing.expiresAt });
    }
    return pairing;
  };

  const handle: RealHostHandle = {
    mode: "real",
    get pid() {
      return launch.child.pid ?? 0;
    },
    get baseDir() {
      return launch.baseDir;
    },
    get httpBaseUrl() {
      return launch.httpBaseUrl;
    },
    get wsBaseUrl() {
      return launch.wsBaseUrl;
    },
    get hostPort() {
      return launch.hostPort;
    },
    get entrypoint() {
      return launch.entrypoint;
    },
    get blockers() {
      return blockers;
    },
    pair,
    restart: async () => {
      await stopHeadlessChild(launch.child);
      await sleep(75);
      launch = await launchHeadlessServer({
        host,
        port: options.port,
        repoRoot,
        entrypoint,
        baseDir,
        startupTimeoutMs,
        ...(options.cleanup ? { cleanup: options.cleanup } : {}),
      });
      await pair();
    },
    stop: async () => {
      await stopHeadlessChild(launch.child);
    },
  };

  try {
    const pairing = await pair();
    const token = pairingTokenFromPairingUrl(pairing.pairingUrl);
    if (!token) {
      blockers.push({
        code: "pair-json-unavailable",
        message: "pair --json did not return a pairing URL with a token fragment.",
      });
      return handle;
    }
    const exchanged = await exchangeAndAddProject(launch.httpBaseUrl, token, fixtureDir);
    if (options.secretsDir) consumePairingSecretIfPresent(options.secretsDir);
    if (exchanged) blockers.push(exchanged);
  } catch (error) {
    if (options.secretsDir) consumePairingSecretIfPresent(options.secretsDir);
    blockers.push({
      code: "pair-json-unavailable",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return handle;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref?.();
  });
}
