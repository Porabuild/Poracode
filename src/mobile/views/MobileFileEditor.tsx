import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { ChevronLeft, Code, Eye, Loader2, Save } from "lucide-react";
import { ImageFileView } from "@/renderer/components/media/ImageFileView";
import { SvgFileView } from "@/renderer/components/media/SvgFileView";
import { resolveFileDisplayUrl } from "@/renderer/utils/fileDisplayUrl";
import type { AbsoluteFileReadStatus } from "@/shared/contracts";
import { getBasename } from "@/shared/pathUtils";
import { isImagePath, isSvgPath } from "@/shared/promptContent";
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
  // The SVG rendered view is per file; opening another file shows its source.
  const [renderedPath, setRenderedPath] = useState<string | null>(null);
  const canRender = openFile?.status === "ready" && !openFile.isLoading && isSvgPath(openFile.path);
  const showRendered = canRender && renderedPath === openFile.path;
  const isImageViewer =
    !!openFile &&
    !openFile.isLoading &&
    (openFile.status === "binary" || openFile.status === "too_large") &&
    isImagePath(openFile.path);
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
        {canRender ? (
          <button
            className="m-topbar-icon"
            type="button"
            aria-label={showRendered ? t`Show source` : t`Show preview`}
            onClick={() => setRenderedPath(showRendered ? null : openFile.path)}
          >
            {showRendered ? <Code className="size-5" /> : <Eye className="size-5" />}
          </button>
        ) : null}
      </header>
      {openFile?.isLoading ? (
        <div className="m-files-status">
          <Loader2 className="size-5 m-spin" />
          <Trans>Loading…</Trans>
        </div>
      ) : openFile && showRendered ? (
        <SvgFileView path={openFile.path} content={openFile.content} />
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
      ) : openFile && isImageViewer ? (
        <ImageFileView
          src={resolveFileDisplayUrl({
            projectLocation: props.fileApi.projectLocation,
            path: openFile.path,
            version: openFile.modifiedAtMs,
          })}
          fileName={getBasename(openFile.path)}
          sizeBytes={openFile.sizeBytes}
          fallback={<div className="m-files-status">{fileStatusMessage(openFile.status)}</div>}
        />
      ) : openFile ? (
        <div className="m-files-status">{fileStatusMessage(openFile.status)}</div>
      ) : (
        <div className="m-files-status">
          <Trans>No file selected.</Trans>
        </div>
      )}
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
