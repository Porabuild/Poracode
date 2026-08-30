import { stripAnsi } from "@/shared/ansi";
import type { AgentCapability, AgentTerminalAuthMethod, LabeledOption } from "@/shared/contracts";
import {
  envVarAuthProbe,
  type AuthProbe,
  type DetectProbeCtx,
  type DetectionSpec,
  readAgentCommandOutput,
} from "../base";
import { getAgentProbeCwd } from "../probeCwd";
import { commandCodeHasStoredCredentials } from "./session";

// Command Code's CLI runs a background self-updater on EVERY invocation: when a
// newer npm version exists it spawns a detached `cmd.exe`/`npm i <tgz>` (see the
// CLI's `spawnBackgroundUpdate`), which Windows 11 surfaces as a stray terminal
// window — re-triggered by each launch-time detection probe. Poracode owns
// agent updates (Settings update button → `command-code update`), so we set
// `COMMANDCODE_SKIP_UPDATES` on every command-code spawn we make (detection
// probes, PTY launches, one-shots) to suppress the CLI's own updater. The CLI
// also honors `CI`, but that flips broader non-interactive behavior, so we use
// the dedicated switch. `command-code update` runs without this env (separate
// path), so explicit updates still work.
const COMMANDCODE_SKIP_UPDATES_ENV: Record<string, string> = {
  COMMANDCODE_SKIP_UPDATES: "1",
};

const COMMANDCODE_EFFORT_PROBE_VALUE = "__poracode_capability_probe__";
const COMMANDCODE_EFFORT_SENTINEL_ATTEMPTS = 2;
const COMMANDCODE_EFFORT_PROBE_CONCURRENCY = 24;
const COMMANDCODE_EFFORT_CACHE_SIZE = 8;
const COMMANDCODE_MODELS_ENDPOINT = "https://api.commandcode.ai/provider/v1/models";
const COMMANDCODE_MODEL_NAMES_TTL_MS = 5 * 60_000;

export interface ParsedCommandCodeModel {
  id: string;
  description?: string;
  isDefault?: boolean;
  providerId?: string;
  providerLabel?: string;
  isByok?: boolean;
}

// A model row is `<id><2+ spaces><tagline>`; section headers ("Open Source",
// "Anthropic") have no 2-space gap and so never match. The id guard rejects the
// `Docs:`/usage footer lines (the leading prefix skip below covers them too).
const COMMANDCODE_MODEL_LINE_RE = /^(\S+)\s{2,}(.+)$/;
const COMMANDCODE_MODEL_ID_RE = /^[A-Za-z0-9][\w./-]*$/;
const COMMANDCODE_NOISE_LINE_RE = /^(?:Available\b|Pass\b|cmd\b|Docs:|Tip:|Loading\b|Usage:)/i;

/**
 * Parse `command-code --list-models` stdout into `{id, description, isDefault}`.
 * Tolerant by design: anything that isn't a recognizable `id  tagline` row
 * (headers, blank lines, the trailing usage/docs footer) is skipped, and the
 * `(default)` / `(recommended)` markers are stripped out of the tagline.
 */
