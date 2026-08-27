import type { AgentAdapter } from "./types";

/**
 * Resolve the model a utility one-shot should run with: the caller's explicit
 * pick, else the adapter's default. An empty result is only allowed when the
 * adapter opted into implicit models (`allowsImplicitOneShotModel`) — CLI
 * adapters may then omit `--model` and use the target environment's own live
 * default. `makeNoModelError` supplies the caller-facing error so each
 * generator keeps its own localized message.
 */
export function resolveOneShotEffectiveModel(
  adapter: Pick<AgentAdapter, "defaultOneShotModel" | "allowsImplicitOneShotModel" | "label">,
  model: string | undefined,
  makeNoModelError: () => Error,
): string {
  const effectiveModel = model ?? adapter.defaultOneShotModel ?? "";
  if (!effectiveModel && !adapter.allowsImplicitOneShotModel) {
    throw makeNoModelError();
  }
  return effectiveModel;
}
