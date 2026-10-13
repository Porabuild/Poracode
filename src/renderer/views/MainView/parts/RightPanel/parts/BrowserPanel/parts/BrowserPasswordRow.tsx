import { Button, Dropdown, Label, Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Copy, Eye, EyeOff, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { BrowserCredentialInfo } from "@/shared/ipc";

export function BrowserPasswordRow(props: {
  credential: BrowserCredentialInfo;
  revealedPassword?: string;
  isBusy: boolean;
  onReveal: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useLingui();
  const { credential, revealedPassword, isBusy } = props;
  const revealLabel = revealedPassword === undefined ? t`Reveal password` : t`Hide password`;

  return (
    <article className="py-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={credential.origin}>
            {credential.origin}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted" title={credential.username}>
            {credential.username}
          </p>
          {credential.source ? (
            <p className="mt-1 truncate text-[10px] text-muted/70">
              <Trans>Imported from {credential.source}</Trans>
            </p>
          ) : null}
        </div>
        <Dropdown>
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            className="size-7 min-w-7 shrink-0 rounded-full text-muted"
            isDisabled={isBusy}
            aria-label={t`Saved password actions`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
          <Dropdown.Popover placement="bottom end" className="z-[1000] min-w-44">
            <Dropdown.Menu
              aria-label={t`Saved password actions`}
              onAction={(key) => {
                if (key === "edit") props.onEdit();
                else if (key === "delete") props.onDelete();
              }}
            >
              <Dropdown.Item id="edit" textValue={t`Edit saved password`}>
                <Pencil className="size-3.5 text-muted" />
                <Label>
                  <Trans>Edit saved password</Trans>
                </Label>
              </Dropdown.Item>
              <Dropdown.Item id="delete" textValue={t`Delete saved password`} variant="danger">
                <Trash2 className="size-3.5" />
                <Label>
                  <Trans>Delete saved password</Trans>
                </Label>
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <span
          className={`min-w-0 flex-1 break-all font-mono text-xs ${revealedPassword === undefined ? "text-muted" : "text-foreground"}`}
        >
          {revealedPassword ?? "••••••••"}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              className="size-7 min-w-7 rounded-full text-muted"
              isDisabled={isBusy}
              aria-label={revealLabel}
              onPress={props.onReveal}
            >
              {revealedPassword === undefined ? (
                <Eye className="size-3.5" />
              ) : (
                <EyeOff className="size-3.5" />
              )}
            </Button>
            <Tooltip.Content placement="top" className="pointer-events-none z-[1000]">
              {revealLabel}
            </Tooltip.Content>
          </Tooltip>
          <Tooltip>
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              className="size-7 min-w-7 rounded-full text-muted"
              isDisabled={isBusy}
              aria-label={t`Copy password`}
              onPress={props.onCopy}
            >
              <Copy className="size-3.5" />
            </Button>
            <Tooltip.Content placement="top" className="pointer-events-none z-[1000]">
              <Trans>Copy password</Trans>
            </Tooltip.Content>
          </Tooltip>
        </div>
      </div>
    </article>
  );
}
