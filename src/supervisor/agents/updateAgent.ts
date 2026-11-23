import type {
  AgentStatus,
  GetLatestAgentVersionResult,
  NpmPackageVersionQuery,
  UpdateAgentBinaryResult,
} from "@/shared/contracts";
import {
  formatUpdateCommandLine,
  getNpmPackageNameForUpdate,
  isVersionInWindow,
  pickLatestVersionInWindow,
  resolveSharedUpdateCommand,
} from "@/shared/agents/updateResolver";
import type { AgentAdapter, AgentEnvContext, AgentUpdaterCommand } from "./base";
import { decodePowerShellClixml, detectProbeLocation, readAgentCommandOutput } from "./base";
import { AGENT_UPDATE_COMMAND_TIMEOUT_MS } from "@/shared/agents/updatePolicy";
import { resolveAgentBinaryPath } from "./binaryResolver";
import { runSerializedAgentUpdate, runSerializedUpdateCommand } from "./updateSerialization";
import { resolveUpdateInstallPath } from "./updateInstallPath";

/**
 * Resolve the update command for `(adapter, env, status)`.
 *
 * Priority:
 *   1. `adapter.buildUpdateCommand` — adapter-supplied updater
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
  options?: { skipBuiltIn?: boolean; installPath?: string | undefined },
): AgentUpdaterCommand | undefined {
  const fromAdapter = adapter.buildUpdateCommand?.(envContext, status, options?.installPath);
  if (fromAdapter && !(options?.skipBuiltIn && fromAdapter.strategy === "built-in")) {
    return fromAdapter;
  }

  const update = status.update ?? adapter.update;
  // When `installPath` (realpath) differs from `status.executablePath` and
  // unambiguously identifies a package manager — for example
  // `/opt/homebrew/lib/node_modules/...` (Homebrew's npm) vs
  // `/opt/homebrew/Cellar/...` (Homebrew formula) vs `/usr/local/Cellar/...`
  // (Intel Homebrew) — prefer it over the symlink path. Fall back to
  // `status.executablePath` when the symlink target sits outside standard
  // package-manager trees (e.g. a Homebrew cask pointing into `/Applications`).
  const installPath = options?.installPath;
  if (installPath && installPath !== status.executablePath) {
    const installPathManager = resolveSharedUpdateCommand({
      update,
      executablePath: installPath,
      envKind: envContext.envKind,
      installedPackageManagerOnly: true,
    });
    if (installPathManager) {
      if (options?.skipBuiltIn || !update?.builtIn) {
        return installPathManager;
      }
      return resolveSharedUpdateCommand({
        update,
        executablePath: installPath,
        envKind: envContext.envKind,
      });
    }
  }

  return resolveSharedUpdateCommand({
    update,
    executablePath: status.executablePath,
    envKind: envContext.envKind,
    ...(options?.skipBuiltIn ? { skipBuiltIn: true } : {}),
  });
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
  installCommand: AgentUpdaterCommand,
  waitDeadline: number,
): Promise<{ ok: boolean; output: string }> {
  return runSerializedUpdateCommand(installCommand, envContext, waitDeadline, async () => {
    const location = detectProbeLocation(envContext);
    const result = await readAgentCommandOutput(location, command.binary, command.args, {
      timeoutMs: AGENT_UPDATE_COMMAND_TIMEOUT_MS,
    });

    const combined = [result.stdout, result.stderr].filter((s) => s.length > 0).join("\n");
    return { ok: result.ok, output: trimOutput(combined) };
  });
}

const POST_UPDATE_HEALTH_TIMEOUT_MS = 30_000;
/** Upper bound for each log excerpt in a health-check failure, keeping the whole message well under `trimOutput`'s cap. */
const DETAIL_MAX_CHARS = 1_200;

/**
 * Confirm the updated CLI still starts when the adapter declares
 * `postUpdateHealthArgs`. A package manager can exit 0 while leaving a launcher
 * whose optional native dependency was skipped, so an update that "succeeded"
 * is only reported once the binary runs. A failing check re-runs the update
 * command that just succeeded once (a plain re-run installs the missing piece);
 * a self-updater is not re-run, since it owns its own install.
 */
