import type { ConfigNormalizerInput } from "../providerComposer";

/** Preserve a model across CLI/native catalog casing without changing wire IDs. */
export function normalizeCommandCodeModelConfig<T extends { model?: string | undefined }>(
  config: T,
  models: readonly { id: string }[],
): T {
  const model = config.model;
  if (!model || models.some(({ id }) => id === model)) return config;
  const target = models.find(({ id }) => id.toLowerCase() === model.toLowerCase());
  return target ? { ...config, model: target.id } : config;
}

/** Translate saved permission intent into the active surface's policy IDs. */
export function normalizeCommandCodeConfig({
  capabilities,
  config,
}: Pick<ConfigNormalizerInput, "capabilities" | "config">) {
  const policy = config.approvalPolicy;
  const ids = capabilities.approvalPolicies.map(({ id }) => id);
  if (policy === undefined || ids.includes(policy)) return {};
  const aliases =
    policy === "auto_edit" || policy === "auto-accept"
      ? ["auto_edit", "auto-accept"]
      : policy === "yolo" || policy === "never" || policy === "bypass"
        ? ["yolo", "never", "bypass"]
        : [];
  const equivalent = aliases.find((id) => ids.includes(id));
  return equivalent ? { approvalPolicy: equivalent } : {};
}
