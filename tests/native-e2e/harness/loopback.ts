import { LOOPBACK_HOST } from "./constants.ts";

const LOOPBACK_BIND_HOSTS = new Set(["127.0.0.1", "::1"]);

export function isLoopbackBindHost(host: string): boolean {
  return LOOPBACK_BIND_HOSTS.has(host.trim().toLowerCase());
}

/** Control, wire-lab, and production hosts may bind loopback only. */
export function assertLoopbackHost(host: string, label = "native-e2e host"): string {
  const normalized = host.trim();
  if (!isLoopbackBindHost(normalized)) {
    throw new Error(`${label} must bind loopback-only (${LOOPBACK_HOST} or ::1), got ${host}`);
  }
  return normalized;
}
