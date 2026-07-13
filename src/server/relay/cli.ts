import { installShutdown, reportFatalStartupError } from "../cliRuntime";
import { RelayServer } from "./relayServer";

/**
 * Standalone, self-hostable Poracode relay (docs/REMOTE_ARCHITECTURE.md, Phase
 * 5). Run it on a public host; Poracode servers behind NAT dial it and devices
 * reach them at `<publicBaseUrl>/s/<serverId>/`.
 *
 *   PORACODE_RELAY_HOST            bind host (default 0.0.0.0)
 *   PORACODE_RELAY_PORT            bind port (default 38990)
 *   PORACODE_RELAY_PUBLIC_BASE_URL public base advertised to hosts/devices
 */
async function main(): Promise<void> {
  const port = Number(process.env.PORACODE_RELAY_PORT?.trim() || "38990");
  const relay = new RelayServer({
    host: process.env.PORACODE_RELAY_HOST?.trim() || "0.0.0.0",
    port: Number.isSafeInteger(port) ? port : 38990,
    ...(process.env.PORACODE_RELAY_PUBLIC_BASE_URL?.trim()
      ? { publicBaseUrl: process.env.PORACODE_RELAY_PUBLIC_BASE_URL.trim() }
      : {}),
  });
  const info = await relay.start();
  console.log("[poracode-relay] listening on port %d", info.port);
  console.log("[poracode-relay] public base:   %s", info.url);
  console.log("[poracode-relay] host control:  %s/host", info.url.replace(/^http/, "ws"));

  installShutdown("[poracode-relay]", () => relay.dispose());
}

main().catch((error) => reportFatalStartupError("[poracode-relay]", error));
