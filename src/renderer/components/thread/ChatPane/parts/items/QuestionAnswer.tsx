import type { ReactNode } from "react";
import { Surface } from "@heroui/react";
import { Check } from "lucide-react";
import type { QuestionAnswerItemPayload } from "@/shared/contracts";
import {
  getRuntimeItemPayload,
  type RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";
import { chatPromptSurfaceClass } from "./chatMessageSurface";
import { ItemMarkdown } from "./ItemMarkdown";

interface QuestionAnswerProps {
  item: RuntimeChatItem;
  checkpointRevertControl: ReactNode | null;
}

export function QuestionAnswer({ item, checkpointRevertControl }: QuestionAnswerProps) {
  const payload = getRuntimeItemPayload<QuestionAnswerItemPayload>(item, "question_answer");
  const questions = payload?.questions ?? [];
  if (questions.length === 0) return null;
  return (
    <Surface variant="tertiary" className={chatPromptSurfaceClass}>
      <div className="min-w-0 space-y-2 leading-snug">
        {questions.map((entry, index) => (
          <div
            key={`${entry.header}-${index}`}
            className={`min-w-0 space-y-1 ${index > 0 ? "border-t border-[color:var(--border)] pt-2" : ""}`}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              {entry.header}
            </div>
            {entry.question.length > 0 ? (
              <div className="text-[11px] text-[color:var(--muted)]">{entry.question}</div>
            ) : null}
            <div className="space-y-1.5 pt-0.5">
              {entry.selected.map((selection, i) => (
                <div key={`sel-${i}`} className="flex items-start gap-1.5">
                  <Check className="mt-[3px] size-3 shrink-0 text-foreground/70" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-foreground">{selection.label}</div>
                    {selection.description ? (
                      <div className="text-[11px] text-[color:var(--muted)]">
                        {selection.description}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
              {entry.customAnswer ? (
                <div className="rounded border-l-2 border-foreground/30 pl-2">
                  <ItemMarkdown text={entry.customAnswer} />
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {checkpointRevertControl ? (
        <div className="lightcode-message-action-strip absolute right-2 top-1/2 z-10 -translate-y-1/2 opacity-0 transition-opacity group-hover/checkpoint:opacity-100 focus-within:opacity-100">
          {checkpointRevertControl}
        </div>
      ) : null}
    </Surface>
  );
}
