import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { posix, win32 } from "node:path";
import { parseEnv } from "node:util";
import { parseDocument } from "yaml";
import type { AuthState } from "@/shared/contracts";
import { batchWslCommandsAsync, type DetectProbeCtx } from "../base";
import { quotePosixShellArg } from "../base/shellBasics";
import { getAgentProbeCwd, resolveProbeSpawnCwd } from "../probeCwd";
import { buildDeepSeekCommand } from "./argv";

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Only inspect credential presence; never log YAML diagnostics or secret values. */
export function deepSeekHasStoredCredentials(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    const document = parseDocument(raw);
    if (document.errors.length > 0) return false;
    const value: unknown = document.toJS();
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const { version, refs, records } = value as {
      version?: unknown;
      refs?: Record<string, unknown>;
      records?: Record<string, unknown>;
    };
    // Harness rejects the legacy flat document and unknown future versions.
    if (version !== 1) return false;
    if (
      refs &&
      typeof refs === "object" &&
      !Array.isArray(refs) &&
      Object.values(refs).some(nonempty)
    )
      return true;
    const account = records?.["deepseek-account-platform/default"];
    if (!account || typeof account !== "object") return false;
    const { kind, payload } = account as { kind?: unknown; payload?: { token?: unknown } };
    return kind === "grant" && nonempty(payload?.token);
  } catch {
    return false;
  }
}

export function deepSeekEnvFileHasKey(raw: string | undefined): boolean {
  try {
    return raw !== undefined && nonempty(parseEnv(raw).DEEPSEEK_API_KEY);
  } catch {
    return false;
  }
}

function resolveDeepSeekHome(
  configured: string | undefined,
  home: string,
  cwd: string,
  paths: typeof posix,
): string {
  let root = nonempty(configured) ? configured : paths.join(home, ".dsh");
  if (root === "~") root = home;
  else if (root.startsWith("~/") || root.startsWith("~\\")) root = paths.join(home, root.slice(2));
  return paths.resolve(cwd, root);
}

export async function probeDeepSeekAuth(ctx: DetectProbeCtx): Promise<AuthState> {
  if (ctx.location.kind === "wsl") {
    // NUL framing preserves spaces in home paths across the bridge's stdout trim.
    // Return only key presence; the host's environment must never authenticate WSL.
    const [metadata] = await batchWslCommandsAsync(
      ctx.location.distro,
      ['printf \'%s\\0%s\\0%s\\0\' "${DEEPSEEK_API_KEY:+present}" "$HOME" "${DSH_HOME-}"'],
      ctx.signal,
    );
    const [environment, home, configuredHome] = metadata?.ok ? metadata.stdout.split("\0") : [];
    if (environment === "present") return "authenticated";
    if (!home) return "unknown";
    const root = resolveDeepSeekHome(configuredHome, home, getAgentProbeCwd(ctx.location), posix);
    const [credentials, dotenv] = await batchWslCommandsAsync(
      ctx.location.distro,
      [
        `cat ${quotePosixShellArg(posix.join(root, ".credentials.yaml"))} 2>/dev/null`,
        `cat ${quotePosixShellArg(posix.join(root, ".env"))} 2>/dev/null`,
      ],
      ctx.signal,
    );
    if (deepSeekHasStoredCredentials(credentials?.stdout) || deepSeekEnvFileHasKey(dotenv?.stdout))
      return "authenticated";
  } else {
    const command = buildDeepSeekCommand(ctx.location, ctx.executablePath);
    const env = command.env ?? process.env;
    if (nonempty(env.DEEPSEEK_API_KEY)) return "authenticated";
    const cwd = resolveProbeSpawnCwd(ctx.location, command.cwd) ?? ctx.location.path;
    const paths = ctx.location.kind === "windows" ? win32 : posix;
    const root = resolveDeepSeekHome(env.DSH_HOME, homedir(), cwd, paths);
    const [credentials, dotenv] = await Promise.all([
      readFile(paths.join(root, ".credentials.yaml"), "utf8").catch(() => undefined),
      readFile(paths.join(root, ".env"), "utf8").catch(() => undefined),
    ]);
    if (deepSeekHasStoredCredentials(credentials) || deepSeekEnvFileHasKey(dotenv)) {
      return "authenticated";
    }
  }
  // Custom routes can resolve other environment references or project .env
  // files. ACP session/new does not validate credentials, so its success is
  // not proof of sign-in, and absence of the default key is not proof of failure.
  return "unknown";
}
