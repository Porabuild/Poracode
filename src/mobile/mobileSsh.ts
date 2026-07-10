import { SshBridge, type SshBridgeAuthentication } from "@lightcode/ssh-bridge";
import {
  INSTALL_REMOTE_RUNTIME_SCRIPT,
  LAUNCH_REMOTE_SERVER_SCRIPT,
  PAIR_REMOTE_SERVER_SCRIPT,
  PREPARE_REMOTE_UPLOAD_SCRIPT,
  PROBE_REMOTE_RUNTIME_SCRIPT,
} from "@/shared/sshRemoteScripts";
import {
  parsePairingCredential,
  parseRemoteLaunchPort,
  splitSshTarget,
  sshConnectionConfigSchema,
  type SshConnectionConfig,
} from "@/shared/ssh";

const SSH_COMMAND_TIMEOUT_MS = 60_000;
const SSH_INSTALL_TIMEOUT_MS = 10 * 60_000;
const SSH_TUNNEL_READY_TIMEOUT_MS = 20_000;

interface RuntimeManifest {
  readonly hash: string;
  readonly archive: string;
}

export interface MobileSshConnectResult {
  readonly endpoint: string;
  readonly remotePort: number;
  readonly pairingCredential?: string;
}

let manifestPromise: Promise<RuntimeManifest> | null = null;
let archivePromise: Promise<string> | null = null;

function runtimeBaseUrl(): URL {
  return new URL("./lightcode-ssh-runtime/", document.baseURI);
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

function arrayBufferToBase64(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  }
  return btoa(chunks.join(""));
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

async function waitForEndpoint(endpoint: string): Promise<void> {
  const deadline = Date.now() + SSH_TUNNEL_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 1_000);
    try {
      const response = await fetch(new URL(".well-known/lightcode/environment", endpoint), {
        signal: controller.signal,
      });
      if (response.ok) return;
    } catch {
      // The native listener can become reachable a moment after it is bound.
    } finally {
      window.clearTimeout(timer);
    }
    await new Promise((resolve) => window.setTimeout(resolve, 200));
  }
  throw new Error("Timed out waiting for the SSH tunnel to reach remote Poracode.");
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
    const probe = await runRemoteScript(connection.id, PROBE_REMOTE_RUNTIME_SCRIPT, [
      manifest.hash,
    ]);
    if (probe.trim().split(/\r?\n/g).at(-1) !== "ready") {
      await runRemoteScript(connection.id, PREPARE_REMOTE_UPLOAD_SCRIPT);
      await SshBridge.upload({
        connectionId: connection.id,
        remotePath: `.lightcode/ssh/uploads/${manifest.hash}.tar.gz`,
        base64: await loadArchive(manifest),
      });
      await runRemoteScript(
        connection.id,
        INSTALL_REMOTE_RUNTIME_SCRIPT,
        [manifest.hash],
        SSH_INSTALL_TIMEOUT_MS,
      );
    }
    const launchOutput = await runRemoteScript(connection.id, LAUNCH_REMOTE_SERVER_SCRIPT, [
      connection.id,
      manifest.hash,
    ]);
    const remotePort = parseRemoteLaunchPort(launchOutput);
    const credential = issuePairingCredential
      ? parsePairingCredential(
          await runRemoteScript(connection.id, PAIR_REMOTE_SERVER_SCRIPT, [
            connection.id,
            manifest.hash,
          ]),
        )
      : undefined;
    const tunnel = await SshBridge.forward({
      connectionId: connection.id,
      remotePort,
    });
    await waitForEndpoint(tunnel.endpoint);
    return {
      endpoint: tunnel.endpoint,
      remotePort,
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
