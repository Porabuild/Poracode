import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useLingui } from "@lingui/react/macro";
import { ThreadComposer } from "@/renderer/components/thread/ThreadComposer";
import { usePrDetailScope } from "../detail/prDetailScope";
import type { PrAskChatSession } from "./prAskSession";

/** An Enter that confirms an input-method composition must not send the question. */
function holdEnterWhileComposing(event: KeyboardEvent<HTMLElement>) {
  if (event.key === "Enter" && event.nativeEvent.isComposing) event.stopPropagation();
}

/**
 * The composer of a review's chat before its thread exists: the app's ordinary
 * thread composer. The first message creates the thread; follow-ups go through the
 * thread pane's own composer. The draft lives in the session, so closing and
 * reopening the chat keeps what was typed.
 */
export function PrAskChatComposer(props: { session: PrAskChatSession; focusOnMount: boolean }) {
  const { session, focusOnMount } = props;
  const { t } = useLingui();
  const scope = usePrDetailScope();
  const { draft, setDraft } = session;
  const [sending, setSending] = useState(false);
  const latestDraft = useRef(draft);
  useLayoutEffect(() => {
    latestDraft.current = draft;
  });
  const pending = sending || session.starting;
  const reason = !session.available
    ? t`Ask is unavailable: no agent can start a chat for this project.`
    : scope.readOnly
      ? t`Ask is unavailable while this pull request is loading or offline.`
      : session.error?.uncertain === true
        ? t`The last launch may already have started. Use Retry above before asking again.`
        : session.error
          ? t`Your question is kept. Use Retry above to send it again.`
          : undefined;
  const canSend = reason === undefined && !pending && !session.busy && draft.trim().length > 0;

  async function submit() {
    if (!canSend) return;
    const text = draft.trim();
    setSending(true);
    try {
      // The text stays until the chat took the message over: a refused or failed
      // send (reason already shown) must not cost the user what they typed.
      const accepted = await session.send(text);
      // Clear only what was sent; the user may have kept typing meanwhile.
      if (accepted && latestDraft.current.trim() === text) setDraft("");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      role="presentation"
      className="shrink-0 px-3 pb-2"
      data-pr-ask-composer
      onKeyDownCapture={holdEnterWhileComposing}
    >
      {reason ? (
        <p role="status" className="mb-2 text-xs text-muted">
          {reason}
        </p>
      ) : null}
      <ThreadComposer
        autoFocus={focusOnMount} // eslint-disable-line jsx-a11y/no-autofocus -- an explicitly opened desktop chat panel expects its composer focused
        variant="active"
        prompt={draft}
        placeholder={t`Ask about this pull request`}
        promptDisabled={reason !== undefined}
        submitLabel={t`Send`}
        submitDisabled={!canSend}
        submitPending={pending}
        controls={[]}
        onPromptChange={setDraft}
        onSubmit={() => {
          void submit();
        }}
      />
    </div>
  );
}
