import type {
  AgentStatus,
  GetLatestAgentVersionResult,
  NpmPackageVersionQuery,
  UpdateAgentBinaryResult,
} from "@/shared/contracts";
import {
  formatUpdateCommandLine,
  getNpmPackageNameForUpdate,
  pickLatestVersionInWindow,
  resolveSharedUpdateCommand,
} from "@/shared/agents/updateResolver";
import type { AgentAdapter, AgentEnvContext, AgentUpdaterCommand } from "./base";
import { detectProbeLocation, readAgentCommandOutput } from "./base";

/**
 * Resolve the update command for `(adapter, env, status)`.
 *
 * Priority:
 *   1. `adapter.buildUpdateCommand` — adapter-supplied built-in updater
 *      override. Kept as an escape hatch even though the shared resolver also
 *      knows about the common `claude update` / `opencode upgrade` flows.
 *   2. The shared resolver's strategy chain (built-in → brew/winget → pnpm /
 *      bun / npm global → npm last-resort), kept in sync with the renderer's
 *      tooltip preview by import.
 */
export function resolveUpdateCommand(
  adapter: AgentAdapter,
  status: AgentStatus,
  envContext: AgentEnvContext,
  options?: { skipBuiltIn?: boolean },
): AgentUpdaterCommand | undefined {
  const fromAdapter = adapter.buildUpdateCommand?.(envContext, status);
  if (fromAdapter && !(options?.skipBuiltIn && fromAdapter.strategy === "built-in")) {
    return fromAdapter;
  }

  const command = resolveSharedUpdateCommand({
    update: status.update ?? adapter.update,
    executablePath: status.executablePath,
    envKind: envContext.envKind,
    ...(options?.skipBuiltIn ? { skipBuiltIn: true } : {}),
  });
  if (!command) return undefined;
  return command;
}

/**
 * Truncate `output` to a renderer-friendly tail so update IPC responses stay
 * small even when the underlying tool (npm, brew) emits paragraphs of log.
 */
function trimOutput(output: string, max = 4096): string {
  if (output.length <= max) return output;
  return `…\n${output.slice(output.length - max)}`;
}

function withFallbackFailureOutput(
  builtIn: AgentUpdaterCommand,
  builtInOutput: string,
  fallback: AgentUpdaterCommand,
  fallbackOutput: string,
): string {
  return trimOutput(
    [
      `Built-in updater failed (${formatUpdateCommandLine(builtIn)}):`,
      builtInOutput.trim() || "(no output)",
      `Fallback updater failed (${formatUpdateCommandLine(fallback)}):`,
      fallbackOutput.trim() || "(no output)",
    ].join("\n"),
  );
}

export async function runUpdateCommand(
  command: AgentUpdaterCommand,
  envContext: AgentEnvContext,
): Promise<{ ok: boolean; output: string }> {
  const location = detectProbeLocation(envContext);
  const result = await readAgentCommandOutput(location, command.binary, command.args, {
    timeoutMs: 5 * 60 * 1000,
  });

  const combined = [result.stdout, result.stderr].filter((s) => s.length > 0).join("\n");
  return { ok: result.ok, output: trimOutput(combined) };
}

export function buildUnsupportedResult(): UpdateAgentBinaryResult {
  return {
    ok: false,
    strategy: "unsupported",
    output: "No updater available for this agent in this environment.",
  };
}

export async function runUpdateCommandWithFallback(
  adapter: AgentAdapter,
  status: AgentStatus,
  envContext: AgentEnvContext,
): Promise<UpdateAgentBinaryResult> {
  const command = resolveUpdateCommand(adapter, status, envContext);
  if (!command) return buildUnsupportedResult();

  try {
    const result = await runUpdateCommand(command, envContext);
    if (result.ok || command.strategy !== "built-in") {
      return {
        ok: result.ok,
        strategy: command.strategy,
        ...(result.output ? { output: result.output } : {}),
      };
    }

    const fallback = resolveUpdateCommand(adapter, status, envContext, { skipBuiltIn: true });
    if (!fallback || fallback.strategy === "built-in") {
      return {
        ok: false,
        strategy: command.strategy,
        ...(result.output ? { output: result.output } : {}),
      };
    }

    const fallbackResult = await runUpdateCommand(fallback, envContext);
    return {
      ok: fallbackResult.ok,
      strategy: fallback.strategy,
      ...(fallbackResult.ok
        ? fallbackResult.output
          ? { output: fallbackResult.output }
          : {}
        : {
            output: withFallbackFailureOutput(
              command,
              result.output,
              fallback,
              fallbackResult.output,
            ),
          }),
    };
  } catch (error) {
    return {
      ok: false,
      strategy: command.strategy,
      output: error instanceof Error ? error.message : String(error),
    };
  }
}

