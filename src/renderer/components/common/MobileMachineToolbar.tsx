import type { ReactNode } from "react";
import { RemoteServerPicker } from "./RemoteServerPicker";

type MachineSelection =
  | {
      readonly desktopId: string;
      readonly onDesktopChange: (desktopId: string | null) => void;
    }
  | {
      /** Without a machine, only the leading and trailing actions render. */
      readonly desktopId?: undefined;
      readonly onDesktopChange?: undefined;
    };

export function MobileMachineToolbar(
  props: {
    readonly leading?: ReactNode;
    readonly trailing?: ReactNode;
  } & MachineSelection,
) {
  const { desktopId, onDesktopChange } = props;
  return (
    <div
      className={`m-utility-floating-actions${
        desktopId ? " m-utility-floating-actions--with-selector" : ""
      }`}
    >
      <div className="flex justify-start">{props.leading}</div>
      {desktopId ? (
        <RemoteServerPicker
          value={desktopId}
          onChange={onDesktopChange}
          buttonClassName="m-floating-selector w-full px-4 text-sm"
          opensUpward
        />
      ) : null}
      <div className="flex justify-end">{props.trailing}</div>
    </div>
  );
}
