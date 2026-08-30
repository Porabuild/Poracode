import type { AgentAuthMethod } from "@/shared/contracts";
import type { AgentMetadata, CommandSpec, DetectionSpec } from "./types";

/**
 * Merge env layers for an agent spawn, most-general first. Later layers win.
 *
 * Returns `undefined` rather than `{}` when nothing is contributed, so callers
 * can conditionally spread into option objects under
 * `exactOptionalPropertyTypes` without inventing an empty env.
 */
export function mergeSpawnEnv(
  ...layers: ReadonlyArray<Record<string, string> | undefined>
): Record<string, string> | undefined {
  let merged: Record<string, string> | undefined;
  for (const layer of layers) {
    if (!layer) continue;
    for (const [key, value] of Object.entries(layer)) {
      merged ??= {};
      merged[key] = value;
    }
  }
  return merged;
}

/**
 * Apply `baseSpawnEnv` to a command-level spawn (one-shots, context
 * extraction, subagent children, ACP session/auth/logout commands). The
 * command's own `env` wins on conflict — a lane-specific override stays
 * authoritative. Returns the original object unchanged when nothing is
 * contributed, so callers never invent an empty env.
 *
 * Generic over the command shape so lane-specific extras survive the wrap:
 * several callers pass a superset of `CommandSpec` (a one-shot's `stdin`, an
 * `isolateCwd` flag) and go on to read those fields off the result.
 */
export function withCommandBaseSpawnEnv<T extends CommandSpec>(
  command: T,
  baseSpawnEnv: Record<string, string> | undefined,
): T {
  const env = mergeSpawnEnv(baseSpawnEnv, command.env);
  return env ? { ...command, env } : command;
}

/**
 * Apply `baseSpawnEnv` to every terminal auth method in a detected status.
 *
 * Terminal login is built in the renderer from `AgentStatus.authMethods` (it
 * prefixes `env` onto the login command), so status assembly is the only place
 * shared code can reach that lane. Method-declared env wins on conflict — a
 * provider that deliberately overrides a value for login keeps it.
 */
export function withBaseSpawnEnv(
  methods: readonly AgentAuthMethod[],
  baseSpawnEnv: Record<string, string> | undefined,
): AgentAuthMethod[] {
  if (!baseSpawnEnv) return [...methods];
  return methods.map((method) => {
    if (method.type !== "terminal") return method;
    const env = mergeSpawnEnv(baseSpawnEnv, method.env);
    return env ? { ...method, env } : method;
  });
}

/**
 * Spread helper for adapters deriving `baseSpawnEnv` from their detection spec:
 * `...inheritBaseSpawnEnv(fooDetectionSpec)`.
 *
 * Providers must never re-declare the literal on the adapter — deriving it is
 * what keeps the two from drifting. `exactOptionalPropertyTypes` rejects a plain
 * `baseSpawnEnv: spec.baseSpawnEnv` assignment because the spec's value is
 * optional, and a conditional spread at every call site is noise, so it lives
 * here once.
 */
export function inheritBaseSpawnEnv(
  spec: Pick<DetectionSpec, "baseSpawnEnv">,
): Pick<AgentMetadata, "baseSpawnEnv"> {
  return spec.baseSpawnEnv ? { baseSpawnEnv: spec.baseSpawnEnv } : {};
}
