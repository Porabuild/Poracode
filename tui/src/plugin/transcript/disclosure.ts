import type { Renderable } from "@opentui/core";
import type { Plugin } from "@opencode/plugin/tui";
import type { TranscriptRowInput } from "@opencode/plugin/tui/context";

/** Disclosure kept in the host's per-session store; the anchor keeps the toggled row in view. */
export function useDisclosure(
  context: Plugin.Context,
  disclosure: TranscriptRowInput["disclosure"],
  key: () => string,
  fallback: () => boolean,
) {
  const expanded = () => disclosure.get(key()) ?? fallback();
  return {
    expanded,
    toggle(anchor?: Renderable | null) {
      if (context.renderer.getSelection()?.getSelectedText()) return;
      disclosure.set(key(), !expanded(), anchor);
    },
  };
}
