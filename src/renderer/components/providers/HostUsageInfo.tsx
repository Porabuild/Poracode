import { useState } from "react";
import { Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Info } from "lucide-react";
import { Button } from "@/renderer/components/common/Button";

/** Owning-host guidance stays available without taking space above every card. */
export function HostUsageInfo(props: { className?: string }) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  return (
    <Tooltip delay={300} isOpen={open} onOpenChange={setOpen}>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        aria-label={t`About usage`}
        aria-expanded={open}
        className={props.className ?? "size-7 min-h-7 min-w-7 text-muted"}
        onPress={() => setOpen(!open)}
      >
        <Info className="size-3.5" aria-hidden />
      </Button>
      <Tooltip.Content placement="bottom" className="max-w-64 text-xs">
        <Trans>
          Sign in and configure usage tracking on this host. Credentials stay on the host that
          collects usage.
        </Trans>
      </Tooltip.Content>
    </Tooltip>
  );
}
