import { writeSync } from "node:fs";
import { join } from "node:path";
import { resolveLightcodeBaseDir } from "@/shared/lightcodePaths";
import { prepareLightcodeDataRoot } from "@/main/lightcodeData";
import { createHeadlessRemoteHost } from "./createHeadlessRemoteHost";
import { readOrCreateHeadlessSecretKey, readOrCreateRelaySecret } from "./headlessSecretKey";

/**
 * Standalone headless Lightcode remote server.
 *
 * Runs the same {@link RemoteAccessServer} the desktop app exposes, but with no
 * Electron, no window and no renderer — usable as a CLI on any host. Devices
 * pair to it directly over the LAN (or a VPN / Tailscale address); see
 * docs/REMOTE_ARCHITECTURE.md.
 *
 * Configuration is environment-driven, matching `src/main/remote/config.ts`:
 *   LIGHTCODE_BASE_DIR                       data dir (default: per-channel)
 *   LIGHTCODE_APP_VERSION                    reported app version
 *   LIGHTCODE_REMOTE_ACCESS_HOST             bind host (default 0.0.0.0)
 *   LIGHTCODE_REMOTE_ACCESS_PORT             bind port (default 38987)
 *   LIGHTCODE_REMOTE_ACCESS_ADVERTISED_HOST  host advertised in pairing URLs
 *   LIGHTCODE_SECRET_STORAGE_KEY             base64 32-byte key (else file-backed)
 *   LIGHTCODE_BETTER_SQLITE3_NATIVE_BINDING  optional Node-ABI better_sqlite3.node
 *   LIGHTCODE_WSL_HELPERS_DIR                in-WSL helper assets dir
 *   LIGHTCODE_REMOTE_RELAY_URL               relay /host control URL (cross-network)
 *   LIGHTCODE_REMOTE_RELAY_SECRET            secret claiming the server id (else file-backed)
 */
function resolveWslHelpersDir(): string {
  const explicit = process.env.LIGHTCODE_WSL_HELPERS_DIR?.trim();
  if (explicit) return explicit;
  // Mirror the dev layout in main.ts: <dist/main>/../../resources/wsl-helpers.
  return join(__dirname, "..", "..", "resources", "wsl-helpers");
}

async function main(): Promise<void> {
  process.env.LIGHTCODE_HEADLESS_SERVER = "1";
  const baseDir = process.env.LIGHTCODE_BASE_DIR?.trim() || resolveLightcodeBaseDir();
  // Ensure the data dir exists before the secret key is written into it.
  prepareLightcodeDataRoot(baseDir);

  const appVersion = process.env.LIGHTCODE_APP_VERSION?.trim() || "dev";
  const isDev = process.env.LIGHTCODE_IS_DEV === "1" || Boolean(process.env.VITE_DEV_SERVER_URL);
  const secretStorageKey = readOrCreateHeadlessSecretKey(baseDir);
  const relayUrl = process.env.LIGHTCODE_REMOTE_RELAY_URL?.trim();
  const relaySecret = relayUrl ? readOrCreateRelaySecret(baseDir) : undefined;

  const host = createHeadlessRemoteHost({
    appVersion,
    isDev,
    baseDir,
    supervisorPath: join(__dirname, "supervisor.cjs"),
    wslHelpersDir: resolveWslHelpersDir(),
    secretStorageKey,
    ...(relayUrl ? { relayUrl } : {}),
    ...(relaySecret ? { relaySecret } : {}),
    onRelayRegistered: (publicUrl) =>
      console.log("[lightcode-server] reachable via relay: %s", publicUrl),
    reportError: (error) => {
      console.error("[lightcode-server] supervisor error:", error);
    },
  });

  const info = await host.start();
  console.log("[lightcode-server] data dir:        %s", baseDir);
  console.log("[lightcode-server] listening at:    %s", info.httpBaseUrl);
  console.log("[lightcode-server] websocket at:    %s", info.wsBaseUrl);
  console.log("[lightcode-server] pair a device:   %s", info.pairingUrl);
  console.log("[lightcode-server] (send SIGUSR2 to mint a fresh pairing link)");

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("\n[lightcode-server] %s received, shutting down…", signal);
    void host
      .dispose()
      .catch((error) => console.error("[lightcode-server] shutdown error:", error))
      .finally(() => process.exit(0));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  // POSIX-only: print a new pairing link without restarting the server.
  process.on("SIGUSR2", () => {
    try {
      console.log("[lightcode-server] pair a device:   %s", host.server.issuePairingUrl());
    } catch (error) {
      console.error("[lightcode-server] could not mint pairing link:", error);
    }
  });
}

main().catch((error) => {
  // Write synchronously to fd 2: a piped stderr flushes asynchronously, so a
  // console.error() immediately followed by process.exit() drops the message.
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  writeSync(2, `[lightcode-server] failed to start: ${detail}\n`);
  process.exit(1);
});