export function parseCommandCodeModels(output: string): ParsedCommandCodeModel[] {
  const parsed: ParsedCommandCodeModel[] = [];
  const seen = new Set<string>();
  let providerId: string | undefined;
  let providerLabel: string | undefined;
  let isByok = false;
  for (const rawLine of stripAnsi(output).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const byokHeader = /^(.*?)\s+\(byok\)$/i.exec(line);
    if (byokHeader) {
      providerLabel = byokHeader[1]!.trim();
      providerId = undefined;
      isByok = true;
      continue;
    }
    if (COMMANDCODE_NOISE_LINE_RE.test(line)) continue;

    const match = COMMANDCODE_MODEL_LINE_RE.exec(line);
    if (!match) {
      // Only display-name section headers may redefine the provider context.
      // A lone id-shaped token is a dropped model row (tagline missing), not a
      // header — promoting it would regroup every later row under a garbage
      // sub-provider. Multiword headers never contain the id `/` separator.
      if (!line.includes(" ") && line.includes("/") && COMMANDCODE_MODEL_ID_RE.test(line)) {
        continue;
      }
      isByok = false;
      providerLabel = line;
      providerId = providerLabel
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      continue;
    }
    const id = match[1]!;
    if (!COMMANDCODE_MODEL_ID_RE.test(id) || seen.has(id)) continue;
    seen.add(id);
    const modelProviderId =
      isByok && id.includes("/") ? id.slice(0, id.indexOf("/")).toLowerCase() : providerId;

    const rawDescription = match[2]!.trim();
    const isDefault = /\(default\)/i.test(rawDescription);
    const description = rawDescription
      .replace(/\s*\((?:default|recommended)\)\s*/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    parsed.push({
      id,
      ...(description ? { description } : {}),
      ...(isDefault ? { isDefault: true } : {}),
      ...(modelProviderId ? { providerId: modelProviderId } : {}),
      ...(providerLabel ? { providerLabel } : {}),
      ...(isByok ? { isByok: true } : {}),
    });
  }
  return parsed;
}

export function parseCommandCodeModelEfforts(output: string): string[] | undefined {
  const cleaned = stripAnsi(output);
  const supported = /Supported:\s*([^\r\n.]+)\.?/i.exec(cleaned)?.[1];
  if (supported) {
    return supported
      .split(",")
      .map((effort) => effort.trim())
      .filter(Boolean);
  }
  return /has no adjustable reasoning effort/i.test(cleaned) ? [] : undefined;
}

export function parseCommandCodeModelNames(body: unknown): Record<string, string> {
  if (!body || typeof body !== "object" || !Array.isArray((body as { data?: unknown }).data)) {
    return {};
  }
  const names: Record<string, string> = {};
  for (const item of (body as { data: unknown[] }).data) {
    if (!item || typeof item !== "object") continue;
    const { id, name } = item as { id?: unknown; name?: unknown };
    if (typeof id !== "string" || typeof name !== "string") continue;
    const normalizedId = id.trim().toLowerCase();
    const normalizedName = name.trim();
    if (normalizedId && normalizedName) names[normalizedId] = normalizedName;
  }
  return names;
}

export function resolveCommandCodeModelName(
  id: string,
  liveModelNames: Readonly<Record<string, string>>,
): string | undefined {
  const normalizedId = id.toLowerCase();
  const exact = liveModelNames[normalizedId];
  if (exact) return exact;

  const datedPrefix = `${normalizedId}-`;
  const datedMatches = Object.entries(liveModelNames).filter(
    ([candidate]) =>
      candidate.startsWith(datedPrefix) && /^\d{8}$/.test(candidate.slice(datedPrefix.length)),
  );
  return datedMatches.length === 1 ? datedMatches[0]![1] : undefined;
}

export function createCommandCodeModelNameLoader(
  options: {
    fetchImpl?: typeof fetch;
    now?: () => number;
    ttlMs?: number;
  } = {},
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? COMMANDCODE_MODEL_NAMES_TTL_MS;
  let cached: { names: Record<string, string>; expiresAt: number } | undefined;
  let pending: Promise<Record<string, string>> | undefined;

  const waitForPending = (
    request: Promise<Record<string, string>>,
    signal: AbortSignal | undefined,
  ): Promise<Record<string, string>> => {
    if (!signal) return request;
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
      request.then(
        (names) => {
          signal.removeEventListener("abort", onAbort);
          resolve(names);
        },
        (error: unknown) => {
          signal.removeEventListener("abort", onAbort);
          reject(error);
        },
      );
    });
  };

  return async (signal?: AbortSignal): Promise<Record<string, string>> => {
    if (cached && cached.expiresAt > now()) return cached.names;
    if (pending) return waitForPending(pending, signal);

    const staleNames = cached?.names ?? {};
    pending = (async () => {
      try {
        const response = await fetchImpl(COMMANDCODE_MODELS_ENDPOINT, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(4_000),
        });
        if (!response.ok) return staleNames;
        const names = parseCommandCodeModelNames(await response.json());
        if (Object.keys(names).length > 0) {
          cached = { names, expiresAt: now() + ttlMs };
          return names;
        }
        return staleNames;
      } catch {
        return staleNames;
      } finally {
        pending = undefined;
      }
    })();
    return waitForPending(pending, signal);
  };
}

