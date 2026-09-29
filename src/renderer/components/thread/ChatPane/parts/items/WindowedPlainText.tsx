import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";

interface WindowedPlainTextProps {
  text: string;
  hasEarlier: boolean;
  isBrowsingEarlier: boolean;
  onEarlier: () => void;
  onLatest: () => void;
}

export function WindowedPlainText({
  text,
  hasEarlier,
  isBrowsingEarlier,
  onEarlier,
  onLatest,
}: WindowedPlainTextProps) {
  const { t } = useLingui();

  return (
    <div>
      <div className="whitespace-pre-wrap break-words text-[length:var(--lc-chat-font-size)] leading-snug text-foreground">
        {text}
      </div>
      {hasEarlier || isBrowsingEarlier ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {hasEarlier ? (
            <Button size="sm" variant="ghost" onPress={onEarlier}>
              {t`Earlier text`}
            </Button>
          ) : null}
          {isBrowsingEarlier ? (
            <Button size="sm" variant="ghost" onPress={onLatest}>
              {t`Back to latest`}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
