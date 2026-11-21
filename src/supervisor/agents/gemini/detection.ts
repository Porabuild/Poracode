import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentCapability, AgentTerminalAuthMethod, AuthState } from "@/shared/contracts";
import { compactAgentProviderMetadata } from "@/shared/contracts";
import { readMacKeychainFingerprint } from "@/supervisor/runtime/macKeychain";
import { windowsCredentialTargetExists } from "@/supervisor/runtime/windowsClaudeVault";
import { humanizeModelId, probeAcpCapabilities } from "../acp";
import {
  batchWslCommandsAsync,
  buildAgentCommand,
  quotePosixShellArg,
  type AuthProbe,
  type DetectionSpec,
} from "../base";
import { buildContextSizeCapabilities } from "../contextWindowLabel";
import { getAgentProbeCwd, resolveProbeSpawnCwd } from "../probeCwd";
import {
  buildWslGeminiConfigDirShellAssign,
  readEffectiveGeminiEnvVar,
  resolveGeminiConfigDir,
} from "./session";

// Gemini's ACP probe reports the selectable model ids/names, but not token
// limits. Keep this as an exact documented allowlist so new ids do not inherit
// a context label until we have a real source for that model (or ACP advertises
// context configOptions dynamically).
const GEMINI_MODEL_CONTEXT_TOKENS = new Map<string, number>([
  ["gemini-3-pro-preview", 1_048_576],
  ["gemini-3.1-pro-preview", 1_048_576],
  ["gemini-3.1-pro-preview-customtools", 1_048_576],
  ["gemini-3-flash-preview", 1_048_576],
  ["gemini-3-flash", 1_048_576],
  ["gemini-3.5-flash", 1_048_576],
  ["gemini-3.8-flash", 1_048_576],
  ["gemini-3.1-flash-lite", 1_048_576],
  ["gemini-3.1-flash-lite-preview", 1_048_576],
  ["gemini-3.5-flash-lite", 1_048_576],
  ["gemini-2.5-pro", 1_048_576],
  ["gemini-2.5-flash", 1_048_576],
  ["gemini-2.5-flash-lite", 1_048_576],
  ["gemini-2.0-flash", 1_048_576],
  ["gemini-2.0-flash-lite", 1_048_576],
  ["gemini-1.5-pro", 2_000_000],
  ["gemini-1.5-flash", 1_048_576],
  ["gemini-1.5-flash-8b", 1_048_576],
  ["gemma-4-31b-it", 256_000],
  ["gemma-4-26b-a4b-it", 256_000],
]);

export function geminiModelContextTokens(modelId: string): number | undefined {
  return GEMINI_MODEL_CONTEXT_TOKENS.get(modelId.toLowerCase());
}

export function humanizeGeminiModelId(id: string): string {
  return humanizeModelId(id.replace(/^gemini-/, ""));
}

/**
 * keytar target Gemini CLI uses for a pasted API key
 * (`service/account` → `gemini-cli-api-key/default-api-key`).
 * On Windows that is a generic Credential Manager entry, not a file under
 * `~/.gemini`.
 */
const GEMINI_WINDOWS_API_KEY_TARGET = "gemini-cli-api-key/default-api-key";

export const defaultGeminiCapabilities: AgentCapability = {
  models: [],
  efforts: [],
  modelEfforts: {},
  modes: [],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsOneShot: true,
  utilityRank: 30,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  presentationModes: ["terminal", "gui"],
  defaultApprovalPolicy: "never",
  bypassPermissions: { approvalPolicy: "never" },
  mcpScope: { terminal: "launch", gui: "launch" },
  settingDefs: [],
};

/**
 * Gemini's CLI writes the active Google account email to
 * `~/.gemini/google_accounts.json` after `gemini auth login`. Shape:
 *   { "active": "user@gmail.com", "old": [ ... ] }
 * Returns the active email when the file is well-formed.
 */
