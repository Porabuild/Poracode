import { useAppStore } from "@/renderer/state/appStore";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import type { CheckpointRevertRequest } from "../CheckpointRevertControls";
import { selectMessageReplyAnswer } from "../../../messageReplyForms";
import { QuestionAnswerCard } from "./QuestionAnswer";
import { UserMessage } from "./UserMessage";

/** Keep the answer at its original place in the timeline and preserve its checkpoint. */
export function MessageReplyAnswer({
  threadId,
  item,
  checkpointRevert,
}: {
  threadId: string;
  item: RuntimeChatItem;
  checkpointRevert: CheckpointRevertRequest | null;
}) {
  const answer = useAppStore((state) => selectMessageReplyAnswer(state, threadId, item.id));
  return answer ? (
    <QuestionAnswerCard questions={answer.questions} checkpointRevert={checkpointRevert} />
  ) : (
    <UserMessage threadId={threadId} item={item} checkpointRevert={checkpointRevert} />
  );
}
