import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useGitFindStore } from "@/renderer/state/gitFindStore";
import { GitFindBar } from "./GitFindBar";
import type { GitDiffSearchEntry } from "./gitDiffSearch";

vi.mock("./FindBar", () => ({
  FindBar: (props: { ref: React.Ref<HTMLInputElement> }) => <input ref={props.ref} />,
}));
const entry: GitDiffSearchEntry = {
  filePath: "file.ts",
  staged: false,
  rawDiff: "@@ -1 +1 @@\n-before\n+needle\n",
  oldName: "file.ts",
  tooLarge: false,
  deletions: 1,
};
let container: HTMLDivElement;
let matchTop = 100;
beforeEach(() => {
  container = document.createElement("div");
  container.innerHTML =
    '<div data-diff-key="u:file.ts"><span data-diff-file-name>file.ts</span><table><tbody><tr><td><span data-line-new-num="1">1</span></td><td class="diff-line-content"><span class="diff-line-content-raw">needle</span></td></tr></tbody></table></div>';
  document.body.append(container);
  Object.assign(container.firstElementChild!, { scrollIntoView: vi.fn<() => void>() });
  matchTop = 100;
  vi.spyOn(container, "getBoundingClientRect").mockImplementation(
    () => ({ top: 0, bottom: 400 }) as DOMRect,
  );
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ top: matchTop, bottom: matchTop + 18, height: 18, width: 40 }),
  });
  vi.stubGlobal("CSS", { escape: (text: string) => text });
  useGitFindStore.setState({
    isOpen: true,
    query: "needle",
    currentIndex: 0,
    matchCount: 0,
    caseSensitive: false,
  });
});
afterEach(() => {
  cleanup();
  container.remove();
  Reflect.deleteProperty(Range.prototype, "getBoundingClientRect");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useGitFindStore.getState().close();
});

describe("virtualized Git Find navigation", () => {
  it("discards offscreen expanded-context matches on refresh even when the patch is unchanged", async () => {
    container.querySelector("[data-line-new-num]")!.setAttribute("data-line-new-num", "20");
    container.querySelector(".diff-line-content-raw")!.textContent = "expanded context";
    useGitFindStore.setState({ query: "expanded" });
    const view = render(
      <GitFindBar
        containerRef={{ current: container }}
        entries={[entry]}
        diffMode={4}
        contentKey="project:0"
      />,
    );
    await waitFor(() => expect(useGitFindStore.getState().matchCount).toBe(1));
    act(() => {
      container.querySelector("table")!.remove();
    });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    expect(useGitFindStore.getState().matchCount).toBe(1);
    view.rerender(
      <GitFindBar
        containerRef={{ current: container }}
        entries={[{ ...entry }]}
        diffMode={4}
        contentKey="project:1"
      />,
    );
    await waitFor(() => expect(useGitFindStore.getState().matchCount).toBe(0));
  });

  it("keeps a result in view through deferred layout changes until the user scrolls", async () => {
    render(<GitFindBar containerRef={{ current: container }} entries={[entry]} diffMode={4} />);
    await waitFor(() => expect(useGitFindStore.getState().matchCount).toBe(1));
    expect(container.scrollTop).toBe(0);
    matchTop = 500;
    act(() => {
      container.append(document.createElement("span"));
    });
    await waitFor(() => expect(container.scrollTop).toBeGreaterThan(0));
    const corrected = container.scrollTop;
    fireEvent.wheel(container);
    matchTop = 900;
    act(() => {
      container.append(document.createElement("span"));
    });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    expect(container.scrollTop).toBe(corrected);
  });
});
