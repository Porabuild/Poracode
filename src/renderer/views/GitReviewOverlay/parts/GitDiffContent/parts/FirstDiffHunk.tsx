import { useLingui } from "@lingui/react/macro";

export function firstDiffHunk(diff: string): string | null {
  const start = diff.startsWith("@@") ? 0 : diff.indexOf("\n@@") + 1;
  if (!diff.startsWith("@@", start)) return null;
  return diff
    .slice(start, start + 2_400)
    .split(/\r?\n/, 12)
    .join("\n");
}

export function FirstDiffHunk({ text }: { text: string }) {
  const { t } = useLingui();
  return (
    <pre
      aria-label={t`Preview`}
      className="max-h-52 overflow-auto whitespace-pre-wrap break-words bg-[var(--content-background)] px-4 py-2 font-mono text-xs text-foreground"
    >
      {text}
    </pre>
  );
}
