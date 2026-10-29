import type {
  AgentConnectedProvider,
  ManageAgentCredentialsPayload,
  ManageAgentCredentialsResult,
  ProjectLocation,
} from "@/shared/contracts";
import { detectProbeLocation, readAgentCommandOutput } from "../base";
import { resolveAgentBinaryPath } from "../binaryResolver";
import { FX_BASE_SPAWN_ENV } from "./detection";

/**
 * The fx sign-in backends, in the order Provider Settings lists them. The
 * renderer's FxProviderSettings mirrors these slugs and labels.
 */
export const FX_BACKENDS = [
  { slug: "vercel", statusId: "vercel-ai-gateway", label: "Vercel AI Gateway" },
  { slug: "codex", statusId: "codex", label: "Codex" },
  { slug: "grok", statusId: "grok", label: "Grok" },
] as const;

/**
 * fx lists `connected_providers` only while a non-Gateway backend is selected,
 * so this read-only status call pins Codex for that one process. The placeholder
 * model stops fx from requiring a saved Codex model; status never uses it.
 */
export const FX_CONNECTIONS_PROBE_ENV = {
  FX_PROVIDER: "codex",
  FX_MODEL: "poracode-status-probe",
};

export function parseFxConnectedProviders(stdout: string): AgentConnectedProvider[] | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
  const record = parsed as Record<string, unknown>;
  if (record["kind"] !== "status") return undefined;
  const connected = record["connected_providers"];
  if (!Array.isArray(connected)) return undefined;
  const statusIds = new Set(connected.filter((id): id is string => typeof id === "string"));
  return FX_BACKENDS.filter((backend) => statusIds.has(backend.statusId)).map((backend) => ({
    id: backend.slug,
    label: backend.label,
  }));
}

export async function readFxConnectedProviders(
  location: ProjectLocation,
  executablePath: string,
  options: { timeoutMs: number; env?: Record<string, string>; signal?: AbortSignal },
): Promise<AgentConnectedProvider[] | undefined> {
  const result = await readAgentCommandOutput(location, executablePath, ["status", "--json"], {
    timeoutMs: options.timeoutMs,
    env: { ...options.env, ...FX_CONNECTIONS_PROBE_ENV },
    ...(options.signal ? { signal: options.signal } : {}),
  });
  return result.ok ? parseFxConnectedProviders(result.stdout) : undefined;
}

function firstNonEmptyLine(text: string): string | undefined {
  return text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
}

/**
 * List the fx backends signed in on this machine, or sign one out with
 * `fx logout <backend>` (fx's non-interactive logout).
 */
export async function manageFxCredentials(
  input: Omit<ManageAgentCredentialsPayload, "agentKind">,
): Promise<ManageAgentCredentialsResult> {
  const location = detectProbeLocation(
    input.env.kind === "wsl"
      ? { envKind: "wsl", wslDistro: input.env.distro }
      : { envKind: process.platform === "win32" ? "windows" : "posix" },
  );
  const executable = resolveAgentBinaryPath(location, "fx") ?? "fx";

  if (input.action === "remove") {
    const backend = FX_BACKENDS.find((entry) => entry.slug === input.credentialId);
    if (!backend) throw new Error(`Unknown fx sign-in backend: ${input.credentialId ?? ""}`);
    const result = await readAgentCommandOutput(location, executable, ["logout", backend.slug], {
      timeoutMs: 30_000,
      env: FX_BASE_SPAWN_ENV,
    });
    if (!result.ok) {
      throw new Error(
        firstNonEmptyLine(result.stderr) ?? firstNonEmptyLine(result.stdout) ?? "fx logout failed",
      );
    }
  }

  const providers =
    (await readFxConnectedProviders(location, executable, {
      timeoutMs: 15_000,
      env: FX_BASE_SPAWN_ENV,
    })) ?? [];
  return { providers };
}
