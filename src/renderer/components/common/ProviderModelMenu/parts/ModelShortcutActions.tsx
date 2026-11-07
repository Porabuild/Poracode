import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Star, X } from "lucide-react";

export function ModelShortcutActions({
  isFavorite,
  toggleFavorite,
  removeRecent,
}: {
  isFavorite: boolean;
  toggleFavorite?: () => void;
  removeRecent?: () => void;
}) {
  const { t } = useLingui();
  return (
    <>
      {!toggleFavorite ? null : (
        <button
          type="button"
          aria-label={isFavorite ? t`Remove from favorites` : t`Add to favorites`}
          className={`ml-1 flex size-5 shrink-0 items-center justify-center rounded transition ${
            isFavorite
              ? "text-foreground"
              : "text-muted/40 opacity-0 group-hover:opacity-100 hover:text-foreground"
          }`}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") event.stopPropagation();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            toggleFavorite();
          }}
        >
          <Star className="size-3.5" fill={isFavorite ? "currentColor" : "none"} />
        </button>
      )}
      {removeRecent ? (
        <Button
          isIconOnly
          variant="ghost"
          aria-label={t`Remove from recent`}
          className="size-4 min-h-0 min-w-0 shrink-0 rounded p-0 text-muted/60 opacity-100 transition-opacity hover:text-foreground [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100"
          onPress={removeRecent}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Tab" || event.key === "Escape") event.continuePropagation();
          }}
        >
          <X className="size-3" />
        </Button>
      ) : null}
    </>
  );
}
