import { SshBridge, type SshBridgeAuthentication } from "@poracode/ssh-bridge";
import { arrayBufferToBase64 } from "@/shared/base64";
import {
  bootstrapRemoteRuntime,
  issueRemotePairingCredential,
  SSH_COMMAND_TIMEOUT_MS,
  waitForRemoteEndpoint,
  type RemoteScriptRunner,
} from "@/shared/sshBootstrap";
import { splitSshTarget, sshConnectionConfigSchema, type SshConnectionConfig } from "@/shared/ssh";

interface RuntimeManifest {
  readonly hash: string;
  readonly archive: string;
}

export interface MobileSshConnectResult {
  readonly endpoint: string;
  readonly pairingCredential?: string;
}

let manifestPromise: Promise<RuntimeManifest> | null = null;
let archivePromise: Promise<string> | null = null;

function runtimeBaseUrl(): URL {
  if (import.meta.env.BASE_URL.startsWith("/")) {
    return new URL(`${import.meta.env.BASE_URL}poracode-ssh-runtime/`, window.location.origin);
  }
  return new URL("./poracode-ssh-runtime/", document.baseURI);
}

async function loadManifest(): Promise<RuntimeManifest> {
  manifestPromise ??= fetch(new URL("manifest.json", runtimeBaseUrl()))
    .then(async (response) => {
      if (!response.ok)
        throw new Error(`Mobile SSH runtime manifest returned HTTP ${response.status}.`);
      const value = (await response.json()) as Partial<RuntimeManifest>;
      if (!value.hash || !/^[0-9a-f]{64}$/.test(value.hash) || !value.archive) {
        throw new Error("Mobile SSH runtime manifest is invalid.");
      }
      return { hash: value.hash, archive: value.archive };
    })
    .catch((error: unknown) => {
      manifestPromise = null;
      throw error;
    });
  return await manifestPromise;
}

async function loadArchive(manifest: RuntimeManifest): Promise<string> {
  archivePromise ??= fetch(new URL(manifest.archive, runtimeBaseUrl()))
    .then(async (response) => {
      if (!response.ok)
        throw new Error(`Mobile SSH runtime archive returned HTTP ${response.status}.`);
      return arrayBufferToBase64(await response.arrayBuffer());
    })
    .catch((error: unknown) => {
      archivePromise = null;
      throw error;
    });
  return await archivePromise;
}

async function runRemoteScript(
  connectionId: string,
  script: string,
  args: readonly string[] = [],
  timeoutMs = SSH_COMMAND_TIMEOUT_MS,
): Promise<string> {
  const result = await SshBridge.run({ connectionId, script, args, timeoutMs });
  if (result.exitCode !== 0) {
    throw new Error(
      result.stderr.trim() ||
        result.stdout.trim() ||
        `Remote SSH command exited with ${result.exitCode}.`,
    );
  }
  return result.stdout;
}

function nativeTarget(connection: SshConnectionConfig): { host: string; username: string } {
  const target = splitSshTarget(connection.target);
  if (!target.username) throw new Error("Mobile SSH requires a user@host target.");
  return { host: target.host, username: target.username };
}

export async function probeMobileSshHost(
  target: string,
  port = 22,
): Promise<{ readonly fingerprint: string; readonly algorithm: string }> {
  const parsed = splitSshTarget(target.trim());
  if (!parsed.username || !parsed.host) throw new Error("Enter the SSH target as user@host.");
  return await SshBridge.probeHostKey({ host: parsed.host, port });
}

export async function connectMobileSsh(
  input: SshConnectionConfig,
  authentication: SshBridgeAuthentication,
  issuePairingCredential: boolean,
): Promise<MobileSshConnectResult> {
  const connection = sshConnectionConfigSchema.parse(input);
  const target = nativeTarget(connection);
  if (!connection.hostKeyFingerprint) throw new Error("Verify the SSH host key before connecting.");
  const manifest = await loadManifest();
  await SshBridge.connect({
    connectionId: connection.id,
    host: target.host,
    port: connection.port ?? 22,
    username: target.username,
    authentication,
    hostKeyFingerprint: connection.hostKeyFingerprint,
  });
  try {
    const runScript: RemoteScriptRunner = (script, args, timeoutMs) =>
      runRemoteScript(connection.id, script, args, timeoutMs);
    const remotePort = await bootstrapRemoteRuntime(
      {
        runScript,
        deliverArchive: async (remotePath) => {
          await SshBridge.upload({
            connectionId: connection.id,
            remotePath,
            base64: await loadArchive(manifest),
          });
        },
      },
      connection.id,
      manifest.hash,
    );
    const credential = issuePairingCredential
      ? await issueRemotePairingCredential(runScript, connection.id, manifest.hash)
      : undefined;
    const tunnel = await SshBridge.forward({
      connectionId: connection.id,
      remotePort,
    });
    await waitForRemoteEndpoint((url, init) => fetch(url, init), tunnel.endpoint);
    return {
      endpoint: tunnel.endpoint,
      ...(credential ? { pairingCredential: credential } : {}),
    };
  } catch (error) {
    await SshBridge.disconnect({ connectionId: connection.id }).catch(() => {});
    throw error;
  }
}

export async function disconnectMobileSsh(connectionId: string): Promise<void> {
  await SshBridge.disconnect({ connectionId });
}

export function __resetMobileSshRuntimeForTests(): void {
  manifestPromise = null;
  archivePromise = null;
}
