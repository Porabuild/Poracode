import { Trans, useLingui } from "@lingui/react/macro";
import { ChevronLeft, Loader2, Save } from "lucide-react";
import type { AbsoluteFileReadStatus } from "@/shared/contracts";
import { HighlightedEditor } from "../HighlightedEditor";
import { Fab } from "../components";
import type { OpenFileApi } from "./useOpenFile";

function fileStatusMessage(status: AbsoluteFileReadStatus) {
  if (status === "missing") return <Trans>File no longer exists on disk.</Trans>;
  if (status === "binary") return <Trans>Binary files can't be edited here.</Trans>;
  if (status === "too_large") return <Trans>This file is too large for the built-in editor.</Trans>;
  return <Trans>This file uses an unsupported encoding.</Trans>;
}

/** The individual-file surface, independent of project browsing and mutations. */
export function MobileFileEditor(props: {
  readonly fileApi: OpenFileApi;
  readonly backLabel: string;
  readonly onClose: () => void;
  readonly initialFilePath?: string | undefined;
  readonly initialLineNumber?: number | undefined;
}) {
  const { t } = useLingui();
  const { openFile, isDirty, saving, saveOpenFile, setOpenFileContent } = props.fileApi;
  return (
    <div className="m-files-editor">
      <header className="m-files-editor__head">
        <button
          className="m-back"
          type="button"
          aria-label={props.backLabel}
          onClick={props.onClose}
        >
          <ChevronLeft className="size-5" />
        </button>
        <span className="m-files-editor__path" title={openFile?.path ?? props.initialFilePath}>
          {openFile?.path ?? props.initialFilePath}
          {isDirty ? " *" : ""}
        </span>
      </header>
      {openFile?.isLoading ? (
        <div className="m-files-status">
          <Loader2 className="size-5 m-spin" />
          <Trans>Loading…</Trans>
        </div>
      ) : openFile?.status === "ready" ? (
        <HighlightedEditor
          value={openFile.content}
          path={openFile.path}
          {...(openFile.path === props.initialFilePath && props.initialLineNumber
            ? { initialLineNumber: props.initialLineNumber }
            : {})}
          {...(openFile.readOnly ? { readOnly: true } : {})}
          onChange={(next) => setOpenFileContent(openFile.path, next)}
        />
      ) : openFile ? (
        <div className="m-files-status">{fileStatusMessage(openFile.status)}</div>
      ) : null}
      {openFile && !openFile.readOnly && openFile.status === "ready" && !openFile.isLoading ? (
        <Fab
          label={t`Save`}
          disabled={!isDirty || saving}
          onPress={() => void saveOpenFile()}
          icon={saving ? <Loader2 className="size-5 m-spin" /> : <Save className="size-5" />}
        />
      ) : null}
    </div>
  );
}