export async function collectCommandCodeModelEfforts(
  modelIds: readonly string[],
  probe: (modelId: string) => Promise<string>,
  concurrency = COMMANDCODE_EFFORT_PROBE_CONCURRENCY,
): Promise<Record<string, string[]>> {
  const modelEfforts: Record<string, string[]> = {};
  if (modelIds.length === 0) return modelEfforts;

  // Sentinel gate: effort discovery relies on the CLI rejecting an unknown
  // `--effort` with a parseable reply ("Supported: …" / "has no adjustable
  // reasoning effort"). Up to two leaders are probed serially until one
  // produces such a reply; if neither does — older CLI builds may ignore the
  // flag and run real `-p` turns instead — refuse the fan-out so a couple of
  // invocations replace N. Trying a second leader keeps one persistently
  // broken id (auth-walled BYOK endpoint, transient timeout) from vetoing the
  // rest of the list forever, while models that merely fail stay retryable on
  // later passes because they remain absent from the returned map.
  const probed = new Set<string>();
  let cursor = 0;
  const runLeader = async (): Promise<boolean> => {
    const modelId = modelIds[cursor++]!;
    probed.add(modelId);
    const efforts = parseCommandCodeModelEfforts(await probe(modelId));
    if (efforts === undefined) return false;
    modelEfforts[modelId] = efforts;
    return true;
  };
  let sawParseableReply = false;
  while (cursor < Math.min(COMMANDCODE_EFFORT_SENTINEL_ATTEMPTS, modelIds.length)) {
    sawParseableReply = await runLeader();
    if (sawParseableReply) break;
  }
  if (!sawParseableReply) return modelEfforts;

  const takeNext = (): string | undefined => {
    while (cursor < modelIds.length && probed.has(modelIds[cursor]!)) cursor++;
    return cursor < modelIds.length ? modelIds[cursor++] : undefined;
  };
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), modelIds.length - probed.size) },
    async () => {
      for (;;) {
        const modelId = takeNext();
        if (modelId === undefined) return;
        const efforts = parseCommandCodeModelEfforts(await probe(modelId));
        if (efforts !== undefined) modelEfforts[modelId] = efforts;
      }
    },
  );
  await Promise.all(workers);
  return modelEfforts;
}

export function createCommandCodeEffortProbeCache(maxEntries = COMMANDCODE_EFFORT_CACHE_SIZE) {
  const entries = new Map<
    string,
    { modelEfforts: Record<string, string[]>; pending?: Promise<void> }
  >();

  return async (
    key: string,
    modelIds: readonly string[],
    probe: (modelId: string) => Promise<string>,
  ): Promise<Record<string, string[]>> => {
    let entry = entries.get(key);
    if (entry) {
      entries.delete(key);
      entries.set(key, entry);
    } else {
      entry = { modelEfforts: {} };
      entries.set(key, entry);
      if (entries.size > Math.max(1, maxEntries)) {
        entries.delete(entries.keys().next().value!);
      }
    }

    if (entry.pending) {
      await entry.pending;
      return { ...entry.modelEfforts };
    }

    const missing = modelIds.filter((modelId) => !(modelId in entry.modelEfforts));
    if (missing.length > 0) {
      entry.pending = collectCommandCodeModelEfforts(missing, probe)
        .then((modelEfforts) => {
          Object.assign(entry.modelEfforts, modelEfforts);
        })
        .finally(() => {
          delete entry.pending;
        });
      await entry.pending;
    }
    return { ...entry.modelEfforts };
  };
}

