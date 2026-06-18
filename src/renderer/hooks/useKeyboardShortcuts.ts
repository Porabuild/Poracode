import { useEffect } from "react";
import { readBridge } from "@/renderer/bridge";
import { isCapturingKeybinding } from "@/renderer/commands/keybindingCapture";
import { useKeybindingStore } from "@/renderer/commands/keybindingStore";
import {
  bindingForPlatform,
  canonicalizeKeybinding,
  eventToKeybinding,
} from "@/renderer/commands/keybindingMatcher";
import {
  buildCommandRegistry,
  buildWhenContext,
  isCommandAvailable,
} from "@/renderer/commands/registry";
import { evaluateWhenClause } from "@/renderer/commands/when";

export function useKeyboardShortcuts() {
  useEffect(() => {
    void useKeybindingStore
      .getState()
      .load()
      .catch((error) => {
        console.error("[renderer] failed to load keybindings:", error);
      });

    function onKeyDown(e: KeyboardEvent) {
      // The Shortcuts editor is recording a chord — let it capture the keystroke
      // instead of dispatching whatever command that chord is currently bound to.
      if (isCapturingKeybinding()) return;
      const eventKey = eventToKeybinding(e, readBridge().platform);
      if (!eventKey) return;

      const bindings = useKeybindingStore.getState().keybindings;
      const whenContext = buildWhenContext(e.target);
      const commands = buildCommandRegistry();

      for (const binding of bindings) {
        const rawBinding = bindingForPlatform(binding, readBridge().platform);
        const normalized = rawBinding
          ? canonicalizeKeybinding(rawBinding, readBridge().platform)
          : undefined;
        if (normalized !== eventKey) continue;
        if (!evaluateWhenClause(binding.when, whenContext)) continue;

        const command = commands.find((item) => item.id === binding.command);
        if (!command || !isCommandAvailable(command, whenContext)) continue;

        e.preventDefault();
        e.stopPropagation();
        void command.run(binding.args);
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);
}
