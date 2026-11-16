import type { Plugin } from "@opencode/plugin/tui";
import { TranscriptRow } from "./rows";
import { StickyPrompt } from "./stickyPrompt";

/**
 * Presents the session transcript the way the desktop chat does: grouped tool
 * activity, quiet accordion rows, the user bubble, and the closing turn line.
 * Rows the desktop has no presentation for fall back to the host's.
 */
export function registerTranscriptUi(context: Plugin.Context) {
  context.ui.slot({
    replace: "session.transcript.row",
    render: (input) => <TranscriptRow context={context} input={input} />,
  });
  context.ui.slot({
    append: "session.transcript.top",
    render: (input) => (
      <StickyPrompt
        context={context}
        sessionID={input.sessionID}
        messageID={input.messageID}
        width={input.width}
        jump={input.jump}
      />
    ),
  });
}