function humanizeCommandCodeModelLabel(id: string): string {
  // Drop any namespace prefix, then turn `-` separators into spaces and
  // title-case each segment without keeping a provider-owned name table.
  const tail = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id;
  return tail
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Turn parsed models into the picker's model capabilities: the labeled model
 * list plus the provider sections emitted by the live `--list-models` probe.
 */
export function buildCommandCodeModelPickerCapabilities(
  parsed: ParsedCommandCodeModel[],
  probedModelEfforts: Readonly<Record<string, string[]>> = {},
  liveModelNames: Readonly<Record<string, string>> = {},
): Pick<AgentCapability, "models" | "subProviders" | "modelSubProvider" | "modelEfforts"> {
  const models: LabeledOption[] = [];
  const modelSubProvider: Record<string, string> = {};
  const modelEfforts: Record<string, string[]> = {};
  const subProviders: LabeledOption[] = [];
  const seenSubProviders = new Set<string>();
  const seen = new Set<string>();
  let defaultId: string | undefined;

  for (const { id, description, isDefault, providerId, providerLabel, isByok } of parsed) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (isDefault && !defaultId) defaultId = id;

    const model: LabeledOption = {
      id,
      label:
        isByok && description
          ? description
          : (resolveCommandCodeModelName(id, liveModelNames) ?? humanizeCommandCodeModelLabel(id)),
    };
    const desc = description?.trim();
    if (desc && !isByok) model.description = desc;
    models.push(model);
    const efforts = probedModelEfforts[id];
    if (efforts) modelEfforts[id] = efforts;

    if (providerId && providerLabel) {
      modelSubProvider[id] = providerId;
      if (!seenSubProviders.has(providerId)) {
        seenSubProviders.add(providerId);
        subProviders.push({ id: providerId, label: providerLabel });
      }
    }
  }

  // Surface Command Code's own default first so a fresh thread (one with no
  // saved model) mirrors what running `command-code` directly would pick —
  // `resolveModelValue` falls back to `models[0]`.
  if (defaultId) {
    const idx = models.findIndex((m) => m.id === defaultId);
    if (idx > 0) models.unshift(models.splice(idx, 1)[0]!);
  }

  return { models, subProviders, modelSubProvider, modelEfforts };
}

export const defaultCommandCodeCapabilities: AgentCapability = {
  models: [],
  subProviders: [],
  modelSubProvider: {},
  modelEfforts: {},
  efforts: [],
  modes: ["agent", "plan"],
  approvalPolicies: [
    { id: "default", label: "Default" },
    { id: "auto_edit", label: "Auto-accept edits" },
    { id: "dont-ask", label: "Don't ask (deny)" },
    { id: "yolo", label: "Bypass Permissions" },
  ],
  sandboxModes: [],
  supportsResume: true,
  supportsOneShot: true,
  supportsDirectInput: true,
  // Command Code sandboxes file reads to its working directory, so picked
  // screenshots / attachments must be copied into the project before use.
  requiresWorkspaceLocalAttachments: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  presentationModes: ["terminal"],
  defaultApprovalPolicy: "yolo",
  bypassPermissions: { approvalPolicy: "yolo" },
  // No dedicated-server hosting path in any presentation.
  mcpScope: { terminal: "none", gui: "none" },
  settingDefs: [],
};

// Sign-in state comes from the credential file `command-code login` writes
// (`~/.commandcode/auth.json` with an `apiKey`), not the config dir, which is
// created on first run regardless. This keeps a never-signed-in user from
// seeing a false "Re-login" and a signed-in user from being nagged with
// "Login required".
const storedCredentialsAuthProbe: AuthProbe = async (ctx) => {
  return commandCodeHasStoredCredentials(ctx.location) ? "authenticated" : "missing";
};

// Command Code authenticates via `command-code login` (browser OAuth or an API
// key) run in a terminal. There is no ACP/structured probe, so we synthesize
// the terminal auth method when the binary is installed; this is what surfaces
// the Login / Re-login button (the renderer routes `type: "terminal"` methods
// to `runTerminalLogin` → `loginCommand`). `authProbes` above supplies the
// `authState` that decides Login vs Re-login / Signed in.
const COMMANDCODE_TERMINAL_AUTH: AgentTerminalAuthMethod = {
  id: "commandcode-terminal-login",
  name: "Login",
  type: "terminal",
  // No `env` needed: `detectAgentInstall` merges `baseSpawnEnv` into every
  // terminal auth method as it assembles the status.
};

const readCachedCommandCodeModelEfforts = createCommandCodeEffortProbeCache();
const loadCommandCodeModelNames = createCommandCodeModelNameLoader();

