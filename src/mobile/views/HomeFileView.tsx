import { useLingui } from "@lingui/react/macro";
import { resolveAbsolutePath } from "@/renderer/utils/resolveAbsolutePath";
import type { FilesViewProps } from "./FilesView";
import { MobileFileEditor } from "./MobileFileEditor";
import { useOpenFile } from "./useOpenFile";

/** Home has individual file reads, but never mounts a project file browser. */
export function HomeFileView(props: FilesViewProps) {
  const { t } = useLingui();
  const location = props.target.projectLocation;
  const path = props.initialFilePath;
  const absolutePath = path
    ? path.startsWith("/") || path.startsWith("\\\\") || /^[A-Za-z]:[\\/]/.test(path)
      ? path
      : resolveAbsolutePath(location, path)
    : undefined;
  const fileApi = useOpenFile({
    projectLocation: location,
    rootKey: JSON.stringify(location),
    ...(absolutePath ? { initialFilePath: absolutePath } : {}),
    ...(props.initialLineNumber !== undefined
      ? { initialLineNumber: props.initialLineNumber }
      : {}),
    ...(props.initialOpenKey !== undefined ? { initialOpenKey: props.initialOpenKey } : {}),
    ...(props.onImmersiveChange ? { onImmersiveChange: props.onImmersiveChange } : {}),
  });
  return (
    <div className="m-ws-pane">
      <div className="m-files-body">
        <MobileFileEditor
          fileApi={fileApi}
          backLabel={t`Back`}
          onClose={() => props.onClose?.()}
          {...(absolutePath ? { initialFilePath: absolutePath } : {})}
          {...(props.initialLineNumber !== undefined
            ? { initialLineNumber: props.initialLineNumber }
            : {})}
        />
      </div>
    </div>
  );
}
