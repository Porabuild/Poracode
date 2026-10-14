import type { ModelSelection } from "@/shared/selectionBinding.schemas.ts";
import { assertOneShotControlsMapped } from "../base";
import { resolveCursorCliModel } from "./argv";

/** Cursor's auto routing has no model id on which to encode modifiers. */
export function resolveCursorOneShotModel(selection: ModelSelection): string {
  const explicitModel = Boolean(selection.model && selection.model !== "auto");
  assertOneShotControlsMapped(selection, {
    effort: explicitModel ? true : { inactive: [""] },
    fast: explicitModel ? true : { inactive: [false] },
    thinking: explicitModel ? true : { inactive: [false] },
  });
  return resolveCursorCliModel(selection);
}