export function parseGeminiGoogleAccountsJson(raw: string): string | undefined {
  try {
    const parsed = JSON.parse(raw) as { active?: unknown };
    return typeof parsed.active === "string" && parsed.active.trim().length > 0
      ? parsed.active.trim()
      : undefined;
  } catch {
    return undefined;
  }
}

export function parseGeminiOAuthCredsPresence(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as { access_token?: unknown; refresh_token?: unknown };
    return Boolean(
      (typeof parsed.access_token === "string" && parsed.access_token.trim().length > 0) ||
      (typeof parsed.refresh_token === "string" && parsed.refresh_token.trim().length > 0),
    );
  } catch {
    return false;
  }
}

export function parseGeminiSelectedAuthType(raw: string): string | undefined {
  try {
    const parsed = JSON.parse(raw) as {
      security?: { auth?: { selectedType?: unknown } };
    };
    const selected = parsed.security?.auth?.selectedType;
    return typeof selected === "string" && selected.trim().length > 0 ? selected.trim() : undefined;
  } catch {
    return undefined;
  }
}

export interface GeminiAuthEvidence {
  apiKeySet: boolean;
  serviceAccountPresent: boolean;
  vertexProjectSet: boolean;
  adcPresent: boolean;
  selectedAuthType?: string | undefined;
  baseUrlSet: boolean;
  oauthCredsPresent: boolean;
  fileKeychainPresent: boolean;
  macKeychainPresent: boolean;
  macKeychainApiKeyPresent?: boolean | undefined;
  /** Gemini API key stored in Windows Credential Manager (keytar generic cred). */
  windowsKeychainApiKeyPresent?: boolean | undefined;
  activeAccount?: string | undefined;
}

export function evaluateGeminiAuthEvidence(evidence: GeminiAuthEvidence): {
  authState: AuthState;
  authMethod?: string;
  authenticatedAs?: string;
} {
  const preferOAuth =
    evidence.selectedAuthType === "oauth-personal" &&
    Boolean(
      evidence.oauthCredsPresent ||
      evidence.fileKeychainPresent ||
      evidence.macKeychainPresent ||
      evidence.activeAccount,
    );
  if (
    evidence.apiKeySet ||
    (!preferOAuth &&
      (evidence.macKeychainApiKeyPresent ||
        // Gemini only loads the Credential Manager / file key when this mode is
        // selected. Logout clears selectedType and leaves the stored key behind.
        ((evidence.windowsKeychainApiKeyPresent || evidence.fileKeychainPresent) &&
          evidence.selectedAuthType === "gemini-api-key")))
  ) {
    return { authState: "authenticated", authMethod: "API key" };
  }
  if (evidence.serviceAccountPresent) {
    return { authState: "authenticated", authMethod: "Service account" };
  }
  if (
    evidence.adcPresent &&
    (evidence.vertexProjectSet ||
      evidence.selectedAuthType === "vertex-ai" ||
      evidence.selectedAuthType === "cloud-shell")
  ) {
    return { authState: "authenticated", authMethod: "Vertex AI" };
  }
  if (
    evidence.oauthCredsPresent ||
    evidence.fileKeychainPresent ||
    evidence.macKeychainPresent ||
    evidence.activeAccount
  ) {
    return {
      authState: "authenticated",
      ...(evidence.activeAccount
        ? { authenticatedAs: evidence.activeAccount }
        : { authMethod: "Google account" }),
    };
  }
  if (evidence.baseUrlSet) {
    return { authState: "unknown" };
  }
  return { authState: "missing" };
}

function isNonEmptyFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).size > 0;
  } catch {
    return false;
  }
}

