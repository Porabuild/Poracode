import { parsePairingCredential, parseRemoteLaunchPort } from "./ssh";
import {
  INSTALL_REMOTE_RUNTIME_SCRIPT,
  LAUNCH_REMOTE_SERVER_SCRIPT,
  PAIR_REMOTE_SERVER_SCRIPT,
  PREPARE_REMOTE_UPLOAD_SCRIPT,
  PROBE_REMOTE_RUNTIME_SCRIPT,
} from "./sshRemoteScripts";

export const SSH_COMMAND_TIMEOUT_MS = 60_000;
export const SSH_INSTALL_TIMEOUT_MS = 10 * 60_000;
export const SSH_TUNNEL_READY_TIMEOUT_MS = 20_000;

/** Runs a bootstrap script on the remote host and resolves its stdout. */
export type RemoteScriptRunner = (
  script: string,
  args: readonly string[],
  timeoutMs: number,
) => Promise<string>;

/**
 * Transport primitives each platform supplies: the desktop spawns `ssh`/`scp`
 * processes, mobile goes through the native SshBridge. The bootstrap sequence
 * itself (probe → upload+install when missing → launch) is shared so the
 * remote protocol can only change in one place.
 */
export interface RemoteRuntimeTransport {
  readonly runScript: RemoteScriptRunner;
  /** Deliver the runtime archive to the given remote path. */
  deliverArchive(remotePath: string): Promise<void>;
}

/** Upload destination consumed by INSTALL_REMOTE_RUNTIME_SCRIPT. */
export function remoteRuntimeUploadPath(hash: string): string {
  return `.poracode/ssh/uploads/${hash}.tar.gz`;
}

/**
 * Ensure the remote runtime for `hash` is installed and launched.
 * Resolves the port the remote server is listening on.
 */
export async function bootstrapRemoteRuntime(
  transport: RemoteRuntimeTransport,
  connectionId: string,
  hash: string,
): Promise<number> {
  const probe = await transport.runScript(
    PROBE_REMOTE_RUNTIME_SCRIPT,
    [hash],
    SSH_COMMAND_TIMEOUT_MS,
  );
  if (probe.trim().split(/\r?\n/g).at(-1) !== "ready") {
    await transport.runScript(PREPARE_REMOTE_UPLOAD_SCRIPT, [], SSH_COMMAND_TIMEOUT_MS);
    await transport.deliverArchive(remoteRuntimeUploadPath(hash));
    await transport.runScript(INSTALL_REMOTE_RUNTIME_SCRIPT, [hash], SSH_INSTALL_TIMEOUT_MS);
  }
  const launched = await transport.runScript(
    LAUNCH_REMOTE_SERVER_SCRIPT,
    [connectionId, hash],
    SSH_COMMAND_TIMEOUT_MS,
  );
  return parseRemoteLaunchPort(launched);
}

/** Mint a one-time pairing credential from the launched remote server. */
export async function issueRemotePairingCredential(
  runScript: RemoteScriptRunner,
  connectionId: string,
  hash: string,
): Promise<string> {
  return parsePairingCredential(
    await runScript(PAIR_REMOTE_SERVER_SCRIPT, [connectionId, hash], SSH_COMMAND_TIMEOUT_MS),
  );
}

/** Poll the tunneled endpoint until the remote server answers its well-known probe. */
export async function waitForRemoteEndpoint(
  fetchImpl: typeof fetch,
  endpoint: string,
  timeoutMs = SSH_TUNNEL_READY_TIMEOUT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetchImpl(new URL(".well-known/poracode/environment", endpoint), {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return;
      lastError = new Error(`Remote Poracode probe returned HTTP ${response.status}.`);
    } catch (error) {
      // The listener can become reachable a moment after the tunnel is bound.
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Timed out waiting for the SSH tunnel to reach remote Poracode.", {
    cause: lastError,
  });
}
