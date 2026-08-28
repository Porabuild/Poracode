import { msg } from "@lingui/core/macro";
import { i18n } from "@/renderer/i18n/i18n";
import type { AgentEnv, MachineRef } from "@/shared/machines";

/**
 * The one user-facing label convention for machines and envs. Replaces the
 * historical trio (`"Windows"`/`"WSL (X)"`, `"Native"`/`"WSL · X"`,
 * `"Windows"`/`"WSL: X"`) so every surface names a machine the same way.
 */
export function localEnvLabel(env: AgentEnv): string {
  return env.kind === "wsl" ? i18n._(msg`WSL · ${env.distro}`) : i18n._(msg`This computer`);
}

/** Label for a machine; remote names come from the paired server record. */
export function machineLabel(
  ref: MachineRef,
  options: { remoteName: (desktopId: string) => string },
): string {
  if (ref.host === "local") return localEnvLabel(ref.env);
  const serverName = options.remoteName(ref.desktopId);
  return ref.env.kind === "wsl" ? i18n._(msg`${serverName} · WSL ${ref.env.distro}`) : serverName;
}
