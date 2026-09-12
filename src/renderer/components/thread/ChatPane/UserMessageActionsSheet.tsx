import { useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Copy, RotateCcw } from "lucide-react";
import { friendlyError } from "@/shared/messages";
import { BottomSheet } from "@/renderer/components/common/BottomSheet";
import {
  setUserMessageActionsListener,
  type UserMessageActionsRequest,
} from "./userMessageActions";

const SHEET_EXIT_MS = 200;

export function UserMessageActionsSheet() {
  const { t } = useLingui();
  const [request, setRequest] = useState<UserMessageActionsRequest | null>(null);
  const [closing, setClosing] = useState(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = useEffectEvent((next: UserMessageActionsRequest) => {
    if (exitTimer.current) clearTimeout(exitTimer.current);
    exitTimer.current = null;
    setClosing(false);
    setRequest(next);
  });
  useEffect(() => {
    setUserMessageActionsListener((next) => open(next));
    return () => {
      setUserMessageActionsListener(null);
      if (exitTimer.current) clearTimeout(exitTimer.current);
    };
  }, []);

  const close = () => {
    if (exitTimer.current) return;
    setClosing(true);
    exitTimer.current = setTimeout(() => {
      exitTimer.current = null;
      setClosing(false);
      setRequest(null);
    }, SHEET_EXIT_MS);
  };

  if (!request) return null;
  const preview = (request.text.split("\n", 1)[0] ?? "").trim();

  return (
    <BottomSheet
      label={t`Message actions`}
      closeLabel={t`Close menu`}
      closing={closing}
      onClose={close}
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
            close();
          }}
        >
          <Copy className="size-4" />
          <Trans>Copy message</Trans>
        </button>
        {request.requestRevert ? (
          <button
            type="button"
            className="m-sheet-action"
            onClick={() => {
              request.requestRevert?.();
              close();
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
