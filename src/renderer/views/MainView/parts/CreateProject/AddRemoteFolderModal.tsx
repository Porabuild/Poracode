import { addRemoteExistingProject } from "@/renderer/actions/createProjectActions";
import { usePanelStore } from "@/renderer/state/panelStore";
import { MachineFolderPicker } from "./MachineFolderPicker";

/**
 * "Add folder" on a paired machine: browse that machine with the shared host
 * folder picker, then register the chosen folder there. The add project menu
 * opens it through the panel store so it outlives the menu and the welcome
 * screen the menu may dismiss.
 */
export function AddRemoteFolderModal() {
  const connectionKey = usePanelStore((state) => state.remoteFolderPickerConnectionKey);
  if (!connectionKey) return null;
  return (
    <MachineFolderPicker
      connectionKey={connectionKey}
      onClose={() => usePanelStore.getState().closeRemoteFolderPicker()}
      onSelect={(path) => void addRemoteExistingProject(connectionKey, path)}
    />
  );
}
