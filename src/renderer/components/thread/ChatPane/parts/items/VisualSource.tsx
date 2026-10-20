import { useContext } from "react";
import { ChatReaderFollowContext } from "../../chatReaderFollow";
import { CodeBlock } from "./CodeBlock";
import type { HighlightLanguage } from "./languageDetect";
import { MAX_RICH_TEXT_CHARS } from "./longPlainText";
import { useWindowedAssistantText } from "./useWindowedAssistantText";
import { WindowedPlainText } from "./WindowedPlainText";

/** Source is escaped text; oversized bodies reuse chat's bounded reader instead of Shiki. */
export function VisualSource({
  text,
  lang,
  isStreaming = false,
}: {
  text: string;
  lang: HighlightLanguage;
  isStreaming?: boolean;
}) {
  return text.length < MAX_RICH_TEXT_CHARS ? (
    <CodeBlock text={text} lang={lang} />
  ) : (
    <WindowedVisualSource text={text} isStreaming={isStreaming} />
  );
}

function WindowedVisualSource({ text, isStreaming }: { text: string; isStreaming: boolean }) {
  const follow = useContext(ChatReaderFollowContext);
  const body = useWindowedAssistantText(text, isStreaming, undefined, follow);
  return (
    <WindowedPlainText
      text={body.window!.text}
      hasEarlier={body.window!.start > 0}
      isBrowsingEarlier={body.isBrowsingEarlier}
      onEarlier={body.showEarlier}
      onLatest={body.showLatest}
    />
  );
}
