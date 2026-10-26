// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDetails, renderInPrDetail } from "../testing/prDetailTestScope";
import { ChangesTab } from "./ChangesTab";
import { clearReview, resetBridge, seedReview } from "./changesFixtures";

vi.mock("@/renderer/bridge", async () => {
  const { bridge: fake } = await import("./changesFixtures");
  return { readBridge: () => fake, isRemoteSession: () => false, isMac: () => false };
});
vi.mock("@git-diff-view/react", async (importOriginal) => {
  const { FakeDiffView } = await import("./changesFixtures");
  return {
    ...(await importOriginal<typeof import("@git-diff-view/react")>()),
    DiffView: FakeDiffView,
  };
});
vi.mock("../../GitReviewOverlay/parts/diffBuildClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../GitReviewOverlay/parts/diffBuildClient")>()),
  useDiffTheme: () => "light" as const,
}));

let reportedWidth = 1400;
const liveObservers = new Set<ResizeObserverCallback>();
class TestResizeObserver {
  constructor(private cb: ResizeObserverCallback) {
    liveObservers.add(cb);
  }
  observe() {
    this.cb([{ contentRect: { width: reportedWidth } } as ResizeObserverEntry], this);
  }
  unobserve() {}
  disconnect() {
    liveObservers.delete(this.cb);
  }
}

function setWidth(width: number) {
  reportedWidth = width;
  act(() => {
    for (const cb of liveObservers) {
      cb([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver);
    }
  });
}

const realResizeObserver = globalThis.ResizeObserver;

function splitPressed() {
  return screen.getByRole("button", { name: "Split view" }).getAttribute("aria-pressed") === "true";
}
function treeVisible() {
  return screen.queryByRole("button", { name: "Hide file tree" }) !== null;
}

describe("ChangesTab responsive desktop layout", () => {
  beforeEach(() => {
    globalThis.ResizeObserver = TestResizeObserver;
    reportedWidth = 1400;
    resetBridge();
    Element.prototype.scrollIntoView = vi.fn<() => void>();
    clearReview();
    seedReview();
  });
  afterEach(() => {
    globalThis.ResizeObserver = realResizeObserver;
    clearReview();
  });

  it("hides the file tree and uses unified diffs on a narrow surface", () => {
    setWidth(600);
    renderInPrDetail(<ChangesTab />, {}, { details: makeTestDetails() });

    expect(treeVisible()).toBe(false);
    expect(screen.getByRole("button", { name: "Unified view" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("shows the file tree and split diffs on a wide surface", () => {
    setWidth(1400);
    renderInPrDetail(<ChangesTab />, {}, { details: makeTestDetails() });

    expect(treeVisible()).toBe(true);
    expect(splitPressed()).toBe(true);
  });

  it("keeps a manually chosen diff mode when the width changes", () => {
    setWidth(600);
    renderInPrDetail(<ChangesTab />, {}, { details: makeTestDetails() });
    fireEvent.click(screen.getByRole("button", { name: "Split view" }));

    setWidth(1400);
    setWidth(500);
    expect(splitPressed()).toBe(true);
  });

  it("keeps a manually hidden file tree when the width changes", () => {
    setWidth(1400);
    renderInPrDetail(<ChangesTab />, {}, { details: makeTestDetails() });
    fireEvent.click(screen.getByRole("button", { name: "Hide file tree" }));

    setWidth(1400);
    setWidth(500);
    expect(treeVisible()).toBe(false);
  });

  it("keeps the toolbar on a single row", () => {
    setWidth(1400);
    renderInPrDetail(<ChangesTab />, {}, { details: makeTestDetails() });

    expect(screen.getByRole("toolbar").className).not.toContain("flex-wrap");
  });
});
