import { z } from "zod";
import { pluginCatalogEntrySchema, type PluginCatalogEntry } from "../contracts/pluginCatalog";

export const RECOMMENDED_PLUGIN_CATALOGS = [
  { name: "Claude", url: "https://github.com/anthropics/claude-plugins-official.git" },
  { name: "Codex", url: "https://github.com/openai/plugins.git" },
  { name: "Cursor", url: "https://github.com/cursor/plugins.git" },
  { name: "ZCode", url: "https://github.com/zai-org/zcode-plugins.git" },
] as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Public HTTPS repositories only; credentials and custom Git transports are not catalog data. */
export function publicPluginRepository(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error(
      "Plugin repositories require an HTTPS URL without credentials, query, or fragment.",
    );
  }
  return url.href;
}

/** Catalogs share source shapes; no provider config or provider credentials are imported. */
export function parsePluginMarketplace(value: unknown): {
  name: string;
  entries: PluginCatalogEntry[];
} {
  const catalog = z.object({ name: z.string().min(1), plugins: z.array(z.unknown()) }).parse(value);
  const record = isRecord(value) ? value : {};
  const metadata = isRecord(record.metadata) ? record.metadata : {};
  const interfaceMetadata = isRecord(record.interface) ? record.interface : {};
  // Codex-style catalogs carry a parser-facing `name` plus a human display name
  // under `interface`; prefer the display name for source attribution.
  const displayName = [interfaceMetadata.displayName, record.displayName]
    .map((candidate) => (typeof candidate === "string" ? candidate.trim() : ""))
    .find((candidate) => candidate.length > 0)
    ?.slice(0, 120);
  const prefix =
    isRecord(value) && typeof value.pluginRoot === "string"
      ? value.pluginRoot
      : typeof metadata.pluginRoot === "string"
        ? metadata.pluginRoot
        : "";
  const names = new Set<string>();
  const entries = catalog.plugins.map((raw) => {
    if (!isRecord(raw)) throw new Error("Invalid plugin catalog entry.");
    const unavailable: string[] = [];
    const policy = isRecord(raw.policy) ? raw.policy : {};
    if (policy.installation === "NOT_AVAILABLE") unavailable.push("installation-policy");
    if (raw.dependencies && (!Array.isArray(raw.dependencies) || raw.dependencies.length > 0))
      unavailable.push("dependencies");
    let source: PluginCatalogEntry["source"];
    const input = raw.source;
    if (typeof input === "string") {
      source = { type: "path", path: [prefix, input].filter(Boolean).join("/") };
    } else if (
      isRecord(input) &&
      ["local", "directory"].includes(String(input.source)) &&
      typeof input.path === "string"
    ) {
      source = { type: "path", path: [prefix, input.path].filter(Boolean).join("/") };
    } else if (
      isRecord(input) &&
      (input.type === "zip" || input.sha256 !== undefined || input.headers !== undefined)
    ) {
      source = {
        type: "unsupported",
        kind: input.type === "zip" ? "archive" : "source-authentication",
      };
      unavailable.push(input.type === "zip" ? "archive" : "source-authentication");
    } else if (
      isRecord(input) &&
      ["git", "git-subdir", "github", "url"].includes(String(input.source))
    ) {
      const url =
        input.source === "github" && typeof input.repo === "string"
          ? `https://github.com/${input.repo}.git`
          : input.url;
      if (typeof url !== "string") throw new Error("Invalid plugin repository.");
      source = {
        type: "git",
        url: publicPluginRepository(url),
        path: typeof input.path === "string" ? input.path : ".",
        ...(typeof input.ref === "string" ? { ref: input.ref } : {}),
        ...(typeof input.sha === "string" ? { sha: input.sha } : {}),
      };
    } else {
      source = {
        type: "unsupported",
        kind: isRecord(input) ? String(input.source) : "missing-source",
      };
      unavailable.push("source");
    }
    const category =
      typeof raw.category === "string"
        ? raw.category.trim().replace(/\s+/gu, " ").slice(0, 80)
        : "";
    const entry = pluginCatalogEntrySchema.parse({
      name: raw.name,
      description: typeof raw.description === "string" ? raw.description : "",
      ...(category ? { category } : {}),
      ...(typeof raw.version === "string" ? { version: raw.version } : {}),
      source,
      unavailable,
    });
    if (names.has(entry.name)) throw new Error(`Duplicate plugin catalog entry '${entry.name}'.`);
    names.add(entry.name);
    return entry;
  });
  return { name: displayName ?? catalog.name, entries };
}
