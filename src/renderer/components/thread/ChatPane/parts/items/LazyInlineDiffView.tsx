import { Suspense } from "react";
import type { InlineDiffViewProps } from "./InlineDiffView";
import { DeferredInlineDiffView } from "@/renderer/deferredFeatures";

export function LazyInlineDiffView(props: InlineDiffViewProps) {
  return (
    <Suspense
      fallback={
        <pre className="max-h-[min(24rem,50vh)] overflow-auto whitespace-pre-wrap break-words font-mono leading-snug text-foreground-muted [scrollbar-gutter:stable]">
          {props.diffText}
        </pre>
      }
    >
      <DeferredInlineDiffView {...props} />
    </Suspense>
  );
}
