import { createResource, createSignal, For, onCleanup, Show } from "solid-js";
import type { RGBA } from "@opentui/core";
import type { Plugin } from "@opencode/plugin/tui";
import type { Adapter } from "../../adapter";
import { endTruncate, textWidth } from "../textFit";
import { composerChips, type ComposerChip } from "./model";
import { configureSessionToggles } from "./actions";

/**
 * The desktop composer control row as ghost chips: model, options, fast,
 * approval, plan, auto — plus the thread's git changes on the right. Claims
 * the host's `prompt.metadata` slot; without this claim the host row renders.
 */
export function registerComposerUi(context: Plugin.Context, adapter: Adapter) {
  context.ui.slot({
    replace: "prompt.metadata",
    render: (input) => <ComposerMetadata context={context} adapter={adapter} input={input} />,
  });
}

type ChangesChip = Extract<ComposerChip, { kind: "changes" }>;

/** The changes chip's text segments (worktree glyph, +N, −M) with their tone. */
function changesChipParts(changes: ChangesChip["changes"]) {
  const parts: { text: string; tone: "muted" | "success" | "error" }[] = [];
  if (changes.worktree) parts.push({ text: "⎇ ", tone: "muted" });
  if (changes.insertions > 0) parts.push({ text: `+${changes.insertions}`, tone: "success" });
  if (changes.insertions > 0 && changes.deletions > 0) parts.push({ text: " ", tone: "muted" });
  if (changes.deletions > 0) parts.push({ text: `-${changes.deletions}`, tone: "error" });
  return parts;
}

function chipLabelWidth(chip: ComposerChip): number {
  switch (chip.kind) {
    case "model":
      return textWidth(chip.model) + (chip.provider ? textWidth(chip.provider) + 1 : 0) + 2;
    case "options":
      return textWidth(chip.label) + 2;
    case "fast":
      return 4;
    case "approval":
      return textWidth(chip.label) + 2;
    case "plan":
      return 6;
    case "auto":
      return 4;
    case "changes":
      return textWidth(
        changesChipParts(chip.changes)
          .map((part) => part.text)
          .join(""),
      );
    default:
      return 0;
  }
}

