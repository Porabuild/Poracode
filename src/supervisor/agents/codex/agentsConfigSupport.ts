import { codexVersionSupportsAgentsConfig } from "@/shared/agents/codexAgentSettings";
import type { ProjectLocation } from "@/shared/contracts";
import { probeCodexCliSemver } from "./plugin/install";

/**
 * Whether the Codex CLI that will run for `location` accepts the `agents.*`
 * config overrides. Detection primes the answer from the detected version; an
 * unprimed native location probes `codex --version` once. An unknown version
 * is unsupported: skipping an override is harmless, a rejected key stops every
 * launch.
 */
const supportCache = new Map<string, boolean>();

const supportKey = (location: ProjectLocation) =>
  location.kind === "wsl" ? `wsl:${location.distro}` : "native";

export function isCodexAgentsConfigSupported(location: ProjectLocation): boolean {
  const key = supportKey(location);
  const cached = supportCache.get(key);
  if (cached !== undefined) return cached;
  if (location.kind === "wsl") return false;
  const supported = codexVersionSupportsAgentsConfig(probeCodexCliSemver()?.join("."));
  supportCache.set(key, supported);
  return supported;
}

export function primeCodexAgentsConfigSupport(
  location: ProjectLocation,
  version: string | undefined,
): void {
  supportCache.set(supportKey(location), codexVersionSupportsAgentsConfig(version));
}
