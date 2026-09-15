import { createHmac } from "node:crypto";
import { isIP } from "node:net";

const OWNER_PATTERN = /^[a-f0-9]{24}$/;
const FORWARD_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const LABEL_PATTERN = /^f-([a-f0-9]{24})-([a-f0-9]{32})$/;

function parseAuthority(authority: string): URL | null {
  if (!/^[a-z0-9.-]+(?::[0-9]+)?$/i.test(authority)) return null;
  try {
    return new URL(`https://${authority}`);
  } catch {
    return null;
  }
}

/** Previously minted origins remain reserved after ingress configuration changes
 * or disappears; they must never start serving the host's own API. */
export function isForwardOriginAuthority(authority: string): boolean {
  const url = parseAuthority(authority);
  return url !== null && LABEL_PATTERN.test(url.hostname.split(".")[0] ?? "");
}

/** Bind the namespace to a dedicated random 32-byte origin secret, never the relay password. */
export function deriveForwardOwner(originSecret: string, serverId: string): string {
  const key = Buffer.from(originSecret, "base64url");
  if (key.length !== 32 || key.toString("base64url") !== originSecret || !serverId) {
    throw new Error(
      "Forward origin ownership requires a canonical 32-byte origin secret and host ID.",
    );
  }
  return createHmac("sha256", key)
    .update("poracode-forward-origin-v1\0")
    .update(serverId)
    .digest("hex")
    .slice(0, 24);
}

/** Configured HTTPS authority only. DNS, certificate and cookie-site deployment
 * validation remain separate; this parser does not establish public-suffix isolation. */
export class ForwardOriginPolicy {
  readonly baseUrl: string;
  private readonly hostname: string;
  private readonly port: string;

  constructor(value: string) {
    const url = new URL(value);
    const labels = url.hostname.split(".");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      isIP(url.hostname) ||
      url.hostname.length > 193 ||
      labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
    )
      throw new Error(
        "Forward base URL must be an HTTPS DNS origin without a path or credentials.",
      );
    this.baseUrl = url.origin;
    this.hostname = url.hostname;
    this.port = url.port;
  }

  originFor(ownerId: string, forwardId: string): string {
    if (!OWNER_PATTERN.test(ownerId) || !FORWARD_PATTERN.test(forwardId)) {
      throw new Error("Invalid forward origin identity.");
    }
    const label = `f-${ownerId}-${forwardId.replaceAll("-", "")}`;
    return `https://${label}.${this.hostname}${this.port ? `:${this.port}` : ""}`;
  }

  /** Includes malformed child labels and wrong ports so callers cannot fall
   * through to application/API handlers when exact resolution fails. */
  containsHostname(authority: string): boolean {
    const url = parseAuthority(authority);
    if (!url) return false;
    const hostname = url.hostname.replace(/\.$/, "");
    return hostname === this.hostname || hostname.endsWith(`.${this.hostname}`);
  }

  resolveAuthority(authority: string): { ownerId: string; forwardId: string } | null {
    const url = parseAuthority(authority);
    if (!url) return null;
    if (url.port !== this.port || !url.hostname.endsWith(`.${this.hostname}`)) return null;
    const label = url.hostname.slice(0, -(this.hostname.length + 1));
    const match = LABEL_PATTERN.exec(label);
    if (!match) return null;
    const hex = match[2]!;
    return {
      ownerId: match[1]!,
      forwardId: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
    };
  }
}
