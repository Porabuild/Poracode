import { createSignal, Show } from "solid-js";
import type { Plugin } from "@opencode/plugin/tui";
import { endTruncate } from "../textFit";

/**
 * The desktop's sticky prompt header: a one-line bar naming the prompt the
 * visible transcript answers, pinned over the transcript top while that
 * prompt's rows are scrolled out of view. Clicking jumps back to it.
 */
export function StickyPrompt(props: {
  context: Plugin.Context;
  sessionID: string;
  messageID?: string;
  width: number;
  jump: (messageID: string) => void;
}) {
  const theme = () => props.context.theme;
  const [hovered, setHovered] = createSignal(false);
  const label = () => {
    const info = props.messageID
      ? props.context.data.session.message.get(props.sessionID, props.messageID)
      : undefined;
    const text = info?.type === "user" ? info.text : "";
    return endTruncate(text.replace(/\s+/gu, " ").trim(), Math.max(0, props.width - 2));
  };
  return (
    <Show when={props.messageID && label()}>
      <box
        width="100%"
        height={1}
        paddingX={1}
        backgroundColor={theme().background.raised.base}
        onMouseOver={() => setHovered(true)}
        onMouseOut={() => setHovered(false)}
        onMouseUp={() => {
          if (props.context.renderer.getSelection()?.getSelectedText()) return;
          if (props.messageID) props.jump(props.messageID);
        }}
      >
        <text fg={hovered() ? theme().text.base : theme().text.muted}>{label()}</text>
      </box>
    </Show>
  );
}
