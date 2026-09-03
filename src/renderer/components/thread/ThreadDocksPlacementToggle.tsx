import { ArrowRightLeft } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { ThreadDocksPlacement } from "@/shared/settings";
import { setThreadDocksPlacement } from "@/renderer/actions/panelActions";
import { ThreadDockIconButton } from "./ThreadDockUI";

/**
 * The one control that flips WHERE every informational dock renders (goal,
 * plan, agents, background tasks): above the composer or in the right panel's
 * Docks tab. It is a global mode, so the topmost composer dock owns the action;
 * the right-panel header owns the reverse action while the docks live there.
 *
 * `buttonClassName` swaps the dock-style icon button for a plain header
 * button so the toggle matches the other right-panel header controls.
 */
export function ThreadDocksPlacementToggle({
  placement,
  buttonClassName,
}: {
  placement: ThreadDocksPlacement;
  buttonClassName?: string;
}) {
  const { t } = useLingui();
  const toComposer = placement === "right";
  const label = toComposer ? t`Show docks above the composer` : t`Show docks in the right panel`;
  const onPress = () => setThreadDocksPlacement(toComposer ? "composer" : "right");
  if (buttonClassName) {
    return (
      <button type="button" className={buttonClassName} title={label} onClick={onPress}>
        <ArrowRightLeft className="size-3.5" />
      </button>
    );
  }
  return (
    <ThreadDockIconButton label={label} onPress={onPress}>
      <ArrowRightLeft className="size-3.5" />
    </ThreadDockIconButton>
  );
}
