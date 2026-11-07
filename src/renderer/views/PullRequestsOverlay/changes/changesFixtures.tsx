import { useEffect, useState } from "react";
import { vi } from "vitest";
import type { DiffViewProps, SplitSide } from "@git-diff-view/react";
import type {
  ForgePrCommitDiffResult,
  ForgePrViewedFilesResult,
  PrCommitSummary,
  PrFile,
  PrReviewThread,
} from "@/shared/contracts";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePrDetailNav, type PrDetailNav } from "../detail/prDetailNav";
import { TEST_CACHE_KEY } from "../testing/prDetailTestScope";
import type { LineComments } from "./inlineComments";
import { patchRows } from "./unifiedPatch";

/** Test doubles for the diff screens: a bridge with every call the Changes tab makes. */
export const bridge = {
  forgeGetPrCommitDiff: vi.fn<(input: unknown) => Promise<ForgePrCommitDiffResult>>(),
  forgeSubmitPrReviewDraft: vi.fn<(input: unknown) => Promise<void>>(),
  forgeSubmitPrReview: vi.fn<(input: unknown) => Promise<void>>(),
  ghSubmitPrReview: vi.fn<(input: unknown) => Promise<void>>(),
  forgeGetPrViewedFiles: vi.fn<(input: unknown) => Promise<ForgePrViewedFilesResult>>(),
  forgeSetPrFileViewed: vi.fn<(input: unknown) => Promise<ForgePrViewedFilesResult>>(),
};

export function resetBridge() {
  for (const fn of Object.values(bridge)) fn.mockReset();
  bridge.forgeSubmitPrReviewDraft.mockResolvedValue(undefined);
  bridge.forgeSubmitPrReview.mockResolvedValue(undefined);
  bridge.forgeGetPrViewedFiles.mockResolvedValue({ storage: "host", files: [] });
  bridge.forgeSetPrFileViewed.mockResolvedValue({ storage: "host", files: [] });
}

export const FILES: PrFile[] = [
  { path: "README.md", additions: 1, deletions: 0 },
  { path: "src/a.ts", additions: 1, deletions: 1 },
  { path: "src/lib/b.ts", additions: 2, deletions: 0 },
];

export const PATCH_A = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 111..222 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,4 +1,4 @@",
  " const a = 1;",
  "-const b = 2;",
  "+const b = 3;",
  " const c = 4;",
  " const d = 5;",
].join("\n");

export const PATCH_B = [
  "diff --git a/src/lib/b.ts b/src/lib/b.ts",
  "index 333..444 100644",
  "--- a/src/lib/b.ts",
  "+++ b/src/lib/b.ts",
  "@@ -10,2 +10,4 @@",
  " export function b() {",
  "+  return 1;",
  "+  // done",
  " }",
].join("\n");

export const PATCH_README = [
  "diff --git a/README.md b/README.md",
  "index 555..666 100644",
  "--- a/README.md",
  "+++ b/README.md",
  "@@ -1 +1,2 @@",
  " # Title",
  "+More text",
].join("\n");

export const DIFF = [PATCH_README, PATCH_A, PATCH_B].join("\n") + "\n";

export const COMMITS: PrCommitSummary[] = [
  {
    oid: "1111111111111111111111111111111111111111",
    abbreviatedOid: "1111111",
    messageHeadline: "First commit",
    authoredDate: "2026-07-01T10:00:00Z",
  },
  {
    oid: "2222222222222222222222222222222222222222",
    abbreviatedOid: "2222222",
    messageHeadline: "Second commit",
    authoredDate: "2026-07-02T10:00:00Z",
  },
];

export const COMMIT_DIFF = [
  "diff --git a/src/only-in-commit.ts b/src/only-in-commit.ts",
  "new file mode 100644",
  "index 000..777",
  "--- /dev/null",
  "+++ b/src/only-in-commit.ts",
  "@@ -0,0 +1,2 @@",
  "+one",
  "+two",
].join("\n");