async function verifyUpdatedInstall(
  adapter: AgentAdapter,
  status: AgentStatus,
  envContext: AgentEnvContext,
  applied: AgentUpdaterCommand,
  result: UpdateAgentBinaryResult,
  waitDeadline: number,
): Promise<UpdateAgentBinaryResult> {
  const healthArgs = adapter.postUpdateHealthArgs;
  const executable = status.executablePath;
  if (!result.ok || !healthArgs?.length || !executable) return result;

  const location = detectProbeLocation(envContext);
  const checkHealth = () =>
    readAgentCommandOutput(location, executable, [...healthArgs], {
      timeoutMs: POST_UPDATE_HEALTH_TIMEOUT_MS,
      ...(adapter.baseSpawnEnv ? { env: adapter.baseSpawnEnv } : {}),
    });

  let health = await checkHealth();
  if (health.ok) return result;

  let repairNote: string | undefined;
  if (applied.strategy !== "built-in") {
    const rerun = `Re-running ${formatUpdateCommandLine(applied)}`;
    try {
      const repair = await runUpdateCommand(applied, envContext, applied, waitDeadline);
      if (repair.ok) {
        health = await checkHealth();
        if (health.ok) return { ...result, ...(repair.output ? { output: repair.output } : {}) };
        repairNote = `${rerun} did not repair it.`;
      } else {
        repairNote = `${rerun} failed:\n${trimOutput(repair.output.trim() || "(no output)", DETAIL_MAX_CHARS)}`;
      }
    } catch (error) {
      // The queue deadline can lapse during a long first command; keep the diagnosis.
      repairNote = `${rerun} could not run: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  const diagnostics = decodePowerShellClixml(
    [health.stderr, health.stdout].filter((text) => text.trim().length > 0).join("\n"),
  ).trim();
  // Renderers show only the start of `output`: lead with the reason, not the path,
  // and bound each detail block so a long log can never push the lead out.
  return {
    ok: false,
    strategy: applied.strategy,
    output: [
      `The update finished but the installed CLI does not start: ${summarizeFailure(diagnostics)}`,
      ...(repairNote ? [repairNote] : []),
      `${[executable, ...healthArgs].join(" ")} printed:`,
      trimOutput(diagnostics || "(no output)", DETAIL_MAX_CHARS),
    ].join("\n"),
  };
}

/** The first line that names an error, else the first line: launcher stack traces open with source-line noise. */
function summarizeFailure(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const line =
    lines.find((candidate) => /^[a-z]*error\b/i.test(candidate)) ?? lines[0] ?? "(no output)";
  return line.length > 160 ? `${line.slice(0, 157)}...` : line;
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
  options?: { verifyBuiltInSuccess?: () => Promise<boolean> },
): Promise<UpdateAgentBinaryResult> {
  const installPath = await resolveUpdateInstallPath(status.executablePath, envContext);
  let command = resolveUpdateCommand(adapter, status, envContext, { installPath });
  if (!command) return buildUnsupportedResult();

  let fallback =
    command.strategy === "built-in"
      ? resolveUpdateCommand(adapter, status, envContext, { skipBuiltIn: true, installPath })
      : undefined;
  if (
    envContext.envKind === "windows" &&
    [command, fallback].some((entry) => entry?.strategy === "pnpm-global")
  ) {
    const npm = getNpmPackageNameForUpdate(status.update ?? adapter.update);
    const { version } = await getLatestVersionForAdapter(adapter);
    if (npm && version && isVersionInWindow(version, {})) {
      // pnpm can reuse a stale latest-tag resolution even after a successful
      // install. Use the exact published version already advertised by the app.
      const pinVersion = (entry: AgentUpdaterCommand): AgentUpdaterCommand =>
        entry.strategy === "pnpm-global"
          ? {
              ...entry,
              args: entry.args.map((arg) => (arg === `${npm}@latest` ? `${npm}@${version}` : arg)),
            }
          : entry;
      command = pinVersion(command);
      fallback = fallback ? pinVersion(fallback) : undefined;
    }
  }
  const installedManager =
    command.strategy === "built-in"
      ? [installPath, status.executablePath]
          .map((executablePath) =>
            resolveSharedUpdateCommand({
              update: status.update ?? adapter.update,
              executablePath,
              envKind: envContext.envKind,
              installedPackageManagerOnly: true,
            }),
          )
          .find((manager) => manager !== undefined)
      : undefined;
  try {
    return await runSerializedAgentUpdate(
      status,
      envContext,
      async (waitDeadline): Promise<UpdateAgentBinaryResult> => {
        const result = await runUpdateCommand(
          command,
          envContext,
          installedManager ?? command,
          waitDeadline,
        );
        const verify = (applied: AgentUpdaterCommand, outcome: UpdateAgentBinaryResult) =>
          verifyUpdatedInstall(adapter, status, envContext, applied, outcome, waitDeadline);
        const needsFallback =
          command.strategy === "built-in" &&
          (!result.ok ||
            (options?.verifyBuiltInSuccess ? !(await options.verifyBuiltInSuccess()) : false));
        if (!needsFallback) {
          return verify(command, {
            ok: result.ok,
            strategy: command.strategy,
            ...(result.output ? { output: result.output } : {}),
          });
        }

        if (!fallback || fallback.strategy === "built-in") {
          return {
            ok: false,
            strategy: command.strategy,
            ...(result.output ? { output: result.output } : {}),
          };
        }

        const fallbackResult = await runUpdateCommand(fallback, envContext, fallback, waitDeadline);
        return verify(fallback, {
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
        });
      },
      installPath,
    );
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
 * GET a JSON document from an upstream package registry. Best-effort: HTTP
 * errors, aborts and malformed responses are logged and resolve to undefined
 * so no caller has to handle a rejection.
 */
async function fetchRegistryJson(
  url: string,
  accept: string,
  probeKind: string,
  target: string,
): Promise<unknown | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept } });
    if (!response.ok) {
      console.warn(`[updateAgent] ${probeKind} failed for ${target}: HTTP ${response.status}`);
      return undefined;
    }
    return await response.json();
  } catch (error) {
    console.warn(
      `[updateAgent] ${probeKind} for ${target} threw: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchNpmLatestVersion(pkg: string): Promise<string | undefined> {
  const data = (await fetchRegistryJson(
    `https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`,
    "application/json",
    "npm registry probe",
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
  const data = (await fetchRegistryJson(
    `https://registry.npmjs.org/${encodeURIComponent(pkg)}`,
    NPM_ABBREVIATED_DOCUMENT_ACCEPT,
    "npm registry probe",
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

async function fetchHomebrewFormulaLatestVersion(formula: string): Promise<string | undefined> {
  const data = (await fetchRegistryJson(
    `https://formulae.brew.sh/api/formula/${encodeURIComponent(formula)}.json`,
    "application/json",
    "Homebrew formula probe",
    formula,
  )) as { versions?: { stable?: unknown } } | undefined;
  if (!data) return undefined;
  const stable = data.versions?.stable;
  if (typeof stable === "string" && stable.trim().length > 0) {
    return stable.trim();
  }
  console.warn(`[updateAgent] Homebrew formula probe for ${formula} returned no stable version`);
  return undefined;
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
      // A plain-text feed names a version. Anything else served with a 200 —
      // a block or sign-in page from an intercepting proxy — is not one, and
      // must not be advertised as an update that cannot be installed.
      return /^v?\d/.test(trimmed) ? trimmed.replace(/^v(?=\d)/, "") : undefined;
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

export interface LatestVersionAdapterOptions {
  /** Explicitly force or skip the Homebrew formula channel probe. */
  preferHomebrewFormula?: boolean;
  /** Lazily read the cached native status so Homebrew installs match their bottle channel. */
  getNativeStatus?: () => AgentStatus | undefined;
  /** Supervisor base dir for resolving symlinked native install paths. */
  baseDir?: string;
}

async function shouldUseHomebrewFormulaChannel(
  adapter: AgentAdapter,
  options?: LatestVersionAdapterOptions,
): Promise<boolean> {
  if (!adapter.update?.brew) return false;
  if (options?.preferHomebrewFormula !== undefined) return options.preferHomebrewFormula;
  if (!options?.getNativeStatus) return false;
  // Built-in updaters always outrank Homebrew unless an adapter supplies a custom builder.
  if (adapter.update.builtIn && !adapter.buildUpdateCommand) return false;

  const nativeStatus = options.getNativeStatus();
  const envKind = nativeStatus?.envKind ?? (process.platform === "win32" ? "windows" : "posix");
  if (envKind === "windows") return false;

  // Fall back to resolving the binary on PATH / well-known POSIX dirs when the
  // disk status cache is cold or invalidated while the renderer shows persisted statuses.
  const executablePath =
    nativeStatus?.executablePath ??
    (adapter.binary
      ? resolveAgentBinaryPath({ kind: "posix", path: "." }, adapter.binary)
      : undefined);
  if (!executablePath) return false;

  const envContext: AgentEnvContext = {
    envKind,
    ...(options?.baseDir ? { baseDir: options.baseDir } : {}),
  };
  const statusForResolve: AgentStatus = nativeStatus ?? {
    kind: adapter.kind,
    label: adapter.label,
    installed: true,
    authState: "unknown",
    executablePath,
    capabilities: adapter.capabilities,
    ...(adapter.update ? { update: adapter.update } : {}),
  };
  const installPath = await resolveUpdateInstallPath(executablePath, envContext);
  const command = resolveUpdateCommand(adapter, statusForResolve, envContext, { installPath });
  return command?.strategy === "brew";
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
  options?: LatestVersionAdapterOptions,
): Promise<GetLatestAgentVersionResult> {
  const agentKind = adapter.kind;
  const brewFormula = (await shouldUseHomebrewFormulaChannel(adapter, options))
    ? adapter.update?.brew
    : undefined;
  const cacheKey = brewFormula ? `${agentKind}:brew` : agentKind;
  const cached = latestVersionCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < LATEST_VERSION_TTL_MS) {
    return cached.result;
  }

  const npmName = getNpmPackageNameForUpdate(adapter.update);
  let result: GetLatestAgentVersionResult = { source: "unknown" };
  if (brewFormula) {
    // Homebrew bottles can trail npm by hours/days. When the native install is
    // managed by `brew`, report Homebrew's own formula version (without falling
    // back to npm on transient errors) so Poracode never advertises an npm
    // release that `brew upgrade` cannot install yet.
    const version = await fetchHomebrewFormulaLatestVersion(brewFormula);
    if (version) {
      // Reuse the existing `"version-url"` source tag so older remote clients
      // with strict `GetLatestAgentVersionResult` schemas accept the payload.
      result = { version, source: "version-url" };
    }
  } else if (adapter.update?.latestVersionUrls?.length) {
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
  latestVersionCache.set(cacheKey, { ts: Date.now(), result });
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
