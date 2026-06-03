import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentCapability, AgentTerminalAuthMethod } from "@/shared/contracts";
import { compactAgentProviderMetadata } from "@/shared/contracts";
import { probeAcpCapabilities } from "../acp";
import {
  batchWslCommandsAsync,
  buildAgentCommand,
  envVarAuthProbe,
  type AuthProbe,
  type DetectionSpec,
} from "../base";
import { buildContextSizeCapabilities } from "../contextWindowLabel";
import { getAgentProbeCwd } from "../probeCwd";
import { runSshScript } from "../../ssh";

// Gemini's ACP probe reports the selectable model ids/names, but not token
// limits. Keep this as an exact documented allowlist so new ids do not inherit
// a context label until we have a real source for that model.
const GEMINI_MODEL_CONTEXT_TOKENS = new Map<string, number>([
  ["gemini-3.1-pro-preview", 1_048_576],
  ["gemini-3-flash-preview", 1_048_576],
  ["gemini-3.1-flash-lite-preview", 1_048_576],
  ["gemini-2.5-pro", 1_048_576],
  ["gemini-2.5-flash", 1_048_576],
  ["gemini-2.5-flash-lite", 1_048_576],
  ["gemini-2.0-flash", 1_048_576],
  ["gemini-2.0-flash-lite", 1_048_576],
  ["gemini-1.5-pro", 2_000_000],
  ["gemini-1.5-flash", 1_048_576],
  ["gemini-1.5-flash-8b", 1_048_576],
]);

function geminiModelContextTokens(modelId: string): number | undefined {
  return GEMINI_MODEL_CONTEXT_TOKENS.get(modelId.toLowerCase());
}

export const defaultGeminiCapabilities: AgentCapability = {
  models: [],
  efforts: [],
  modelEfforts: {},
  modes: [],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  presentationModes: ["terminal", "gui"],
  defaultApprovalPolicy: "never",
  bypassPermissions: { approvalPolicy: "never" },
  settingDefs: [],
};

