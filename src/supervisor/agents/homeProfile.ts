import { homedir } from "node:os";
import path from "node:path";
import posixPath from "node:path/posix";
import type {
  AgentInstanceConfig,
  AgentStatus,
  AgentTerminalAuthMethod,
  ProjectLocation,
} from "@/shared/contracts";
import { resolveWslHomeDirectory } from "./base";

export function resolveNativeHomeProfilePath(rawHomeDir: string): string {
  const trimmed = rawHomeDir.trim();
  if (trimmed !== "~" && !trimmed.startsWith("~/")) {
    return path.isAbsolute(trimmed) || path.win32.isAbsolute(trimmed)
      ? trimmed
      : path.join(homedir(), trimmed);
  }
  const suffix = trimmed === "~" ? "" : trimmed.slice(2);
  return path.join(homedir(), suffix);
}

export function resolveHomeProfilePathForLocation(
  rawHomeDir: string,
  location: ProjectLocation,
): string {
  if (location.kind !== "wsl") return resolveNativeHomeProfilePath(rawHomeDir);
  const home = resolveWslHomeDirectory(location.distro);
  if (!home) throw new Error(`Unable to resolve the WSL home directory for ${location.distro}.`);
  const trimmed = rawHomeDir.trim();
  if (trimmed !== "~" && !trimmed.startsWith("~/")) {
    return posixPath.isAbsolute(trimmed) ? trimmed : posixPath.join(home, trimmed);
  }
  const suffix = trimmed === "~" ? "" : trimmed.slice(2);
  return posixPath.join(home, suffix);
}

export function resolveAgentInstanceEnv(
  environment: AgentInstanceConfig["environment"],
): Record<string, string> | undefined {
  if (!environment) return undefined;
  const env = Object.fromEntries(
    Object.entries(environment)
      .filter(([name]) => name.trim().length > 0)
      .map(([name, variable]) => [name, variable.value]),
  );
  return Object.keys(env).length > 0 ? env : undefined;
}

export function homeProfileEnvForLocation(
  homeDir: string | undefined,
  customEnv: Record<string, string> | undefined,
  location: ProjectLocation,
  homeVariable: string,
  credentialVariables: readonly string[],
): Record<string, string> | undefined {
  const env: Record<string, string> = {};
  if (homeDir) {
    for (const name of credentialVariables) env[name] = "";
  }
  Object.assign(env, customEnv);
  if (homeDir) env[homeVariable] = resolveHomeProfilePathForLocation(homeDir, location);
  return Object.keys(env).length > 0 ? env : undefined;
}

export function withTerminalAuthEnv(
  status: AgentStatus,
  env: Record<string, string> | undefined,
  fallbackMethod: AgentTerminalAuthMethod,
): AgentStatus {
  if (!env || !status.loginCommand) return status;
  const methods: NonNullable<AgentStatus["authMethods"]> = (status.authMethods ?? []).map(
    (method) =>
      method.type === "terminal" ? { ...method, env: { ...method.env, ...env } } : method,
  );
  if (!methods.some((method) => method.type === "terminal")) {
    methods.push({ ...fallbackMethod, env });
  }
  return { ...status, authMethods: methods };
}
