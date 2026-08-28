import { z } from "zod";

/**
 * The single native-vs-WSL environment union. `RefreshAgentScopeEnv`,
 * `AgentHookPluginEnv`, and `RuntimeChoice` are all structurally this shape;
 * they alias it so every env-scoped feature shares one vocabulary.
 */
export const agentEnvSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("native") }),
  z.object({ kind: z.literal("wsl"), distro: z.string().min(1) }),
]);
export type AgentEnv = z.infer<typeof agentEnvSchema>;

/**
 * Stable string form of an env, identical to the historical `statusEnvKey` /
 * `hookEnvKey` strings ("native" / "wsl:<distro>"), so persisted maps keep
 * their keys.
 */
export function agentEnvKey(env: AgentEnv): string {
  return env.kind === "wsl" ? `wsl:${env.distro}` : "native";
}

/**
 * A machine is one place agents can be installed and run: an env on the local
 * desktop, or an env on a paired remote desktop. Provider-agnostic by design —
 * no agent kinds appear in this model.
 */
export const machineRefSchema = z.discriminatedUnion("host", [
  z.object({ host: z.literal("local"), env: agentEnvSchema }),
  z.object({ host: z.literal("remote"), desktopId: z.string().min(1), env: agentEnvSchema }),
]);
export type MachineRef = z.infer<typeof machineRefSchema>;

export const LOCAL_NATIVE_MACHINE_KEY = "local";

/**
 * Stable string key for settings maps and UI selection:
 * "local" | "local/wsl:<distro>" | "remote:<desktopId>" | "remote:<desktopId>/wsl:<distro>".
 * The env half matches `agentEnvKey`. `desktopId` never contains "/wsl:" —
 * `parseMachineKey` splits on the last occurrence to stay safe regardless.
 */
export function machineKey(ref: MachineRef): string {
  const env = ref.env.kind === "wsl" ? `/wsl:${ref.env.distro}` : "";
  return ref.host === "local" ? `local${env}` : `remote:${ref.desktopId}${env}`;
}

/** Inverse of `machineKey`. Tolerant: returns undefined for malformed keys. */
export function parseMachineKey(key: string): MachineRef | undefined {
  const wslSplit = key.lastIndexOf("/wsl:");
  const hostPart = wslSplit >= 0 ? key.slice(0, wslSplit) : key;
  const distro = wslSplit >= 0 ? key.slice(wslSplit + "/wsl:".length) : undefined;
  if (distro !== undefined && distro.length === 0) return undefined;
  const env: AgentEnv = distro !== undefined ? { kind: "wsl", distro } : { kind: "native" };
  if (hostPart === "local") return { host: "local", env };
  if (hostPart.startsWith("remote:")) {
    const desktopId = hostPart.slice("remote:".length);
    if (!desktopId) return undefined;
    return { host: "remote", desktopId, env };
  }
  return undefined;
}

export const machineKeySchema = z
  .string()
  .min(1)
  .refine((key) => parseMachineKey(key) !== undefined, { message: "Invalid machine key" });

/** Machine key for an env on the local desktop. */
export function localMachineKey(env: AgentEnv): string {
  return machineKey({ host: "local", env });
}

/** Machine key for a project location, honoring its owning remote host. */
export function machineKeyForLocation(location: {
  kind: string;
  distro?: string;
  remoteServerId?: string | undefined;
}): string {
  const env = agentEnvForLocation(location);
  return location.remoteServerId
    ? machineKey({ host: "remote", desktopId: location.remoteServerId, env })
    : machineKey({ host: "local", env });
}

/** Env half of a machine for a project location on its owning host. */
export function agentEnvForLocation(location: { kind: string; distro?: string }): AgentEnv {
  return location.kind === "wsl" && location.distro
    ? { kind: "wsl", distro: location.distro }
    : { kind: "native" };
}

/**
 * Env half of a machine for an agent status. "windows" and "posix" are both
 * the host-native env; only WSL statuses carry a distro.
 */
export function agentEnvForStatus(status: {
  envKind?: string | undefined;
  envDistro?: string | undefined;
}): AgentEnv {
  return status.envKind === "wsl" && status.envDistro
    ? { kind: "wsl", distro: status.envDistro }
    : { kind: "native" };
}
