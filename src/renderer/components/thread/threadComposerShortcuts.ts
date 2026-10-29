import type { KeybindingEntry } from "@/shared/keybindings";
import { modelSelectionFor } from "@/shared/agentSelection";
import {
  type ComposerActionId,
  resolveComposerActionId,
} from "@/renderer/commands/composerCommands";
import type { PlatformName } from "@/renderer/commands/keybindingMatcher";
import type { ComposerControl, OptionMenuOption } from "./ThreadComposer";

type ComposerShortcutEvent = {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  preventDefault: () => void;
};

function optionId(option: OptionMenuOption): string {
  return typeof option === "string" ? option : option.id;
}

function cycleValue(
  value: string | undefined,
  options: readonly OptionMenuOption[],
): string | undefined {
  if (options.length < 2) return undefined;
  const ids = options.map(optionId);
  const currentIndex = value ? ids.indexOf(value) : -1;
  return ids[(currentIndex + 1) % ids.length];
}

function toggleControl(control: ComposerControl): boolean {
  if (
    control.kind !== "toggle" ||
    control.isDisabled ||
    control.disabledReason ||
    !control.onChange
  )
    return false;
  control.onChange(!control.isSelected);
  return true;
}

function cycleMenuControl(control: ComposerControl): boolean {
  if (
    control.kind === "toggle" ||
    control.kind === "static" ||
    control.kind === "provider-model" ||
    control.kind === "effort-context" ||
    control.kind === "crew" ||
    control.isDisabled ||
    !control.onChange
  ) {
    return false;
  }

  const next = cycleValue(control.value, control.options);
  if (!next) return false;
  control.onChange(next);
  return true;
}

function cycleEffortControl(control: ComposerControl): boolean {
  if (
    control.kind !== "effort-context" ||
    control.isDisabled ||
    !control.onEffortChange ||
    control.efforts.length < 2
  ) {
    return false;
  }

  const ids = control.efforts.map((effort) => effort.id);
  const currentIndex = control.effortValue ? ids.indexOf(control.effortValue) : -1;
  control.onEffortChange(ids[(currentIndex + 1) % ids.length]!);
  return true;
}

function handleAction(event: ComposerShortcutEvent, action: () => boolean): boolean {
  const handled = action();
  if (handled) {
    event.preventDefault();
  }
  return handled;
}

export function handleComposerControlShortcut(
  event: ComposerShortcutEvent,
  input: {
    controls: readonly ComposerControl[];
    onOpenModelPicker: () => void;
    /** Press the focused composer's voice-input button. Returns false (a no-op)
     *  when dictation is unavailable, so the key falls through. */
    onStartDictation?: () => boolean;
    keybindings: readonly KeybindingEntry[];
    platform: PlatformName;
  },
): boolean {
  const action = resolveComposerActionId(event, input.keybindings, input.platform);
  if (!action) return false;
  return handleAction(event, () => runComposerAction(action, input));
}

function runComposerAction(
  action: ComposerActionId,
  input: {
    controls: readonly ComposerControl[];
    onOpenModelPicker: () => void;
    onStartDictation?: () => boolean;
  },
): boolean {
  switch (action) {
    case "toggle-work-plan": {
      const control = input.controls.find(
        (candidate) =>
          candidate.kind === "toggle" && (candidate.label === "Work" || candidate.label === "Plan"),
      );
      return control ? toggleControl(control) : false;
    }
    case "cycle-effort": {
      const control = input.controls.find((candidate) => candidate.kind === "effort-context");
      return control ? cycleEffortControl(control) : false;
    }
    case "toggle-fast": {
      // Prefer the ordinary composer toggle, paired relations included.
      const control = input.controls.find(
        (candidate) => candidate.kind === "toggle" && candidate.label === "Fast",
      );
      if (control) return toggleControl(control);
      // An active crew has no toolbar Fast toggle: each member carries its own.
      const crew = input.controls.find((candidate) => candidate.kind === "crew");
      if (!crew || crew.isDisabled || crew.model.isDisabled) return false;
      // The producer's descriptor is authoritative: it already carries encoded
      // family Fast and emits the canonical family-resolved edit.
      if (crew.model.leadFastControl) return toggleControl(crew.model.leadFastControl);
      const leadProvider = crew.model.leadProviders.find(
        (provider) => provider.kind === crew.model.lead.agentKind,
      );
      if (!leadProvider) return false;
      if (
        modelSelectionFor(leadProvider.capabilities, crew.model.lead.model).fast.available !== true
      ) {
        return false;
      }
      crew.model.onLeadChange({ ...crew.model.lead, fast: !crew.model.lead.fast });
      return true;
    }
    case "cycle-permission": {
      const control = input.controls.find((candidate) => {
        if (
          candidate.kind === "static" ||
          candidate.kind === "provider-model" ||
          candidate.kind === "effort-context" ||
          candidate.kind === "crew"
        ) {
          return false;
        }
        return candidate.iconKind === "permission";
      });
      if (!control) return false;
      return control.kind === "toggle" ? toggleControl(control) : cycleMenuControl(control);
    }
    case "open-model-picker": {
      const control = input.controls.find(
        (candidate) => candidate.kind === "provider-model" && !candidate.isDisabled,
      );
      if (!control) return false;
      input.onOpenModelPicker();
      return true;
    }
    case "start-dictation": {
      return input.onStartDictation?.() ?? false;
    }
  }
}
