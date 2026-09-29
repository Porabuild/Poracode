import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { plainTextWindow } from "./longPlainText";

export function WindowedPlainText({ text }: { text: string }) {
  const { t } = useLingui();
  const [fixedEnd, setFixedEnd] = useState<number | null>(null);
  const { start, text: visibleText } = plainTextWindow(text, fixedEnd ?? text.length);

  return (
    <div>
      <div className="whitespace-pre-wrap break-words text-[length:var(--lc-chat-font-size)] leading-snug text-foreground">
        {visibleText}
      </div>
      {start > 0 || fixedEnd !== null ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {start > 0 ? (
            <Button size="sm" variant="ghost" onPress={() => setFixedEnd(start)}>
              {t`Earlier text`}
            </Button>
          ) : null}
          {fixedEnd !== null ? (
            <Button size="sm" variant="ghost" onPress={() => setFixedEnd(null)}>
              {t`Back to latest`}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
