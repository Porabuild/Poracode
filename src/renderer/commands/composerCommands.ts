import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import type { KeybindingEntry } from "@/shared/keybindings";
import {
  bindingForPlatform,
  canonicalizeKeybinding,
  type ChordEvent,
  eventToKeybinding,
  type PlatformName,
} from "./keybindingMatcher";

/**
 * Composer-control shortcuts are user-rebindable (they live in keybindings.json)
 * but dispatched locally by the focused composer rather than the global keyboard
 * hook — the handler needs the composer's live controls. {@link ComposerActionId}
 * is the stable action a chord resolves to; the command `id` matches the
 * keybinding entry's `command`.
 */
export type ComposerActionId =
  | "toggle-work-plan"
  | "cycle-effort"
  | "toggle-fast"
  | "cycle-permission"
  | "open-model-picker"
  | "start-dictation";

export interface ComposerControlCommand {
  id: string;
  action: ComposerActionId;
  title: MessageDescriptor;
  description: MessageDescriptor;
}

/** The toggle/cycle/menu entries reuse the exact `msg` sources their rows used
 * while read-only, so they add no catalog strings. `start-dictation` is a
 * composer action too (rebindable, locally dispatched) but isn't a toolbar
 * control — it presses the focused composer's voice-input button — so it
 * carries its own title/description strings. `id` mirrors the keybinding
 * command id. */
export const COMPOSER_CONTROL_COMMANDS: readonly ComposerControlCommand[] = [
  {
    id: "composer.toggle-work-plan",
    action: "toggle-work-plan",
    title: msg`Toggle Work or Plan`,
    description: msg`Composer controls`,
  },
  {
    id: "composer.cycle-effort",
    action: "cycle-effort",
    title: msg`Cycle reasoning effort`,
    description: msg`Composer controls`,
  },
  {
    id: "composer.toggle-fast",
    action: "toggle-fast",
    title: msg`Toggle Fast mode`,
    description: msg`Composer controls`,
  },
  {
    id: "composer.cycle-permission",
    action: "cycle-permission",
    title: msg`Cycle permission mode`,
    description: msg`Composer controls`,
  },
  {
    id: "composer.open-model-picker",
    action: "open-model-picker",
    title: msg`Open model picker`,
    description: msg`Composer controls`,
  },
  {
    id: "composer.start-dictation",
    action: "start-dictation",
    title: msg`Start dictation`,
    description: msg`Start dictation in the current composer`,
  },
];

/**
 * Resolve a pressed chord to the composer action it's bound to, or `null` when
 * no composer command matches. Reads the live keybinding list so user rebinds
 * take effect immediately.
 */
export function resolveComposerActionId(
  event: ChordEvent,
  keybindings: readonly KeybindingEntry[],
  platform: PlatformName,
): ComposerActionId | null {
  const chord = eventToKeybinding(event, platform);
  if (!chord) return null;

  for (const command of COMPOSER_CONTROL_COMMANDS) {
    for (const binding of keybindings) {
      if (binding.command !== command.id) continue;
      const raw = bindingForPlatform(binding, platform);
      if (raw && canonicalizeKeybinding(raw, platform) === chord) return command.action;
    }
  }
  return null;
}
