import { z } from "zod";
import { managedLoopbackBootstrapSchema } from "./managedLoopback";

/**
 * Independently updated extension/host bootstrap, negotiated in the hello frame.
 * 2: mutual proof (`nonce`/`clientProof` → `serverProof`). 1 was extension
 * 0.2.0's raw `bridgeToken` hello, still installed in some browsers; it is
 * never negotiated, so those workers get no credential.
 */
export const CHROME_SIDEBAR_PROTOCOL_VERSION = 2;
export const chromeSidebarBootstrapRequestSchema = z.object({
  type: z.literal("sidebarBootstrap"),
  version: z.literal(CHROME_SIDEBAR_PROTOCOL_VERSION),
  requestId: z.string().min(1).max(64),
});
export const chromeSidebarBootstrapResponseSchema = z.object({
  type: z.literal("sidebarBootstrapResult"),
  version: z.literal(CHROME_SIDEBAR_PROTOCOL_VERSION),
  requestId: z.string().min(1).max(64),
  bootstrap: managedLoopbackBootstrapSchema.nullable(),
});

/**
 * Mutual proof of the per-launch bridge secret in the hello handshake. The
 * secret itself never crosses the socket: the extension gets it only from the
 * native messaging host. Both proofs are lowercase-hex HMAC-SHA256 keyed with
 * the secret's UTF-8 bytes over newline-joined fields, under distinct domains
 * so one side's proof never serves as the other's. Both bind the loopback port
 * (the one the extension dialed, the one the bridge listens on), so an
 * impostor on another scanned port can neither forge the ack nor relay the
 * extension's proof to the real bridge. Secrets are per launch, so a captured
 * proof never verifies against a later bridge. `chrome-extension/background.js`
 * mirrors the domains and field order.
 */
export const CHROME_BRIDGE_CLIENT_PROOF_DOMAIN = "poracode-chrome-bridge/client-proof/v1";
export const CHROME_BRIDGE_SERVER_PROOF_DOMAIN = "poracode-chrome-bridge/server-proof/v1";
/** 32 random bytes as lowercase hex; also the shape of every proof. */
export const CHROME_BRIDGE_HEX_256 = /^[0-9a-f]{64}$/;

export function chromeBridgeClientProofMessage(port: number, nonce: string): string {
  return [CHROME_BRIDGE_CLIENT_PROOF_DOMAIN, port, nonce].join("\n");
}

export function chromeBridgeServerProofMessage(
  port: number,
  nonce: string,
  ack: Pick<ChromeSidebarHelloAck, "sidebarBootstrapVersion" | "authenticated">,
): string {
  return [
    CHROME_BRIDGE_SERVER_PROOF_DOMAIN,
    port,
    nonce,
    ack.sidebarBootstrapVersion ?? "null",
    ack.authenticated,
  ].join("\n");
}

/**
 * Host → extension, answering the hello frame (additive; hosts without it
 * predate the sidebar). `sidebarBootstrapVersion` is the bootstrap protocol
 * this connection may use, or `null` when it may not request credentials;
 * `authenticated` reports whether the hello proved possession of the bridge
 * secret. `serverProof` accompanies, and is the only evidence for,
 * `authenticated: true` on a hello that carried a `clientProof`; the extension
 * treats an unproven ack as advisory. Relay-only extensions ignore the frame.
 */
export const chromeSidebarHelloAckSchema = z.object({
  type: z.literal("helloAck"),
  sidebarBootstrapVersion: z.number().int().nullable(),
  authenticated: z.boolean(),
  serverProof: z.string().regex(CHROME_BRIDGE_HEX_256).optional(),
});
export type ChromeSidebarHelloAck = z.infer<typeof chromeSidebarHelloAckSchema>;

/**
 * Worker → sidebar answer to `getChatBootstrap` when no credential can come
 * from this app, as opposed to a bootstrap or `null` (retry later).
 * `upgradeRequired`: the running app does not speak this sidebar protocol.
 */
export const CHROME_SIDEBAR_RUNTIME_ISSUES = ["upgradeRequired"] as const;
export const chromeSidebarRuntimeIssueSchema = z.enum(CHROME_SIDEBAR_RUNTIME_ISSUES);
export type ChromeSidebarRuntimeIssue = z.infer<typeof chromeSidebarRuntimeIssueSchema>;
export const chromeSidebarClientIssueSchema = z.object({
  issue: chromeSidebarRuntimeIssueSchema,
});

/**
 * Extension IDs Poracode trusts. The first is derived from the public `key` in
 * `chrome-extension/manifest.json`, so every unpacked build shares it; append
 * the published Web Store ID when it differs. Chrome itself enforces these on
 * the native messaging host (`allowed_origins`), which is what proves identity:
 * a WebSocket `Origin` header alone is client-asserted.
 */
export const CHROME_SIDEBAR_EXTENSION_IDS: readonly string[] = ["nebjdbpljbmgchnecchddbiondbcdbbd"];

/** Development override: comma-separated extra extension IDs. */
export const CHROME_SIDEBAR_EXTENSION_IDS_ENV = "PORACODE_CHROME_EXTENSION_IDS";

/** Per-user native messaging host that hands the extension its bridge token. */
export const CHROME_NATIVE_HOST_NAME = "com.poracode.chrome_bridge";
export const CHROME_NATIVE_HOST_PROTOCOL_VERSION = 1;

const EXTENSION_ID = /^[a-p]{32}$/;

export function resolveChromeSidebarExtensionIds(
  env: Readonly<Record<string, string | undefined>>,
): readonly string[] {
  const extra = (env[CHROME_SIDEBAR_EXTENSION_IDS_ENV] ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => EXTENSION_ID.test(id));
  return [...new Set([...CHROME_SIDEBAR_EXTENSION_IDS, ...extra])];
}

/** Chrome's installed-extension origin for a pinned ID, with no path, port or suffix. */
export function isChromeExtensionOrigin(
  origin: string | undefined,
  extensionIds: readonly string[],
): boolean {
  if (typeof origin !== "string") return false;
  const match = /^chrome-extension:\/\/([a-p]{32})$/.exec(origin);
  return match !== null && extensionIds.includes(match[1]!);
}

/**
 * The sidebar can only reach a plain-http loopback endpoint: extension CORS is
 * granted to direct loopback peers, and a self-signed TLS endpoint is rejected
 * by the browser. Wider (LAN/tailnet/TLS) binds must not mint a credential.
 */
export function isBrowserExtensionReachableEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]")
    );
  } catch {
    return false;
  }
}