export function ComposerMetadata(props: {
  context: Plugin.Context;
  adapter: Adapter;
  input: {
    sessionID?: string;
    mode: "normal" | "shell";
    agent?: string;
    auto: boolean;
    model: string;
    provider: string;
    variant?: string;
    muted: boolean;
    width: number;
  };
}) {
  const context = props.context;
  const theme = () => context.theme;
  const [hovered, setHovered] = createSignal<string>();
  // createResource only refetches when its source value changes, so mutations
  // and the 15 s poll call refetch() directly. composerState re-reads
  // listThreads/sessionOptions on each refetch; gitChanges resolves the
  // thread through the cached lookup, so the poll does not page the host.
  const model = () => context.ui.model.current();
  const [state, stateActions] = createResource(
    () => {
      const current = model();
      return props.input.sessionID
        ? `${props.input.sessionID}:${current?.providerID ?? ""}:${current?.modelID ?? ""}:${current?.variant ?? ""}`
        : undefined;
    },
    (key) => (key ? props.adapter.composerState(key.split(":")[0]!) : Promise.resolve(undefined)),
  );
  const [changes, changesActions] = createResource(
    () => {
      const status = props.input.sessionID
        ? context.data.session.status(props.input.sessionID)
        : undefined;
      return props.input.sessionID ? `${props.input.sessionID}:${status ?? ""}` : undefined;
    },
    (key) => (key ? props.adapter.gitChanges(key.split(":")[0]!) : Promise.resolve(undefined)),
  );
  const refresh = () => {
    void stateActions.refetch();
    void changesActions.refetch();
  };
  const refreshChanges = () => void changesActions.refetch();
  const interval = setInterval(refreshChanges, 15_000);
  onCleanup(() => clearInterval(interval));

  const variants = () => context.ui.model.variant.list();
  const chips = () =>
    composerChips({
      mode: props.input.mode,
      agent: props.input.agent,
      auto: props.input.auto,
      model: props.input.model,
      provider: props.input.provider,
      sessionID: props.input.sessionID,
      variants: variants(),
      variant: model()?.variant,
      state: state(),
      changes: changes(),
    });
  const left = () => chips().filter((chip) => chip.kind !== "changes");
  const right = () => chips().find((chip): chip is ChangesChip => chip.kind === "changes");

  // Fit: reserve the other chips' width, give the model chip the rest; drop
  // the provider suffix first, then end-truncate the model label.
  const modelBudget = () => {
    const others = left().filter((chip) => chip.kind !== "model");
    const used = others.reduce((total, chip) => total + chipLabelWidth(chip) + 2, 0);
    const rightChip = right();
    const rightWidth = rightChip ? chipLabelWidth(rightChip) + 2 : 0;
    return Math.max(4, props.input.width - used - rightWidth);
  };
  const modelParts = (chip: Extract<ComposerChip, { kind: "model" }>) => {
    const budget = modelBudget();
    const providerWidth = chip.provider ? textWidth(chip.provider) + 1 : 0;
    if (textWidth(chip.model) + providerWidth + 2 <= budget)
      return { model: chip.model, provider: chip.provider };
    if (textWidth(chip.model) + 2 <= budget) return { model: chip.model, provider: "" };
    return { model: endTruncate(chip.model, Math.max(1, budget - 2)), provider: "" };
  };

  const fg = (part: "base" | "muted"): RGBA => {
    if (props.input.muted) return theme().text.muted;
    return part === "base" ? theme().text.base : theme().text.muted;
  };
  const chipFg = (id: string, part: "base" | "muted"): RGBA =>
    hovered() === id && !props.input.muted ? theme().text.base : fg(part);

  const activate = (chip: ComposerChip) => {
    const sessionID = props.input.sessionID;
    switch (chip.kind) {
      case "model":
        context.keymap.dispatch("model.list");
        return;
      case "options":
        if (chip.variants) context.keymap.dispatch("variant.list");
        else if (sessionID)
          void configureSessionToggles(context, props.adapter, sessionID).then(refresh);
        return;
      case "fast": {
        if (!sessionID) return;
        if (chip.disabledReason) {
          void context.ui.dialog.alert({ title: "Fast mode", message: chip.disabledReason });
          return;
        }
        void props.adapter.setSessionOptions(sessionID, { fast: !chip.on }).then((result) => {
          if ("error" in result)
            void context.ui.dialog.alert({ title: "Fast mode", message: result.error });
          refresh();
        });
        return;
      }
      case "approval": {
        const options = state()?.approval?.options;
        if (!sessionID || !options?.length) return;
        void context.ui.dialog
          .select<string>({
            title: "Approval policy",
            options: options.map((option: { id: string; label: string }) => ({
              title: option.label,
              value: option.id,
            })),
          })
          .then((approval) => {
            if (!approval) return;
            void props.adapter
              .setSessionOptions(sessionID, { approvalPolicy: approval })
              .then((result) => {
                if ("error" in result)
                  void context.ui.dialog.alert({ title: "Approval policy", message: result.error });
                refresh();
              });
          });
        return;
      }
      case "plan":
        context.keymap.dispatch("agent.cycle");
        return;
      case "changes":
        context.keymap.dispatch("diff.open");
        return;
      default:
        return;
    }
  };

  return (
    <box flexDirection="row" flexGrow={1} flexShrink={1} minWidth={0} height={1}>
      <Show when={props.input.mode === "shell"}>
        <box height={1}>
          <text fg={fg("muted")}>Shell</text>
        </box>
      </Show>
      <Show when={props.input.mode === "normal" && props.input.agent === undefined}>
        <box height={1} />
      </Show>
      <Show when={props.input.mode === "normal" && props.input.agent !== undefined}>
        <box flexDirection="row" gap={2} flexGrow={1} flexShrink={1} minWidth={0}>
          <For each={left()}>
            {(chip) => (
              <box
                height={1}
                flexShrink={0}
                onMouseOver={() => setHovered(chip.kind)}
                onMouseOut={() => setHovered(undefined)}
                onMouseUp={() => activate(chip)}
              >
                <SwitchChip
                  chip={chip}
                  modelParts={chip.kind === "model" ? modelParts(chip) : undefined}
                  fg={(part) => chipFg(chip.kind, part)}
                  mutedAll={props.input.muted}
                  planColor={theme().text.action.secondary.base}
                  warningColor={theme().text.feedback.warning.base}
                />
              </box>
            )}
          </For>
          <box flexGrow={1} />
          <Show when={right()}>
            {(chip) => (
              <box
                height={1}
                flexShrink={0}
                onMouseOver={() => setHovered("changes")}
                onMouseOut={() => setHovered(undefined)}
                onMouseUp={() => activate(chip())}
              >
                <text>
                  <For each={changesChipParts(chip().changes)}>
                    {(part) => (
                      <span
                        style={{
                          fg:
                            part.tone === "success"
                              ? theme().text.feedback.success.base
                              : part.tone === "error"
                                ? theme().text.feedback.error.base
                                : chipFg("changes", "muted"),
                        }}
                      >
                        {part.text}
                      </span>
                    )}
                  </For>
                </text>
              </box>
            )}
          </Show>
        </box>
      </Show>
    </box>
  );
}

function SwitchChip(props: {
  chip: ComposerChip;
  modelParts?: { model: string; provider: string };
  fg: (part: "base" | "muted") => RGBA;
  mutedAll: boolean;
  planColor: RGBA;
  warningColor: RGBA;
}) {
  const chip = props.chip;
  if (chip.kind === "model")
    return (
      <text>
        <span style={{ fg: props.fg("base") }}>{props.modelParts?.model}</span>
        {props.modelParts?.provider ? (
          <span style={{ fg: props.fg("muted") }}>{` ${props.modelParts.provider}`}</span>
        ) : null}
        <span style={{ fg: props.fg("muted") }}> ▾</span>
      </text>
    );
  if (chip.kind === "options")
    return (
      <text>
        <span style={{ fg: props.fg("base") }}>{chip.label}</span>
        <span style={{ fg: props.fg("muted") }}> ▾</span>
      </text>
    );
  if (chip.kind === "fast")
    return (
      <text>
        <span
          style={{
            fg: chip.on
              ? props.mutedAll
                ? props.fg("muted")
                : props.warningColor
              : props.fg("muted"),
          }}
        >
          Fast
        </span>
      </text>
    );
  if (chip.kind === "approval")
    return (
      <text>
        <span style={{ fg: props.fg("base") }}>{chip.label}</span>
        <span style={{ fg: props.fg("muted") }}> ▾</span>
      </text>
    );
  if (chip.kind === "plan")
    return (
      <text>
        <span style={{ fg: props.mutedAll ? props.fg("muted") : props.planColor }}>Plan ✕</span>
      </text>
    );
  if (chip.kind === "auto")
    return (
      <text>
        <span style={{ fg: props.fg("muted") }}>auto</span>
      </text>
    );
  return null;
}