export function thread(overrides: Partial<PrReviewThread> = {}): PrReviewThread {
  return {
    id: "thread-1",
    isResolved: false,
    isOutdated: false,
    path: "src/a.ts",
    line: 2,
    comments: [
      {
        id: "comment-1",
        author: { login: "reviewer" },
        body: "Why not keep 2?",
        createdAt: "2026-07-01T10:00:00Z",
      },
    ],
    ...overrides,
  };
}

/** Puts files and the raw diff where the Changes tab reads them. */
export function seedReview(files: PrFile[] = FILES, diff = DIFF) {
  useGitStore.setState({
    prFiles: { [TEST_CACHE_KEY]: files },
    prDiffs: { [TEST_CACHE_KEY]: diff },
  });
}

export function clearReview() {
  useGitStore.setState({ prFiles: {}, prDiffs: {}, prDetails: {}, prData: {} });
}

/** The library's `SplitSide` values; the real enum cannot be imported while the library is mocked. */
const OLD_SIDE: SplitSide = 1;
const NEW_SIDE: SplitSide = 2;

/**
 * Stands in for the diff library, which needs real layout to draw anything: it
 * lists the patch lines with the library's number attributes, a "+" per line
 * when `diffViewAddWidget` is on, and drives `renderWidgetLine` /
 * `renderExtendLine` the way the library does.
 */
export function FakeDiffView(props: DiffViewProps<LineComments>) {
  const [widget, setWidget] = useState<{ line: number; side: SplitSide } | null>(null);
  const { diffFile } = props;
  if (!diffFile) return null;
  const rows = patchRows(diffFile._diffList.join("\n"));
  return (
    <div
      data-testid="diff-view"
      data-mode={props.diffViewMode}
      data-wrap={String(props.diffViewWrap)}
    >
      {rows.map((row, index) => {
        const side = row.kind === "-" ? OLD_SIDE : NEW_SIDE;
        const line = row.kind === "-" ? row.oldLine : row.newLine;
        const extend =
          line === null
            ? undefined
            : (side === OLD_SIDE ? props.extendData?.oldFile : props.extendData?.newFile)?.[
                String(line)
              ];
        return (
          <div key={index} data-row={`${row.kind}${row.text}`}>
            {row.oldLine === null ? null : (
              <span className="diff-line-old-num">
                <span data-line-num={row.oldLine} data-line-old-num={row.oldLine}>
                  {row.oldLine}
                </span>
              </span>
            )}
            {row.newLine === null ? null : (
              <span className="diff-line-new-num">
                <span data-line-num={row.newLine} data-line-new-num={row.newLine}>
                  {row.newLine}
                </span>
              </span>
            )}
            <code>{row.text}</code>
            {props.diffViewAddWidget && line !== null ? (
              <button
                type="button"
                aria-label={`Comment on ${side === OLD_SIDE ? "old" : "new"} line ${line}`}
                onClick={() => {
                  setWidget({ line, side });
                  props.onAddWidgetClick?.(line, side);
                }}
              >
                +
              </button>
            ) : null}
            {extend && line !== null
              ? props.renderExtendLine?.({
                  data: extend.data,
                  side,
                  lineNumber: line,
                  diffFile,
                  onUpdate: () => undefined,
                })
              : null}
            {widget && widget.line === line && widget.side === side
              ? props.renderWidgetLine?.({
                  lineNumber: widget.line,
                  side: widget.side,
                  diffFile,
                  onClose: () => setWidget(null),
                })
              : null}
          </div>
        );
      })}
    </div>
  );
}

/** Where `NavCapture` leaves the navigation, so a test can drive it as another tab would. */
export const navHandle: { current: PrDetailNav | undefined } = { current: undefined };

export function NavCapture() {
  const nav = usePrDetailNav();
  useEffect(() => {
    navHandle.current = nav;
  });
  return null;
}
