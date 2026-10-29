import {
  getExtensionStore,
  type AcpTextStreamExtension,
} from "../acp/canonicalMapping/textStreamExtension";

/** `_meta` key the fx transform sets on every chunk of a "[context]" notice. */
export const FX_CONTEXT_NOTICE_META_KEY = "poracodeFxContextNotice";

export function isFxContextNoticeText(text: string): boolean {
  return text.startsWith("[context] ");
}

interface FxContextNoticeState {
  pending: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * fx streams context-loading diagnostics as ordinary assistant text (budget
 * notices at every session start/resume, schema truncation after
 * capability_search). Its transform marks those chunks so this extension can
 * turn each into a hidden warning instead of transcript prose.
 */
export const fxContextNoticeExtension: AcpTextStreamExtension = {
  id: "fx-context-notices",
  observeSessionUpdate({ state, update }) {
    const meta = asRecord(update._meta);
    // Reset on every update: the flag belongs to one chunk only.
    getExtensionStore<FxContextNoticeState>(state, this.id, () => ({ pending: false })).pending =
      update.sessionUpdate === "agent_message_chunk" && meta?.[FX_CONTEXT_NOTICE_META_KEY] === true;
    return [];
  },
  handleAgentText({ text, state, suppressOutput }) {
    const notice = getExtensionStore<FxContextNoticeState>(state, this.id, () => ({
      pending: false,
    }));
    if (!notice.pending) return { events: [], text };
    notice.pending = false;
    const message = text.trim();
    return {
      events:
        suppressOutput || message.length === 0
          ? []
          : [{ type: "warning", threadId: state.threadId, message }],
      text: "",
    };
  },
};
