import { z } from "zod";
import { parsePairingUrlParts } from "@/shared/remote/pairingUrl";

const sshTargetPattern = /^(?!-)(?:[^\s@/:]+@)?[^\s@/:]+$/;

/** Durable SSH launch settings. Authentication is delegated to OpenSSH. */
export const sshConnectionConfigSchema = z.object({
  id: z.uuid(),
  label: z.string().trim().min(1).max(100),
  target: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .regex(sshTargetPattern, "Enter an SSH host, alias, or user@host."),
  port: z.number().int().min(1).max(65_535).optional(),
  identityFile: z.string().trim().min(1).max(4_096).optional(),
  authentication: z.enum(["system", "password", "private-key"]).optional(),
  hostKeyFingerprint: z
    .string()
    .regex(/^SHA256:[A-Za-z0-9+/]{43}$/, "Enter a valid SHA-256 SSH host key fingerprint.")
    .optional(),
});
export type SshConnectionConfig = z.infer<typeof sshConnectionConfigSchema>;

export function splitSshTarget(target: string): {
  readonly host: string;
  readonly username?: string;
} {
  const separator = target.indexOf("@");
  if (separator < 0) return { host: target };
  return { username: target.slice(0, separator), host: target.slice(separator + 1) };
}

export const sshDiscoveredHostSchema = z.object({
  alias: z.string().min(1),
});
export type SshDiscoveredHost = z.infer<typeof sshDiscoveredHostSchema>;

export const sshConnectPayloadSchema = z.object({
  connection: sshConnectionConfigSchema,
  issuePairingCredential: z.boolean().optional(),
});
export type SshConnectPayload = z.infer<typeof sshConnectPayloadSchema>;

export const sshConnectResultSchema = z.object({
  connectionId: z.uuid(),
  endpoint: z.url(),
  remotePort: z.number().int().min(1).max(65_535),
  pairingCredential: z.string().min(1).optional(),
});
export type SshConnectResult = z.infer<typeof sshConnectResultSchema>;

export const sshDisconnectPayloadSchema = z.object({
  connectionId: z.uuid(),
});
export type SshDisconnectPayload = z.infer<typeof sshDisconnectPayloadSchema>;

/**
 * Scan the remote script's stdout bottom-up for the last line that parses as
 * JSON. A login shell can emit a banner (motd, prompt) before the JSON result,
 * so the payload is always the last well-formed object.
 */
export function parseLastJsonObject<T>(stdout: string): T {
  const lines = stdout
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]!) as T;
    } catch {
      // Keep looking; login shells can emit a banner before the JSON result.
    }
  }
  throw new Error("The remote Poracode command returned no JSON result.");
}

/** Parse a `{ remotePort }` launch result, validating the port range. */
export function parseRemoteLaunchPort(stdout: string): number {
  const port = parseLastJsonObject<{ remotePort?: unknown }>(stdout).remotePort;
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("The remote Poracode server returned an invalid port.");
  }
  return port;
}

/** Extract the one-time pairing credential from a `{ pairingUrl }` result. */
export function parsePairingCredential(stdout: string): string {
  const pairingUrl = parseLastJsonObject<{ pairingUrl?: unknown }>(stdout).pairingUrl;
  if (typeof pairingUrl !== "string") {
    throw new Error("The remote Poracode server returned no pairing URL.");
  }
  const credential = parsePairingUrlParts(pairingUrl)?.token.trim();
  if (!credential) throw new Error("The remote Poracode pairing URL contained no credential.");
  return credential;
}
