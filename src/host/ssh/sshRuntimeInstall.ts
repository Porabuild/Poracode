import { randomUUID } from "node:crypto";
import {
  remoteRuntimeUploadPath,
  SSH_COMMAND_TIMEOUT_MS,
  SSH_INSTALL_LOCK_WAIT_MS,
  SSH_INSTALL_TIMEOUT_MS,
} from "@/shared/sshBootstrap";
import {
  INSTALL_REMOTE_RUNTIME_SCRIPT,
  PREPARE_REMOTE_UPLOAD_SCRIPT,
  PROBE_REMOTE_RUNTIME_SCRIPT,
} from "@/shared/sshRemoteScripts";
import type { RemoteRuntimeTransport } from "@/shared/sshBootstrap";

/**
 * Ensure the content-addressed runtime `hash` is installed on the remote host.
 *
 * This is the install half of `bootstrapRemoteRuntime` exposed for the explicit
 * upgrade path: an upgrade must be able to point at the host's installed bundle
 * even when that hash has not been provisioned on the remote yet. It performs
 * no signalling and no owner start; the caller owns launching (connect) or
 * draining (upgrade).
 *
 * The shared bootstrap keeps its own copy of this sequence; it is intentionally
 * untouched by this lane so the C2 connect behavior is unchanged.
 */
export async function ensureRemoteRuntimeInstalled(
  transport: RemoteRuntimeTransport,
  hash: string,
  options: {
    readonly lockWaitMs?: number;
    /** Unique per upload attempt so concurrent clients never share an archive. */
    readonly uploadId?: string;
  } = {},
): Promise<{ readonly installed: boolean }> {
  const probe = await transport.runScript(
    PROBE_REMOTE_RUNTIME_SCRIPT,
    [hash],
    SSH_COMMAND_TIMEOUT_MS,
  );
  if (probe.trim().split(/\r?\n/g).at(-1) === "ready") {
    return { installed: false };
  }
  const archiveName = `${hash}-${options.uploadId ?? randomUUID()}.tar.gz`;
  await transport.runScript(PREPARE_REMOTE_UPLOAD_SCRIPT, [], SSH_COMMAND_TIMEOUT_MS);
  await transport.deliverArchive(remoteRuntimeUploadPath(archiveName));
  await transport.runScript(
    INSTALL_REMOTE_RUNTIME_SCRIPT,
    [hash, archiveName, String(options.lockWaitMs ?? SSH_INSTALL_LOCK_WAIT_MS)],
    SSH_INSTALL_TIMEOUT_MS,
  );
  return { installed: true };
}
