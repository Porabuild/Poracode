import { chatFileLocalPath, chatFileName, type ChatFileSource } from "@/shared/chatFile";
import { useChatPaneActions } from "../../chatPaneActionsContext";
import { InlineFilePathChip } from "./InlineFilePathChip";

export function MarkdownFile({ src, name, mimeType }: ChatFileSource) {
  const actions = useChatPaneActions();
  return (
    <InlineFilePathChip
      path={chatFileLocalPath(src) ?? src}
      name={chatFileName(src, name)}
      {...(mimeType ? { mimeType } : {})}
      onOpen={actions?.openProjectRelativePath}
    />
  );
}
