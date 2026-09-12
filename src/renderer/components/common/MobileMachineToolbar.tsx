import type { ReactNode } from "react";
import { RemoteServerPicker } from "./RemoteServerPicker";

export function MobileMachineToolbar(props: {
  readonly desktopId: string;
  readonly onDesktopChange: (desktopId: string | null) => void;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
}) {
  return (
    <div className="m-utility-floating-actions m-utility-floating-actions--with-selector">
      <div className="flex justify-start">{props.leading}</div>
      <RemoteServerPicker
        value={props.desktopId}
        onChange={props.onDesktopChange}
        buttonClassName="m-floating-selector w-full px-4 text-sm"
        opensUpward
      />
      <div className="flex justify-end">{props.trailing}</div>
    </div>
  );
}