const LATEST_VERSION_TTL_MS = 30 * 60 * 1000;

interface LatestVersionCacheEntry {
  ts: number;
  result: GetLatestAgentVersionResult;
}

const latestVersionCache = new Map<string, LatestVersionCacheEntry>();

/**
 * GET a JSON document from the npm registry. Best-effort: HTTP errors, aborts
 * and malformed responses are logged and resolve to undefined so no caller has
 * to handle a rejection.
 */
async function fetchNpmRegistryJson(
  url: string,
  accept: string,
  pkg: string,
): Promise<unknown | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept } });
    if (!response.ok) {
      console.warn(`[updateAgent] npm registry probe failed for ${pkg}: HTTP ${response.status}`);
      return undefined;
    }
    return await response.json();
  } catch (error) {
    console.warn(
      `[updateAgent] npm registry probe for ${pkg} threw: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchNpmLatestVersion(pkg: string): Promise<string | undefined> {
  const data = (await fetchNpmRegistryJson(
    `https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`,
    "application/json",
    pkg,
  )) as { version?: unknown } | undefined;
  if (!data) return undefined;
  if (typeof data.version === "string" && data.version.length > 0) {
    return data.version;
  }
  console.warn(`[updateAgent] npm registry probe for ${pkg} returned no version`);
  return undefined;
}

/**
 * The abbreviated packument: same version list as the full document, a fraction
 * of the bytes (no READMEs, no per-version metadata we don't read).
 */
const NPM_ABBREVIATED_DOCUMENT_ACCEPT = "application/vnd.npm.install-v1+json";

async function fetchNpmPublishedVersions(pkg: string): Promise<string[] | undefined> {
  const data = (await fetchNpmRegistryJson(
    `https://registry.npmjs.org/${encodeURIComponent(pkg)}`,
    NPM_ABBREVIATED_DOCUMENT_ACCEPT,
    pkg,
  )) as { versions?: unknown } | undefined;
  if (!data) return undefined;
  const versions = data.versions;
  if (typeof versions !== "object" || versions === null) {
    console.warn(`[updateAgent] npm registry probe for ${pkg} returned no versions`);
    return undefined;
  }
  return Object.keys(versions);
}

function parseHomebrewCaskVersion(source: string): string | undefined {
  const match = /^\s*version\s+"([^"]+)"/m.exec(source);
  return match?.[1];
}

