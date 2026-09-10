import type { ProjectLocation } from "@/shared/contracts";
import { readAgentCommandOutput } from "../base";
import { parseDevinModelCatalog, type DevinModelFamily } from "./models";

const catalogs = new Map<string, DevinModelFamily[]>();
const key = (location: ProjectLocation) =>
  location.kind === "wsl" ? `wsl:${location.distro}` : location.kind;
export function cachedDevinModels(location: ProjectLocation): DevinModelFamily[] {
  return catalogs.get(key(location)) ?? [];
}
export async function loadDevinModels(
  location: ProjectLocation,
  executable = "devin",
  signal?: AbortSignal,
) {
  const result = await readAgentCommandOutput(
    location,
    executable,
    ["models", "list", "--format", "json"],
    { timeoutMs: 30_000, ...(signal ? { signal } : {}) },
  );
  if (!result.ok) throw new Error("Unable to read Devin model catalog");
  const families = parseDevinModelCatalog(result.stdout);
  catalogs.set(key(location), families);
  return families;
}