async function probeCommandCodeModelEfforts(
  ctx: DetectProbeCtx & { executablePath: string },
  modelsOutput: string,
  modelIds: readonly string[],
): Promise<Record<string, string[]>> {
  const cacheKey = JSON.stringify([ctx.location, ctx.executablePath, ctx.version, modelsOutput]);
  return readCachedCommandCodeModelEfforts(cacheKey, modelIds, async (modelId) => {
    const probe = await readAgentCommandOutput(
      ctx.location,
      ctx.executablePath,
      [
        "--model",
        modelId,
        "--effort",
        COMMANDCODE_EFFORT_PROBE_VALUE,
        "--no-session",
        "-p",
        "capability probe",
      ],
      {
        timeoutMs: 4_000,
        wslLinuxCwd: "/tmp",
        posixCwd: getAgentProbeCwd(ctx.location),
        ...(ctx.probeEnv ? { env: ctx.probeEnv } : {}),
        ...(ctx.signal ? { signal: ctx.signal } : {}),
      },
    ).catch(() => undefined);
    return probe ? `${probe.stdout}\n${probe.stderr}` : "";
  });
}

export const commandCodeDetectionSpec: DetectionSpec = {
  kind: "commandcode",
  label: "Command Code",
  binary: "command-code",
  loginCommand: "command-code login",
  capabilities: defaultCommandCodeCapabilities,
  versionArgs: ["--version"],
  authProbes: [envVarAuthProbe(["COMMAND_CODE_API_KEY"]), storedCredentialsAuthProbe],
  // One probe, three jobs: advertise the terminal login method so the Settings
  // Login button appears; refresh models from `command-code --list-models`
  // (instant, no auth needed) so newly shipped ones show up without an app
  // release; then discover per-model efforts (sentinel-gated CLI probes — see
  // collectCommandCodeModelEfforts) and pretty display names (HTTP fetch with a
  // short TTL). If the list call fails or parses to nothing we return auth only
  // and expose no stale model choices.
  async capabilitiesProbe(ctx) {
    if (!ctx.executablePath) return undefined;
    const result = await readAgentCommandOutput(
      ctx.location,
      ctx.executablePath,
      ["--list-models"],
      {
        timeoutMs: 8_000,
        wslLinuxCwd: "/tmp",
        posixCwd: getAgentProbeCwd(ctx.location),
        // Suppress the CLI's background self-updater (ctx.probeEnv is the
        // shared `baseSpawnEnv` + `probeEnv` merge from detectAgentInstall).
        ...(ctx.probeEnv ? { env: ctx.probeEnv } : {}),
        ...(ctx.signal ? { signal: ctx.signal } : {}),
      },
    ).catch((error) => {
      console.warn("[commandcode] model list probe failed:", error);
      return undefined;
    });
    const parsed = result?.ok ? parseCommandCodeModels(result.stdout) : [];
    const [modelEfforts, modelNames] = await Promise.all([
      parsed.length > 0
        ? probeCommandCodeModelEfforts(
            { ...ctx, executablePath: ctx.executablePath },
            result?.stdout ?? "",
            parsed.map((model) => model.id),
          )
        : {},
      parsed.length > 0 ? loadCommandCodeModelNames(ctx.signal) : {},
    ]);
    const modelCapabilities =
      parsed.length > 0
        ? buildCommandCodeModelPickerCapabilities(parsed, modelEfforts, modelNames)
        : undefined;
    return { authMethods: [COMMANDCODE_TERMINAL_AUTH], ...modelCapabilities };
  },
  // `command-code update` is the documented self-updater (preferred). `npm`
  // also enables the registry "outdated?" check (getNpmPackageNameForUpdate)
  // and is the automatic fallback if the built-in updater fails, since the CLI
  // is distributed as the `command-code` npm package on every platform.
  update: { builtIn: { binary: "command-code", args: ["update"] }, npm: "command-code" },
  // Suppress the CLI's background self-updater on every spawn lane (shared
  // runtime fans this out; the explicit `update` command stays exempt).
  baseSpawnEnv: COMMANDCODE_SKIP_UPDATES_ENV,
};
