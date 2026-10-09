import { Trans } from "@lingui/react/macro";
import { getBasename } from "@/shared/pathUtils";
import { ImageFileView } from "./ImageFileView";

/** The rendered view of an SVG's current editor content, unsaved edits included. */
export function SvgFileView(props: { path: string; content: string }) {
  return (
    <ImageFileView
      src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(props.content)}`}
      fileName={getBasename(props.path)}
      sizeBytes={new TextEncoder().encode(props.content).length}
      fallback={
        <div className="flex h-full items-center justify-center px-8 text-center text-sm text-muted">
          <Trans>This SVG can't be displayed.</Trans>
        </div>
      }
    />
  );
}
