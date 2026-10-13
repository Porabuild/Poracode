import { createHash } from "node:crypto";
import type { ResolvedMcpServer } from "@/shared/contracts";

function envTokenSegment(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/gu, "_")
    .replace(/^_+|_+$/gu, "");
}

export function envIdentityHash(...values: string[]): string {
  return createHash("sha256")
    .update(JSON.stringify(values))
    .digest("hex")
    .slice(0, 16)
    .toUpperCase();
}

export function envLabel(value: string, fallback: string): string {
  return (envTokenSegment(value) || fallback).slice(0, 32);
}

/** A readable, stable name for settings paths that require one key segment. */
export function mcpSettingsServerName(server: Pick<ResolvedMcpServer, "id" | "name">): string {
  const normalized = server.name.replace(/[^A-Za-z0-9_-]/gu, "_").replace(/^_+|_+$/gu, "");
  if (normalized === server.name) return normalized;
  return `${normalized || "server"}_${envIdentityHash(server.name, server.id).slice(0, 8).toLowerCase()}`;
}