// Gemini stores a config dir at ~/.gemini after first login; treat its
// presence as authenticated even without GEMINI_API_KEY set.
const configDirAuthProbe: AuthProbe = async (ctx) => {
  if (ctx.location.kind === "ssh") {
    const result = await runSshScript(ctx.location, "test -d ~/.gemini && echo yes").catch(
      () => undefined,
    );
    return result?.stdout.trim() === "yes" ? "authenticated" : "unknown";
  }
  if (ctx.location.kind !== "wsl") {
    return existsSync(join(homedir(), ".gemini")) ? "authenticated" : "unknown";
  }
  const [result] = await batchWslCommandsAsync(ctx.location.distro, [
    "test -d ~/.gemini && echo yes",
  ]);
  return result?.ok && result.stdout.trim() === "yes" ? "authenticated" : "unknown";
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

async function probeGeminiMetadata(ctx: Parameters<NonNullable<DetectionSpec["statusProbe"]>>[0]) {
  if (ctx.location.kind === "wsl" || ctx.location.kind === "ssh") {
    const commands = [
      'printf %s "$GEMINI_API_KEY"',
      "test -d ~/.gemini && echo yes",
      'cat ~/.gemini/google_accounts.json 2>/dev/null || printf ""',
    ];
    let outputs: string[];
    if (ctx.location.kind === "wsl") {
      outputs = (await batchWslCommandsAsync(ctx.location.distro, commands)).map((result) =>
        result?.ok ? result.stdout : "",
      );
    } else {
      const sshLocation = ctx.location;
      outputs = await Promise.all(
        commands.map((command) =>
          runSshScript(sshLocation, command)
            .then((result) => result.stdout)
            .catch(() => ""),
        ),
      );
    }
    const [apiKeyStdout, configDirStdout, accountsStdout] = outputs;
    const apiKeySet = !!apiKeyStdout?.trim();
    const configDirPresent = configDirStdout?.trim() === "yes";
    const activeAccount =
      !apiKeySet && accountsStdout && accountsStdout.length > 0
        ? parseGeminiGoogleAccountsJson(accountsStdout)
        : undefined;
    const providerMetadata = compactAgentProviderMetadata({
      ...(activeAccount ? { authenticatedAs: activeAccount } : {}),
      ...(apiKeySet ? { authMethod: "API key" } : {}),
      ...(!apiKeySet && configDirPresent && !activeAccount ? { authMethod: "Google account" } : {}),
    });
    return providerMetadata ? { providerMetadata } : undefined;
  }

  const apiKeySet =
    typeof process.env.GEMINI_API_KEY === "string" && process.env.GEMINI_API_KEY.trim().length > 0;
  const accountsPath = join(homedir(), ".gemini", "google_accounts.json");
  let activeAccount: string | undefined;
  if (!apiKeySet) {
    try {
      activeAccount = parseGeminiGoogleAccountsJson(readFileSync(accountsPath, "utf8"));
    } catch {
      activeAccount = undefined;
    }
  }
  const configDirPresent = existsSync(join(homedir(), ".gemini"));
  const providerMetadata = compactAgentProviderMetadata({
    ...(activeAccount ? { authenticatedAs: activeAccount } : {}),
    ...(apiKeySet ? { authMethod: "API key" } : {}),
    ...(!apiKeySet && configDirPresent && !activeAccount ? { authMethod: "Google account" } : {}),
  });
  return providerMetadata ? { providerMetadata } : undefined;
}

export const geminiDetectionSpec: DetectionSpec = {
  kind: "gemini",
  label: "Gemini",
  binary: "gemini",
  loginCommand: "gemini /auth",
  capabilities: defaultGeminiCapabilities,
  update: {
    npm: "@google/gemini-cli",
  },
  statusProbe: probeGeminiMetadata,
  authProbes: [envVarAuthProbe(["GEMINI_API_KEY"]), configDirAuthProbe],
  async capabilitiesProbe(ctx) {
    if (!ctx.executablePath) return undefined;
    // Bypass Gemini's folder-trust check during the probe so the AgentRegistry
    // doesn't emit "Skipping project agents..." onto stdout, which can collide
    // with JSON-RPC frames and break the ACP parser.
    const probeArgs = ["--acp", "--skip-trust"];
    const probeCmd =
      ctx.location.kind === "wsl"
        ? buildAgentCommand(ctx.location, "gemini", probeArgs, ctx.executablePath)
        : buildAgentCommand(ctx.location, ctx.executablePath, probeArgs);
    const probeCwd = ctx.location.kind === "wsl" ? "/tmp" : getAgentProbeCwd(ctx.location);
    const probeResult = await probeAcpCapabilities(probeCmd.command, probeCmd.args, probeCwd, {
      timeoutMs: 15_000,
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
    };
    if (!probeResult) {
      return { authMethods: [terminalAuthMethod] };
    }
    const modelTokens = new Map<string, number>();
    for (const model of probeResult.models ?? []) {
      const tokens = geminiModelContextTokens(model.id);
      if (tokens !== undefined) modelTokens.set(model.id, tokens);
    }
    return {
      ...(probeResult.models?.length ? { models: probeResult.models } : {}),
      ...(probeResult.efforts?.length ? { efforts: probeResult.efforts } : {}),
      ...(probeResult.defaultEffort ? { defaultEffort: probeResult.defaultEffort } : {}),
      ...(probeResult.modes?.length ? { modes: probeResult.modes } : {}),
      ...(probeResult.approvalPolicies?.length
        ? { approvalPolicies: probeResult.approvalPolicies }
        : {}),
      ...(probeResult.slashCommands?.length ? { slashCommands: probeResult.slashCommands } : {}),
      ...buildContextSizeCapabilities(modelTokens),
      authMethods: [terminalAuthMethod],
      ...(probeResult.authLogoutSupported ? { authLogoutSupported: true } : {}),
      ...(probeResult.authState ? { authState: probeResult.authState } : {}),
    };
  },
};
