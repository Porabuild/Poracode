import { lstatSync } from "node:fs";
import { dirname } from "node:path";
import {
  decodeAgentStatusCache,
  STATUS_CACHE_VERSION,
  type AgentStatusCacheSnapshot,
} from "@/shared/agentStatusCache";
import { readBoundedRuntimeFileSync } from "@/shared/readBoundedRuntimeFile";
import {
  HOST_PROVIDER_INVENTORY_FORMAT_VERSION,
  hostProviderInventorySchema,
} from "@/shared/contracts/hostProviderInventory";
import type { HostAdminCommand } from "@/shared/hostAdminProtocol";
import type { SharedSettings } from "@/shared/settings";
import { adminProviderSummary, type AdminSupervisorCall } from "./hostProviderAuth";

const MAX_OBSERVATION_CACHE_BYTES = 8 * 1024 * 1024;

function readObservationCache(path: string): AgentStatusCacheSnapshot {
  try {
    if (!lstatSync(dirname(path)).isDirectory() || !lstatSync(path).isFile())
      throw new Error("Provider cache is not an owned regular file.");
    return decodeAgentStatusCache(
      JSON.parse(readBoundedRuntimeFileSync(path, MAX_OBSERVATION_CACHE_BYTES).toString("utf8")),
    );
  } catch (error) {
    return {
      state:
        error instanceof SyntaxError
          ? "invalid"
          : error && typeof error === "object" && "code" in error && error.code === "ENOENT"
            ? "missing"
            : "unavailable",
      version: null,
      statuses: { windows: [], wsl: [], fromCache: false },
    };
  }
}

export async function inspectProviderInventory(
  command: Extract<HostAdminCommand, { action: "providers-inventory" }>,
  options: { statusCachePath: string; call: AdminSupervisorCall; readSettings(): SharedSettings },
) {
  const cache = readObservationCache(options.statusCachePath);
  if (command.refresh && cache.state === "unavailable")
    throw new Error(
      "Saved provider cache could not be safely inspected. Check its file type, size and permissions with a compatible host before refresh; no discovery was started.",
    );
  if (command.refresh && cache.version !== null && cache.version > STATUS_CACHE_VERSION)
    throw new Error(
      `Saved provider cache v${cache.version} needs a compatible host. No refresh was started.`,
    );
  const response = command.refresh
    ? await options.call("refreshAgentStatuses", {
        wslDistros: command.wslDistro ? [command.wslDistro] : [],
      })
    : cache.statuses;
  const nativeEnv = process.platform === "win32" ? "windows" : "posix";
  return hostProviderInventorySchema.parse({
    formatVersion: HOST_PROVIDER_INVENTORY_FORMAT_VERSION,
    environment: command.wslDistro
      ? { kind: "wsl", distro: command.wslDistro }
      : { kind: "native" },
    observation: command.refresh
      ? { source: "refresh" }
      : { source: "saved-cache", state: cache.state, version: cache.version },
    providers: [...response.windows, ...response.wsl]
      .filter((status) =>
        command.wslDistro
          ? status.envKind === "wsl" && status.envDistro === command.wslDistro
          : status.envKind === undefined || status.envKind === nativeEnv,
      )
      .map(adminProviderSummary),
    configurationScope: "host",
    profiles: Object.values(options.readSettings().agentInstances).map((instance) => ({
      id: instance.id,
      driver: instance.driver,
      displayName: instance.displayName ?? instance.id,
      enabled: instance.enabled !== false,
      environmentNames: Object.keys(instance.environment ?? {}),
    })),
  });
}
