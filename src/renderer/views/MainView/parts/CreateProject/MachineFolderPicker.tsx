import { useLingui } from "@lingui/react/macro";
import { RemoteHostFolderPicker } from "@/renderer/views/SettingsOverlay/parts/RemoteHostFolderPicker";
import { useMachineName } from "./projectMachines";

/** A paired machine's own folder browser, titled with that machine's name. */
export function MachineFolderPicker(props: {
  readonly connectionKey: string;
  readonly initialPath?: string;
  readonly onClose: () => void;
  readonly onSelect: (absolutePath: string) => void;
}) {
  const { t } = useLingui();
  const machine = useMachineName(props.connectionKey) ?? props.connectionKey;
  return (
    <RemoteHostFolderPicker
      key={props.connectionKey}
      desktopId={props.connectionKey}
      title={t`Choose a folder on ${machine}`}
      {...(props.initialPath !== undefined ? { initialPath: props.initialPath } : {})}
      onClose={props.onClose}
      onSelect={props.onSelect}
    />
  );
}
