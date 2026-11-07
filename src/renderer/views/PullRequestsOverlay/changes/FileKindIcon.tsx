import { File as FileBinary, FileMinus, FilePen, FilePlus, FileSymlink } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { PatchKind } from "./unifiedPatch";

/** Status of a changed file: added, deleted, renamed, binary or modified. */
export function FileKindIcon(props: { kind: PatchKind }) {
  const { t } = useLingui();
  const className = "size-3.5 shrink-0";
  switch (props.kind) {
    case "added":
      return <FilePlus aria-label={t`Added`} role="img" className={`${className} text-success`} />;
    case "deleted":
      return (
        <FileMinus aria-label={t`Deleted`} role="img" className={`${className} text-danger`} />
      );
    case "renamed":
      return (
        <FileSymlink aria-label={t`Renamed`} role="img" className={`${className} text-accent`} />
      );
    case "binary":
      return <FileBinary aria-label={t`Binary`} role="img" className={`${className} text-muted`} />;
    default:
      return (
        <FilePen aria-label={t`Modified`} role="img" className={`${className} text-warning`} />
      );
  }
}
