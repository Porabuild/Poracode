// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { DiffFile, DiffView, type DiffViewProps } from "@git-diff-view/react";
import { PATCH_A, thread } from "./changesFixtures";
import type { LineComments } from "./inlineComments";
import type { PlacedComments } from "./placeComments";

type ExtendData = PlacedComments["extendData"];

const EMPTY: ExtendData = { oldFile: {}, newFile: {} };
const atLine2 = (data: LineComments): ExtendData => ({
  oldFile: {},
  newFile: { "2": { data } },
});
const comments = (t: string): LineComments => ({
  threads: [thread({ id: t })],
  drafts: [],
});

function buildDiffFile() {
  const diffFile = DiffFile.createInstance({
    oldFile: { fileName: "src/a.ts", fileLang: "typescript", content: null },
    newFile: { fileName: "src/a.ts", fileLang: "typescript", content: null },
    hunks: [PATCH_A],
  });
  diffFile.initTheme("dark");
  diffFile.initRaw();
  diffFile.buildSplitDiffLines();
  return diffFile;
}

const diffFile = buildDiffFile();

// A stable function, as the compiled app produces one: without it the
// library's store notifies on every render and masks the extendData defect.
const renderExtendLine: NonNullable<DiffViewProps<LineComments>["renderExtendLine"]> = ({
  data,
}) => (
  <div data-testid="extend-comments">
    {[
      ...(data?.threads ?? []).map((t: { id: string }) => t.id),
      ...(data?.drafts ?? []).map((d: { id: string }) => d.id),
    ].join(",")}
  </div>
);

function View(props: { extendData: ExtendData }) {
  return (
    <DiffView<LineComments>
      diffFile={diffFile}
      diffViewMode={1}
      diffViewTheme="dark"
      diffViewFontSize={12}
      diffViewHighlight={false}
      diffViewWrap={false}
      extendData={props.extendData}
      renderExtendLine={renderExtendLine}
    />
  );
}

beforeAll(() => {
  // jsdom reports zero layout; the library only paints extend content when it
  // measured a table width above zero.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const width = (this.className?.toString() ?? "").includes("diff-table-wrapper") ? 400 : 0;
    return { width, height: 0, top: 0, right: width, bottom: 0, left: 0, x: 0, y: 0 } as DOMRect;
  });
  // Its text measurer wants a canvas 2d context jsdom does not provide.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    font: "",
    measureText: () => ({ width: 8 }),
  } as unknown as CanvasRenderingContext2D);
});

// Store notifications inside the library reach React outside act(); flushing
// microtasks lets the pending width/extend updates settle.
const settle = () => act(async () => {});

describe("DiffView extendData", () => {
  it("shows an extend row whose comments arrive after the view mounted", async () => {
    const { container, rerender } = render(<View extendData={EMPTY} />);
    await settle();
    expect(container.querySelectorAll('tr[data-state="extend"]')).toHaveLength(0);
    rerender(<View extendData={atLine2(comments("thread-late"))} />);
    await settle();
    expect(container.querySelector('tr[data-state="extend"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="extend-comments"]')?.textContent).toContain(
      "thread-late",
    );
  });

  it("refreshes a line's extend content when its comment set changes", async () => {
    const { container, rerender } = render(<View extendData={atLine2(comments("thread-first"))} />);
    await settle();
    expect(container.querySelector('[data-testid="extend-comments"]')?.textContent).toContain(
      "thread-first",
    );
    rerender(<View extendData={atLine2(comments("thread-second"))} />);
    await settle();
    expect(container.querySelector('[data-testid="extend-comments"]')?.textContent).toContain(
      "thread-second",
    );
  });
});
