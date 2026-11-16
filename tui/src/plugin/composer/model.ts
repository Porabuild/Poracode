import { formatEffortLabel } from "../../desktop/presentation";

export type ComposerState = {
  approval?: {
    current: string;
    label: string;
    options: readonly { id: string; label: string }[];
  };
  fast?: { on: boolean; disabledReason?: string };
  thinking?: { on: boolean };
  workflows?: { on: boolean; label: string };
  context?: {
    current?: string;
    label?: string;
    options: readonly { id: string; label: string }[];
  };
};

export type ComposerChanges = {
  insertions: number;
  deletions: number;
  worktree?: string;
};

export type ComposerChip =
  | { kind: "shell" }
  | { kind: "model"; model: string; provider: string }
  | { kind: "options"; label: string; variants: boolean }
  | { kind: "fast"; on: boolean; disabledReason?: string }
  | { kind: "approval"; label: string }
  | { kind: "plan" }
  | { kind: "auto" }
  | { kind: "changes"; changes: ComposerChanges };

/**
 * The desktop composer control row, reduced to chip descriptors: which chips
 * show and what they say. Actions stay in the component.
 */
export function composerChips(input: {
  mode: "normal" | "shell";
  agent?: string;
  auto: boolean;
  model: string;
  provider: string;
  sessionID?: string;
  /** Variant IDs of the selected model (context.model.variant.list()). */
  variants: readonly string[];
  /** Selected variant id; undefined for the model default. */
  variant?: string;
  state: ComposerState | undefined;
  changes: ComposerChanges | undefined;
}): ComposerChip[] {
  if (input.mode === "shell") return [{ kind: "shell" }];
  if (input.agent === undefined) return [];
  const chips: ComposerChip[] = [{ kind: "model", model: input.model, provider: input.provider }];
  const state = input.state;
  const variants = input.variants.length > 1;
  const contextSizes = (state?.context?.options.length ?? 0) > 1;
  const parts: string[] = [];
  if (variants && input.variant) parts.push(formatEffortLabel(input.variant));
  if (contextSizes && state?.context?.label) parts.push(state.context.label);
  if (state?.workflows?.on) parts.push(state.workflows.label);
  const optionsLabel = parts.join(" · ") || (state?.thinking ? "Thinking" : "Options");
  if (variants || contextSizes || state?.thinking || state?.workflows)
    chips.push({ kind: "options", label: optionsLabel, variants });
  if (state?.fast)
    chips.push({
      kind: "fast",
      on: state.fast.on,
      ...(state.fast.disabledReason ? { disabledReason: state.fast.disabledReason } : {}),
    });
  if (input.sessionID && state?.approval)
    chips.push({ kind: "approval", label: state.approval.label });
  if (input.agent === "Plan") chips.push({ kind: "plan" });
  if (input.auto) chips.push({ kind: "auto" });
  if (
    input.sessionID &&
    input.changes &&
    (input.changes.insertions + input.changes.deletions > 0 || input.changes.worktree)
  )
    chips.push({ kind: "changes", changes: input.changes });
  return chips;
}
