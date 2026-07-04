import { useEffect } from "react";
import { toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Copy, RotateCcw } from "lucide-react";
import { friendlyError } from "@/shared/messages";
import {
  setUserMessageActionsListener,
  type UserMessageActionsRequest,
} from "@/renderer/components/thread/ChatPane/userMessageActions";
import { BottomSheet, useSheet } from "./components";

/**
 * Bottom-sheet context menu for a long-pressed user message — the PWA's
 * stand-in for the desktop's hover-revealed copy/revert strip (hover doesn't
 * exist on touch, and always-visible icons crowd a one-line bubble). Mounted
 * once in RootLayout; the shared `UserMessage` row requests it through
 * `openUserMessageActions` when running in a remote session.
 */
export function UserMessageActionsSheet() {
  const { t } = useLingui();
  const sheet = useSheet<UserMessageActionsRequest>();
  const { open } = sheet;
  useEffect(() => {
    setUserMessageActionsListener(open);
    return () => setUserMessageActionsListener(null);
  }, [open]);

  const request = sheet.target;
  if (request === null) return null;
  const requestRevert = request.requestRevert;
  const preview = (request.text.split("\n", 1)[0] ?? "").trim();

  return (
    <BottomSheet
      label={t`Message actions`}
      closeLabel={t`Close menu`}
      closing={sheet.closing}
      onClose={sheet.close}
    >
      <div className="m-sheet-head">
        <span className="min-w-0 truncate">
          {preview.length > 0 ? preview : t`Message actions`}
        </span>
      </div>
      <div className="m-sheet-list">
        <button
          type="button"
          className="m-sheet-action"
          onClick={() => {
            navigator.clipboard
              .writeText(request.text)
              .then(() => toast.success(t`Copied`))
              .catch((error: unknown) => toast.danger(friendlyError(error)));
            sheet.close();
          }}
        >
          <Copy className="size-4" />
          <Trans>Copy message</Trans>
        </button>
        {requestRevert ? (
          <button
            type="button"
            className="m-sheet-action"
            onClick={() => {
              requestRevert();
              sheet.close();
            }}
          >
            <RotateCcw className="size-4" />
            <Trans>Revert to this checkpoint</Trans>
          </button>
        ) : null}
      </div>
    </BottomSheet>
  );
}
