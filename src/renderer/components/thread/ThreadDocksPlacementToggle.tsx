import { ArrowRightLeft } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { ThreadDocksPlacement } from "@/shared/settings";
import { setThreadDocksPlacement } from "@/renderer/actions/panelActions";
import { ThreadDockIconButton } from "./ThreadDockUI";

/**
 * The one control that flips WHERE every informational dock renders (goal,
 * plan, agents, background tasks): above the composer or in the right panel's
 * Docks tab. It is a global mode, so the topmost composer dock owns the action;
 * the Docks tab header owns the reverse action while the docks live there.
 */
export function ThreadDocksPlacementToggle({ placement }: { placement: ThreadDocksPlacement }) {
  const { t } = useLingui();
  const toComposer = placement === "right";
  return (
    <ThreadDockIconButton
      label={toComposer ? t`Show docks above the composer` : t`Show docks in the right panel`}
      onPress={() => setThreadDocksPlacement(toComposer ? "composer" : "right")}
    >
      <ArrowRightLeft className="size-3.5" />
    </ThreadDockIconButton>
  );
}
