import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodeBlock } from "./CodeBlock";

const mocks = vi.hoisted(() => ({
  ensureLanguage: vi.fn<(lang: string) => Promise<boolean>>(),
  getShikiHighlighter:
    vi.fn<() => Promise<{ codeToHtml: (text: string, options: unknown) => string }>>(),
  codeToHtml: vi.fn<(text: string, options: unknown) => string>(),
}));
vi.mock("@/renderer/components/ui/provider", () => ({
  useResolvedAppearance: () => "dark",
}));
vi.mock("./shikiClient", () => ({ ...mocks, transparentBgTransformer: {} }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureLanguage.mockResolvedValue(true);
  mocks.getShikiHighlighter.mockResolvedValue({ codeToHtml: mocks.codeToHtml });
  mocks.codeToHtml.mockImplementation((text: string) => `<pre>${text}</pre>`);
});
afterEach(cleanup);

describe("highlight request lifecycle", () => {
  it("shows the current text while a newly requested grammar loads", async () => {
    const view = render(<CodeBlock text="before-language-switch" lang="json" />);
    await act(async () => {});
    const language = deferred<boolean>();
    mocks.ensureLanguage.mockReturnValueOnce(language.promise);
    view.rerender(<CodeBlock text="after-language-switch" lang="python" />);
    expect(screen.queryByText("before-language-switch")).toBeNull();
    expect(screen.getByText("after-language-switch").tagName).toBe("PRE");
    await act(async () => language.resolve(true));
    expect(mocks.codeToHtml.mock.lastCall?.[0]).toBe("after-language-switch");
  });

  it.each(["language", "highlighter"])(
    "keeps plain code visible when %s loading fails",
    async (stage) => {
      if (stage === "language")
        mocks.ensureLanguage.mockRejectedValueOnce(new Error("WASM blocked"));
      else mocks.getShikiHighlighter.mockRejectedValueOnce(new Error("WASM blocked"));
      render(<CodeBlock text={`failed-${stage}`} lang="json" />);
      await act(async () => {});
      expect(screen.getByText(`failed-${stage}`).tagName).toBe("PRE");
      expect(mocks.codeToHtml).not.toHaveBeenCalled();
    },
  );

  it("does not load the highlighter for an unmounted language request", async () => {
    const language = deferred<boolean>();
    mocks.ensureLanguage.mockReturnValue(language.promise);
    const view = render(<CodeBlock text="unmounted-language" lang="json" />);
    view.unmount();
    await act(async () => language.resolve(true));
    expect(mocks.getShikiHighlighter).not.toHaveBeenCalled();
    expect(mocks.codeToHtml).not.toHaveBeenCalled();
  });

  it("does not tokenize obsolete text after a shared highlighter finishes loading", async () => {
    const highlighter = deferred<{ codeToHtml: typeof mocks.codeToHtml }>();
    mocks.getShikiHighlighter.mockReturnValue(highlighter.promise);
    const view = render(<CodeBlock text="obsolete-body" lang="json" />);
    await act(async () => {});
    view.rerender(<CodeBlock text="current-body" lang="json" />);
    await act(async () => highlighter.resolve({ codeToHtml: mocks.codeToHtml }));
    expect(mocks.codeToHtml).toHaveBeenCalledTimes(1);
    expect(mocks.codeToHtml.mock.calls[0]?.[0]).toBe("current-body");
    expect(mocks.codeToHtml.mock.calls[0]?.[1]).toMatchObject({ mergeSameStyleTokens: true });
    expect(screen.getByText("current-body")).toBeTruthy();
  });

  it("leaves oversized markup renderable while declining document-cache retention", async () => {
    const large = `<pre>${"x".repeat(4 * 1024 * 1024 + 1)}</pre>`;
    mocks.codeToHtml.mockReturnValue(large);
    const view = render(<CodeBlock text="oversized-highlight" lang="json" />);
    await act(async () => {});
    expect(view.container.querySelector("pre")?.textContent?.length).toBe(4 * 1024 * 1024 + 1);
    view.unmount();
    render(<CodeBlock text="oversized-highlight" lang="json" />);
    await act(async () => {});
    expect(mocks.codeToHtml).toHaveBeenCalledTimes(2);
  });
});
