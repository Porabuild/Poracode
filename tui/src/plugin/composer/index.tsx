import { createResource, createSignal, For, onCleanup, Show } from "solid-js";
import type { BoxRenderable, RGBA } from "@opentui/core";
import type { Plugin } from "@opencode/plugin/tui";
import type { Adapter } from "../../adapter";
import { endTruncate, textWidth } from "../textFit";
import { formatEffortLabel } from "../../desktop/presentation";
import { composerChips, type ComposerChip } from "./model";
import { configureSessionToggles } from "./actions";

/**
 * The desktop composer control row as ghost chips: model, effort, options, fast,
 * approval, plan, auto — plus the thread's git changes and send action on the
 * right. Claims the host's `prompt.metadata` slot; without this claim the host
 * row renders.
 */
export function registerComposerUi(context: Plugin.Context, adapter: Adapter) {
  context.ui.slot({
    replace: "prompt.metadata",
    render: (input) => <ComposerMetadata context={context} adapter={adapter} input={input} />,
  });
  context.keymap.layer(() => ({
    mode: "global",
    priority: 1,
    commands: [
      {
        id: "variant.list",
        title: "Change reasoning effort",
        group: "Agent",
        enabled: () => context.ui.model.variant.list().length > 1,
        palette: true,
        slash: { name: "effort", aliases: ["variants", "thinking"] },
        run: async () => {
          const model = context.ui.model.current();
          if (!model) return;
          const reasoning = await adapter.modelReasoning(model.providerID, model.modelID);
          if (!reasoning || reasoning.values.length < 2) return;
          const current = reasoning.values.includes(model.variant ?? "")
            ? model.variant
            : reasoning.default;
          const choice = await context.ui.dialog.select({
            title: "Reasoning effort",
            current,
            options: reasoning.values.map((id) => ({ title: formatEffortLabel(id), value: id })),
          });
          const selected = context.ui.model.current();
          if (
            choice &&
            selected?.providerID === model.providerID &&
            selected.modelID === model.modelID
          )
            context.ui.model.variant.set(choice);
        },
      },
      {
        id: "variant.cycle",
        title: "Cycle reasoning effort",
        group: "Agent",
        enabled: () => context.ui.model.variant.list().length > 1,
        run: async () => {
          const model = context.ui.model.current();
          if (!model) return;
          const reasoning = await adapter.modelReasoning(model.providerID, model.modelID);
          const selected = context.ui.model.current();
          if (
            !reasoning ||
            selected?.providerID !== model.providerID ||
            selected.modelID !== model.modelID
          )
            return;
          const values = reasoning.values;
          if (values.length < 2) return;
          const index = values.indexOf(selected.variant ?? reasoning.default ?? "");
          context.ui.model.variant.set(values[(index + 1) % values.length]);
        },
      },
    ],
  }));
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
    case "effort":
    case "approval":
      return textWidth(chip.label) + 2;
    case "fast":
      return 4;
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
    canSubmit?: boolean;
    running?: boolean;
    submit?: () => void;
    interrupt?: () => void;
  };
}) {
  const context = props.context;
  const theme = () => context.theme;
  const [hovered, setHovered] = createSignal<string>();
  const [rowWidth, setRowWidth] = createSignal<number>();
  // createResource only refetches when its source value changes, so mutations
  // and the 15 s poll call refetch() directly. composerState re-reads
  // listThreads/sessionOptions on each refetch; gitChanges resolves the
  // thread through the cached lookup, so the poll does not page the host.
  const model = () => context.ui.model.current();
  const variants = () => context.ui.model.variant.list();
  const [reasoning] = createResource(
    () => {
      const current = model();
      return current && variants().length > 1 ? current : false;
    },
    (current) => props.adapter.modelReasoning(current.providerID, current.modelID),
  );
  const [draftApproval, draftApprovalActions] = createResource(
    () => !props.input.sessionID && model()?.providerID,
    async (providerID) => ({
      providerID,
      approval: await props.adapter.draftApprovalState(providerID),
    }),
  );
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

  const approval = () => {
    if (props.input.sessionID) return state()?.approval;
    const draft = draftApproval();
    return draft && draft.providerID === model()?.providerID ? draft.approval : undefined;
  };
  const chips = () =>
    composerChips({
      mode: props.input.mode,
      agent: props.input.agent,
      auto: props.input.auto,
      model: props.input.model,
      provider: props.input.provider,
      sessionID: props.input.sessionID,
      variants: variants(),
      variant: model()?.variant ?? reasoning()?.default,
      approval: approval(),
      state: state(),
      changes: changes(),
    });
  const left = () => chips().filter((chip) => chip.kind !== "changes");
  const right = () => chips().find((chip): chip is ChangesChip => chip.kind === "changes");

  // Fit: reserve the other chips' width and send action, give the model chip
  // the rest; drop the provider suffix first, then end-truncate the model label.
  const modelBudget = () => {
    const available = rowWidth() ?? props.input.width;
    const others = left().filter((chip) => chip.kind !== "model");
    const used = others.reduce((total, chip) => total + chipLabelWidth(chip) + 2, 0);
    const rightChip = right();
    const rightWidth = rightChip ? chipLabelWidth(rightChip) + 2 : 0;
    const spacerGap = 2;
    const actionWidth = 8;
    return Math.max(4, available - used - rightWidth - spacerGap - actionWidth);
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
  const chevronFg = (id: string): RGBA =>
    hovered() === id && !props.input.muted ? theme().text.brand : fg("muted");

  const canSubmit = () => Boolean(props.input.canSubmit);
  const showStop = () => Boolean(props.input.running) && !canSubmit();
  const actionLabelFg = (): RGBA => {
    if (props.input.muted) return theme().background.raised.max;
    if (canSubmit()) return hovered() === "send" ? theme().text.brand : theme().text.base;
    if (showStop())
      return hovered() === "send" ? theme().text.feedback.error.base : theme().text.base;
    return hovered() === "send" ? theme().text.muted : theme().background.raised.max;
  };
  const actionGlyphFg = (): RGBA => {
    if (props.input.muted) return theme().background.raised.max;
    if (canSubmit()) return hovered() === "send" ? theme().hue.accent[100] : theme().text.brand;
    if (showStop()) return theme().text.feedback.error.base;
    return hovered() === "send" ? theme().text.muted : theme().background.raised.max;
  };
  const triggerAction = () => {
    if (props.input.muted) return;
    if (canSubmit()) {
      props.input.submit?.();
      return;
    }
    if (showStop()) props.input.interrupt?.();
  };

  const activate = (chip: ComposerChip) => {
    const sessionID = props.input.sessionID;
    switch (chip.kind) {
      case "model":
        context.keymap.dispatch("model.list");
        return;
      case "effort":
        context.keymap.dispatch("variant.list");
        return;
      case "options":
        if (sessionID)
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
        const policy = approval();
        const providerID = model()?.providerID;
        if (!policy) return;
        void context.ui.dialog
          .select<string>({
            title: "Approval policy",
            current: policy.current,
            options: policy.options.map((option) => ({
              title: option.label,
              value: option.id,
            })),
          })
          .then((choice) => {
            if (!choice) return;
            if (!sessionID) {
              if (providerID && model()?.providerID === providerID && !props.input.sessionID)
                return props.adapter.setDraftApproval(providerID, choice).then(() => {
                  void draftApprovalActions.refetch();
                });
              return;
            }
            void props.adapter
              .setSessionOptions(sessionID, { approvalPolicy: choice })
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
    <box
      flexDirection="row"
      gap={2}
      flexGrow={1}
      flexShrink={1}
      minWidth={0}
      height={1}
      onSizeChange={function (this: BoxRenderable) {
        const width = this.width;
        queueMicrotask(() => setRowWidth(width));
      }}
    >
      <Show when={props.input.mode === "shell"}>
        <box height={1} flexGrow={1}>
          <text fg={theme().text.feedback.warning.base}>Shell</text>
        </box>
      </Show>
      <Show when={props.input.mode === "normal" && props.input.agent === undefined}>
        <box height={1} flexGrow={1} />
      </Show>
      <Show when={props.input.mode === "normal" && props.input.agent !== undefined}>
        <box flexDirection="row" gap={2} flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
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
                  chevronFg={chevronFg(chip.kind)}
                  mutedAll={props.input.muted}
                  planColor={theme().text.brand}
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
      <box
        height={1}
        flexShrink={0}
        onMouseOver={() => setHovered("send")}
        onMouseOut={() => setHovered(undefined)}
        onMouseUp={triggerAction}
      >
        <text wrapMode="none">
          <span style={{ fg: actionLabelFg() }}>{showStop() ? "Stop " : "Send "}</span>
          <span style={{ fg: actionGlyphFg() }}>{showStop() ? "■" : "↑"}</span>
        </text>
      </box>
    </box>
  );
}

function SwitchChip(props: {
  chip: ComposerChip;
  modelParts?: { model: string; provider: string };
  fg: (part: "base" | "muted") => RGBA;
  chevronFg: RGBA;
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
        <span style={{ fg: props.chevronFg }}> ▾</span>
      </text>
    );
  if (chip.kind === "options" || chip.kind === "effort" || chip.kind === "approval")
    return (
      <text>
        <span style={{ fg: props.fg("base") }}>{chip.label}</span>
        <span style={{ fg: props.chevronFg }}> ▾</span>
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