async function fetchHomebrewCaskLatestVersion(cask: string): Promise<string | undefined> {
  const first = cask[0]?.toLowerCase();
  if (!first || !/^[a-z0-9]$/.test(first)) return undefined;

  const url = `https://raw.githubusercontent.com/Homebrew/homebrew-cask/HEAD/Casks/${first}/${encodeURIComponent(cask)}.rb`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "text/plain" },
    });
    clearTimeout(timer);
    if (!response.ok) {
      console.warn(`[updateAgent] Homebrew cask probe failed for ${cask}: HTTP ${response.status}`);
      return undefined;
    }
    const version = parseHomebrewCaskVersion(await response.text());
    if (version) return version;
    console.warn(`[updateAgent] Homebrew cask probe for ${cask} returned no version`);
    return undefined;
  } catch (error) {
    console.warn(
      `[updateAgent] Homebrew cask probe for ${cask} threw: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

async function fetchLatestVersionFromUrls(urls: readonly string[]): Promise<string | undefined> {
  const parseVersion = (body: string): string | undefined => {
    const trimmed = body.trim();
    try {
      const data = JSON.parse(trimmed) as { version?: unknown; tag_name?: unknown; name?: unknown };
      const value =
        typeof data.version === "string"
          ? data.version
          : typeof data.tag_name === "string"
            ? data.tag_name
            : data.name;
      return typeof value === "string" && value.length > 0 ? value.replace(/^v/, "") : undefined;
    } catch {
      return trimmed;
    }
  };

  for (const url of urls) {
    let timer: NodeJS.Timeout | undefined;
    try {
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { accept: "text/plain" },
      });
      if (!response.ok) {
        console.warn(`[updateAgent] version URL probe failed for ${url}: HTTP ${response.status}`);
        continue;
      }
      const version = parseVersion(await response.text());
      if (version) return version;
      console.warn(`[updateAgent] version URL probe for ${url} returned no version`);
    } catch (error) {
      console.warn(
        `[updateAgent] version URL probe for ${url} threw: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  return undefined;
}

/**
 * Resolve the latest published version for an agent kind. Used by the UI to
 * decide whether to surface the update button. Cached for `LATEST_VERSION_TTL_MS`
 * so the same kind doesn't hammer upstream registries across panel re-mounts.
 *
 * Returns `{ version: undefined }` for unknown kinds or network failures —
 * callers should treat that as "no update info available" and fall back to
 * hiding the button.
 */
export async function getLatestVersionForAdapter(
  adapter: AgentAdapter,
): Promise<GetLatestAgentVersionResult> {
  const agentKind = adapter.kind;
  const cached = latestVersionCache.get(agentKind);
  if (cached && Date.now() - cached.ts < LATEST_VERSION_TTL_MS) {
    return cached.result;
  }

  const npmName = getNpmPackageNameForUpdate(adapter.update);
  let result: GetLatestAgentVersionResult = { source: "unknown" };
  if (adapter.update?.latestVersionUrls?.length) {
    const version = await fetchLatestVersionFromUrls(adapter.update.latestVersionUrls);
    if (version) {
      result = { version, source: "version-url" };
    }
  } else if (adapter.update?.homebrewCask) {
    const version = await fetchHomebrewCaskLatestVersion(adapter.update.homebrewCask);
    if (version) {
      result = { version, source: "homebrew-cask" };
    }
  } else if (npmName) {
    const version = await fetchNpmLatestVersion(npmName);
    if (version) {
      result = { version, source: "npm" };
    }
  }
  latestVersionCache.set(agentKind, { ts: Date.now(), result });
  return result;
}

const npmPackageVersionCache = new Map<string, LatestVersionCacheEntry>();

/**
 * Resolve the newest published version of a provider-managed npm package that
 * still falls inside the caller's supported window (`minVersion` /
 * `maxExclusiveMajor`). Unlike `getLatestVersionForAdapter` this is not tied to
 * an agent's own release channel — it serves settings rows that install an
 * extra package next to the CLI (e.g. Cursor's `@cursor/sdk`), which must not
 * be offered an update to a major the runtime cannot load.
 *
 * Cached for `LATEST_VERSION_TTL_MS` per package + window. Best-effort: never
 * throws, and returns `{ source: "unknown" }` when the registry is unreachable
 * or publishes nothing supported.
 */
export async function getLatestSupportedNpmPackageVersion(
  query: NpmPackageVersionQuery,
): Promise<GetLatestAgentVersionResult> {
  const cacheKey = `${query.name}|${query.minVersion ?? ""}|${query.maxExclusiveMajor ?? ""}`;
  const cached = npmPackageVersionCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < LATEST_VERSION_TTL_MS) {
    return cached.result;
  }

  const published = await fetchNpmPublishedVersions(query.name);
  const version = published
    ? pickLatestVersionInWindow(published, {
        ...(query.minVersion ? { minVersion: query.minVersion } : {}),
        ...(query.maxExclusiveMajor !== undefined
          ? { maxExclusiveMajor: query.maxExclusiveMajor }
          : {}),
      })
    : undefined;
  const result: GetLatestAgentVersionResult = version
    ? { version, source: "npm" }
    : { source: "unknown" };
  npmPackageVersionCache.set(cacheKey, { ts: Date.now(), result });
  return result;
}

/**
 * Test hook: wipe the latest-version caches. Not used in product code.
 */
export function clearLatestVersionCache(): void {
  latestVersionCache.clear();
  npmPackageVersionCache.clear();
}