function readUtf8Safe(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

async function probeWslGeminiAuth(
  distro: string,
  probeEnv: Readonly<Record<string, string | undefined>> | undefined,
  signal: AbortSignal | undefined,
): Promise<GeminiAuthEvidence> {
  const overridden = (name: string): string | undefined =>
    probeEnv && name in probeEnv ? (probeEnv[name]?.trim() ?? "") : undefined;

  const commands: string[] = [];
  const queueCommand = (cmd: string): number => {
    commands.push(cmd);
    return commands.length - 1;
  };
  const queueEnvCheck = (name: string): number | string => {
    const fixed = overridden(name);
    return fixed !== undefined ? fixed : queueCommand(`printf %s "$${name}"`);
  };

  const geminiKeySource = queueEnvCheck("GEMINI_API_KEY");
  const googleKeySource = queueEnvCheck("GOOGLE_API_KEY");
  const gacOverride = overridden("GOOGLE_APPLICATION_CREDENTIALS");
  const gacIndex =
    gacOverride === ""
      ? -1
      : queueCommand(
          gacOverride !== undefined
            ? `test -f ${quotePosixShellArg(gacOverride)} && echo yes || echo no`
            : 'if [ -n "$GOOGLE_APPLICATION_CREDENTIALS" ] && [ -f "$GOOGLE_APPLICATION_CREDENTIALS" ]; then echo yes; else echo no; fi',
        );
  const projectSource = queueEnvCheck("GOOGLE_CLOUD_PROJECT");
  const locationSource = queueEnvCheck("GOOGLE_CLOUD_LOCATION");
  const baseUrlSource = queueEnvCheck("GOOGLE_GEMINI_BASE_URL");

  const cloudSdkOverride = overridden("CLOUDSDK_CONFIG");
  const adcIndex = queueCommand(
    cloudSdkOverride
      ? `test -s ${quotePosixShellArg(`${cloudSdkOverride}/application_default_credentials.json`)} && echo yes || echo no`
      : 'test -s "${CLOUDSDK_CONFIG:-$HOME/.config/gcloud}/application_default_credentials.json" && echo yes || echo no',
  );

  const configAssign = buildWslGeminiConfigDirShellAssign(probeEnv);
  const oauthIndex = queueCommand(
    `${configAssign}; cat "$gemini_config_dir/oauth_creds.json" 2>/dev/null || printf ""`,
  );
  const keychainIndex = queueCommand(
    `${configAssign}; test -s "$gemini_config_dir/gemini-credentials.json" && echo yes || echo no`,
  );
  const accountsIndex = queueCommand(
    `${configAssign}; cat "$gemini_config_dir/google_accounts.json" 2>/dev/null || printf ""`,
  );
  const settingsIndex = queueCommand(
    `${configAssign}; cat "$gemini_config_dir/settings.json" 2>/dev/null || printf ""`,
  );

  const results = await batchWslCommandsAsync(distro, commands, signal);
  const readResult = (index: number) => (index >= 0 ? results[index] : undefined);
  const resolveEnvValue = (source: number | string): string =>
    typeof source === "string" ? source : readResult(source)?.ok ? readResult(source)!.stdout : "";

  const apiKeySet = Boolean(
    resolveEnvValue(geminiKeySource).trim().length > 0 ||
    resolveEnvValue(googleKeySource).trim().length > 0,
  );
  const gacRes = readResult(gacIndex);
  const serviceAccountPresent = Boolean(gacRes?.ok && gacRes.stdout.trim() === "yes");
  const vertexProjectSet = Boolean(
    resolveEnvValue(projectSource).trim().length > 0 ||
    resolveEnvValue(locationSource).trim().length > 0,
  );
  const baseUrlSet = resolveEnvValue(baseUrlSource).trim().length > 0;
  const adcRes = readResult(adcIndex);
  const adcPresent = Boolean(adcRes?.ok && adcRes.stdout.trim() === "yes");
  const oauthRes = readResult(oauthIndex);
  const oauthCredsPresent = Boolean(
    oauthRes?.ok &&
    oauthRes.stdout.trim().length > 0 &&
    parseGeminiOAuthCredsPresence(oauthRes.stdout),
  );
  const keychainRes = readResult(keychainIndex);
  const fileKeychainPresent = Boolean(keychainRes?.ok && keychainRes.stdout.trim() === "yes");
  const accountsRes = readResult(accountsIndex);
  const activeAccount =
    !apiKeySet && accountsRes?.ok && accountsRes.stdout.length > 0
      ? parseGeminiGoogleAccountsJson(accountsRes.stdout)
      : undefined;
  const settingsRes = readResult(settingsIndex);
  const selectedAuthType =
    settingsRes?.ok && settingsRes.stdout.length > 0
      ? parseGeminiSelectedAuthType(settingsRes.stdout)
      : undefined;

  return {
    apiKeySet,
    serviceAccountPresent,
    vertexProjectSet,
    adcPresent,
    selectedAuthType,
    baseUrlSet,
    oauthCredsPresent,
    fileKeychainPresent,
    macKeychainPresent: false,
    macKeychainApiKeyPresent: false,
    windowsKeychainApiKeyPresent: false,
    activeAccount,
  };
}

async function probeNativeGeminiAuth(
  probeEnv: Readonly<Record<string, string | undefined>> | undefined,
): Promise<GeminiAuthEvidence> {
  const apiKeySet = Boolean(
    readEffectiveGeminiEnvVar("GEMINI_API_KEY", probeEnv) ||
    readEffectiveGeminiEnvVar("GOOGLE_API_KEY", probeEnv),
  );
  const gacPath = readEffectiveGeminiEnvVar("GOOGLE_APPLICATION_CREDENTIALS", probeEnv);
  const serviceAccountPresent = Boolean(gacPath && isNonEmptyFile(gacPath));
  const vertexProjectSet = Boolean(
    readEffectiveGeminiEnvVar("GOOGLE_CLOUD_PROJECT", probeEnv) ||
    readEffectiveGeminiEnvVar("GOOGLE_CLOUD_LOCATION", probeEnv),
  );
  const baseUrlSet = Boolean(readEffectiveGeminiEnvVar("GOOGLE_GEMINI_BASE_URL", probeEnv));
  const cloudSdkConfig = readEffectiveGeminiEnvVar("CLOUDSDK_CONFIG", probeEnv);
  const adcPath = join(
    cloudSdkConfig || join(homedir(), ".config", "gcloud"),
    "application_default_credentials.json",
  );
  const adcPresent = isNonEmptyFile(adcPath);

  const hasCustomHome = Boolean(
    readEffectiveGeminiEnvVar("GEMINI_CLI_HOME", probeEnv) ||
    readEffectiveGeminiEnvVar("GEMINI_HOME", probeEnv),
  );
  const forceFileStorage =
    readEffectiveGeminiEnvVar("GEMINI_FORCE_FILE_STORAGE", probeEnv) === "true";
  const configDir = resolveGeminiConfigDir(probeEnv);
  const oauthCredsPresent = parseGeminiOAuthCredsPresence(
    readUtf8Safe(join(configDir, "oauth_creds.json")),
  );
  const fileKeychainPresent = isNonEmptyFile(join(configDir, "gemini-credentials.json"));
  const activeAccount = !apiKeySet
    ? parseGeminiGoogleAccountsJson(readUtf8Safe(join(configDir, "google_accounts.json")))
    : undefined;
  const selectedAuthType = parseGeminiSelectedAuthType(
    readUtf8Safe(join(configDir, "settings.json")),
  );

  // Profiles set GEMINI_CLI_HOME and force the encrypted file store, so they
  // must not inherit the host OS keychain. Host login uses that keychain:
  // macOS Keychain, or Windows Credential Manager via keytar.
  const shouldProbeOsKeychain =
    !hasCustomHome &&
    !forceFileStorage &&
    !apiKeySet &&
    ((!oauthCredsPresent && !fileKeychainPresent) || selectedAuthType === "gemini-api-key");
  const shouldProbeMacKeychain = shouldProbeOsKeychain && process.platform === "darwin";
  const shouldProbeWindowsKeychain = shouldProbeOsKeychain && process.platform === "win32";

  const [macKeychainPresent, macKeychainApiKeyPresent] = shouldProbeMacKeychain
    ? await Promise.all([
        oauthCredsPresent || fileKeychainPresent
          ? Promise.resolve(false)
          : readMacKeychainFingerprint({
              service: "gemini-cli-oauth",
              account: "main-account",
            }).then(Boolean),
        readMacKeychainFingerprint({
          service: "gemini-cli-api-key",
          account: "default-api-key",
        }).then(Boolean),
      ])
    : [false, false];
  const windowsKeychainApiKeyPresent = shouldProbeWindowsKeychain
    ? await windowsCredentialTargetExists(GEMINI_WINDOWS_API_KEY_TARGET)
    : false;

  return {
    apiKeySet,
    serviceAccountPresent,
    vertexProjectSet,
    adcPresent,
    selectedAuthType,
    baseUrlSet,
    oauthCredsPresent,
    fileKeychainPresent,
    macKeychainPresent,
    macKeychainApiKeyPresent,
    windowsKeychainApiKeyPresent,
    activeAccount,
  };
}

async function probeGeminiMetadata(ctx: Parameters<NonNullable<DetectionSpec["statusProbe"]>>[0]) {
  const evidence =
    ctx.location.kind === "wsl"
      ? await probeWslGeminiAuth(ctx.location.distro, ctx.probeEnv, ctx.signal)
      : await probeNativeGeminiAuth(ctx.probeEnv);
  const evaluated = evaluateGeminiAuthEvidence(evidence);
  const providerMetadata = compactAgentProviderMetadata({
    ...(evaluated.authenticatedAs ? { authenticatedAs: evaluated.authenticatedAs } : {}),
    ...(evaluated.authMethod ? { authMethod: evaluated.authMethod } : {}),
  });
  return {
    authState: evaluated.authState,
    ...(providerMetadata ? { providerMetadata } : {}),
  };
}

const credentialAuthProbe: AuthProbe = async (ctx) => {
  const result = await probeGeminiMetadata(ctx);
  return result.authState;
};

export const geminiDetectionSpec: DetectionSpec = {
  kind: "gemini",
  label: "Gemini",
  binary: "gemini",
  loginCommand: "gemini /auth",
  capabilities: defaultGeminiCapabilities,
  update: {
    npm: "@google/gemini-cli",
    brew: "gemini-cli",
  },
  statusProbe: probeGeminiMetadata,
  authProbes: [credentialAuthProbe],
  async capabilitiesProbe(ctx) {
    if (!ctx.executablePath) return undefined;
    // Bypass Gemini's folder-trust check during the probe so the AgentRegistry
    // doesn't emit "Skipping project agents..." onto stdout, which can collide
    // with JSON-RPC frames and break the ACP parser.
    const probeArgs = ["--acp", "--skip-trust"];
    const probeCmd =
      ctx.location.kind === "wsl"
        ? buildAgentCommand(
            ctx.location,
            "gemini",
            probeArgs,
            ctx.executablePath,
            ...(ctx.probeEnv ? [ctx.probeEnv] : []),
          )
        : buildAgentCommand(ctx.location, ctx.executablePath, probeArgs);
    const probeCwd = ctx.location.kind === "wsl" ? "/tmp" : getAgentProbeCwd(ctx.location);
    const processCwd = resolveProbeSpawnCwd(ctx.location, probeCmd.cwd);
    const env =
      ctx.location.kind !== "wsl" && (probeCmd.env || ctx.probeEnv)
        ? { ...(probeCmd.env ?? {}), ...(ctx.probeEnv ?? {}) }
        : undefined;
    const probeResult = await probeAcpCapabilities(probeCmd.command, probeCmd.args, probeCwd, {
      ...(processCwd ? { processCwd } : {}),
      timeoutMs: 20_000,
      modelLabel: humanizeGeminiModelId,
      ...(env ? { env } : {}),
      ...(ctx.signal ? { signal: ctx.signal } : {}),
      label:
        ctx.location.kind === "wsl"
          ? `gemini:wsl:${ctx.location.distro}`
          : `gemini:${ctx.location.kind}`,
    });
    // Gemini's ACP authMethods are mostly non-functional over the protocol —
    // only `oauth-personal` works via `authenticate()`; the API-key/Vertex/
    // Gateway methods require env vars set before agent spawn and fail
    // silently when invoked through ACP. Synthesize one terminal method that
    // opens Gemini's own TUI auth picker (via the loginCommand), which
    // handles every flow correctly. Returned unconditionally so the settings
    // Login button stays present even when the ACP probe transiently fails
    // (e.g. right after the user force-closes an in-flight /auth session).
    const terminalAuthMethod: AgentTerminalAuthMethod = {
      id: "gemini-terminal-login",
      name: "Login",
      type: "terminal",
      ...(ctx.probeEnv ? { env: ctx.probeEnv } : {}),
    };
    if (!probeResult) {
      return { authMethods: [terminalAuthMethod] };
    }
    const credentialStatus =
      probeResult.authState === "missing" ? await probeGeminiMetadata(ctx) : undefined;
    const apiKeyConfigured =
      credentialStatus?.authState === "authenticated" &&
      credentialStatus.providerMetadata?.authMethod === "API key";
    const modelTokens = new Map<string, number>();
    for (const model of probeResult.models ?? []) {
      if (probeResult.modelContextSizes?.[model.id]) continue;
      const tokens = geminiModelContextTokens(model.id);
      if (tokens !== undefined) modelTokens.set(model.id, tokens);
    }
    const staticContext = buildContextSizeCapabilities(modelTokens);
    const mergedContextSizes = [
      ...(probeResult.contextSizes ?? []),
      ...(staticContext.contextSizes ?? []).filter(
        (entry) => !(probeResult.contextSizes ?? []).some((dyn) => dyn.id === entry.id),
      ),
    ];
    const mergedModelContextSizes = {
      ...(staticContext.modelContextSizes ?? {}),
      ...(probeResult.modelContextSizes ?? {}),
    };
    return {
      ...(probeResult.models?.length ? { models: probeResult.models } : {}),
      ...(probeResult.efforts?.length ? { efforts: probeResult.efforts } : {}),
      ...(probeResult.defaultEffort ? { defaultEffort: probeResult.defaultEffort } : {}),
      ...(probeResult.modelEfforts ? { modelEfforts: probeResult.modelEfforts } : {}),
      ...(probeResult.modelDefaultEfforts
        ? { modelDefaultEfforts: probeResult.modelDefaultEfforts }
        : {}),
      ...(probeResult.thinkingModels ? { thinkingModels: probeResult.thinkingModels } : {}),
      ...(probeResult.fastModels ? { fastModels: probeResult.fastModels } : {}),
      ...(probeResult.subProviders?.length ? { subProviders: probeResult.subProviders } : {}),
      ...(probeResult.modelSubProvider ? { modelSubProvider: probeResult.modelSubProvider } : {}),
      ...(probeResult.modes?.length ? { modes: probeResult.modes } : {}),
      ...(probeResult.approvalPolicies?.length
        ? { approvalPolicies: probeResult.approvalPolicies }
        : {}),
      ...(probeResult.slashCommands?.length ? { slashCommands: probeResult.slashCommands } : {}),
      ...(mergedContextSizes.length > 0 ? { contextSizes: mergedContextSizes } : {}),
      ...(Object.keys(mergedModelContextSizes).length > 0
        ? { modelContextSizes: mergedModelContextSizes }
        : {}),
      authMethods: [terminalAuthMethod],
      ...(probeResult.authLogoutSupported ? { authLogoutSupported: true } : {}),
      // Only let explicit ACP auth_required ("missing") override credential
      // evidence; unauthenticated `gemini --acp` sessions should not override
      // `statusProbe` with an optimistic `"authenticated"`. An API key Gemini
      // already stored is not stale file evidence, so it wins over that signal.
      ...(probeResult.authState === "missing" && !apiKeyConfigured
        ? { authState: "missing" as const }
        : {}),
    };
  },
};
