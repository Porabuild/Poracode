import { useEffect, useRef } from "react";
import { Button, Tooltip, toast } from "@heroui/react";
import { RefreshCw } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { readBridge } from "@/renderer/bridge";
import { useUpdateStore } from "@/renderer/state/updateStore";

export function CheckForUpdatesButton() {
  const { t } = useLingui();
  const phase = useUpdateStore((s) => s.phase);
  // Set when this button initiated the check. Status events and the invoke
  // reply travel different paths, so the "up to date" feedback keys off store
  // phase transitions rather than the promise resolution.
  const manualCheckPendingRef = useRef(false);

  useEffect(() => {
    if (!manualCheckPendingRef.current || phase === "checking") return;
    manualCheckPendingRef.current = false;
    if (phase === "idle") {
      toast.success(t`You're on the latest version`);
    }
    // downloading/downloaded/error clear without toasting: downloads show in
    // the sidebar footer, errors already toast globally in app.tsx.
  }, [phase, t]);

  const checking = phase === "checking";
  const busy = checking || phase === "downloading";
  const label = checking
    ? t`Checking for updates…`
    : phase === "downloading"
      ? t`Downloading update`
      : t`Check for updates`;

  return (
    <Tooltip delay={150}>
      <Tooltip.Trigger>
        <Button
          isIconOnly
          aria-label={label}
          isDisabled={busy}
          size="sm"
          variant="ghost"
          className="size-6 min-w-0 text-muted hover:text-foreground"
          onPress={() => {
            manualCheckPendingRef.current = true;
            void readBridge()
              .checkForUpdate()
              .catch((error: unknown) => {
                console.error("[poracode][updates] check-for-update failed", error);
              });
          }}
        >
          <RefreshCw className={`size-3.5 ${checking ? "animate-spin" : ""}`} />
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content placement="bottom">{label}</Tooltip.Content>
    </Tooltip>
  );
}
