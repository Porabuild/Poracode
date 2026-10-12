import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { TOOL_NAME_CASES, KIND_CASES } from "./names";
import { NAME_ALIAS_CASES, SUMMARY_CASES } from "./name-aliases";
import { PAYLOAD_CASES } from "./payload-cases";
import { BODY_ALIAS_CASES } from "./body-aliases";
import { IMAGE_FORM_CASES } from "./media-forms";
import { CONTROL_STATE_CASES } from "./control-states";
import { COMMAND_RECOGNITION_CASES } from "./commands";

export const ALL_TAXONOMY_CASES = [
  ...TOOL_NAME_CASES,
  ...KIND_CASES,
  ...NAME_ALIAS_CASES,
  ...SUMMARY_CASES,
  ...PAYLOAD_CASES,
  ...BODY_ALIAS_CASES,
  ...IMAGE_FORM_CASES,
  ...CONTROL_STATE_CASES,
  ...COMMAND_RECOGNITION_CASES,
];
export function taxonomyItem(id: string, suffix = ""): RuntimeChatItem {
  const fixture = ALL_TAXONOMY_CASES.find((c) => c.id === id);
  if (!fixture) throw new Error(`Unknown taxonomy fixture: ${id}`);
  const item = structuredClone(fixture.item);
  item.id += suffix;
  return item;
}
