import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodeBlock } from "./CodeBlock";
import type { LoadedHighlightResult, ShikiTheme } from "./shikiClient";

const mocks = vi.hoisted(() => ({
  ensureLanguage: vi.fn<(lang: string) => Promise<boolean>>(),
  highlightLoadedCode:
    vi.fn<(text: string, lang: string, theme: ShikiTheme) => LoadedHighlightResult | null>(),
}));
vi.mock("@/renderer/components/ui/provider", () => ({
  useResolvedAppearance: () => "dark",
}));
vi.mock("./shikiClient", () => mocks);

beforeEach(() => {
  vi.clearAllMocks();
  const loaded = new Set<string>();
  mocks.ensureLanguage.mockImplementation(async (lang) => {
    loaded.add(lang);
    return true;
  });
  mocks.highlightLoadedCode.mockImplementation((text, lang) =>
    loaded.has(lang) ? { html: `<pre>${text}</pre>` } : null,
  );
});
afterEach(cleanup);

describe("highlight request lifecycle", () => {
  it("highlights streaming updates synchronously without flashing plain pre once loaded", async () => {
    const loaded = new Set<string>();
    mocks.ensureLanguage.mockImplementation(async (lang) => {
      loaded.add(lang);
      return true;
    });
    mocks.highlightLoadedCode.mockImplementation((text, lang) =>
      loaded.has(lang)
        ? {
            html: `<pre class="shiki"><code><span style="color:#79B8FF">${text}</span></code></pre>`,
          }
        : null,
    );

    const view = render(<CodeBlock text="Starting from `main`" lang="markdown" />);
    expect(view.container.querySelector(".lc-shiki")).toBeNull();
    await act(async () => {});
    expect(view.container.querySelector(".lc-shiki")).not.toBeNull();
    expect(mocks.ensureLanguage).toHaveBeenCalledTimes(1);

    // Subsequent streaming chunks highlight in the same render pass — never
    // dropping back to the unhighlighted <pre> fallback between frames.
    view.rerender(<CodeBlock text="Starting from `main` (PR #25)" lang="markdown" />);
    expect(view.container.querySelector(".lc-shiki")).not.toBeNull();
    expect(view.container.querySelector("pre.shiki")?.textContent).toBe(
      "Starting from `main` (PR #25)",
    );
    expect(mocks.ensureLanguage).toHaveBeenCalledTimes(1);

    // Even a fresh mount for an already-loaded grammar highlights immediately.
    view.unmount();
    const fresh = render(<CodeBlock text="### Track 1" lang="markdown" />);
    expect(fresh.container.querySelector(".lc-shiki")).not.toBeNull();
    expect(fresh.container.querySelector("pre.shiki")?.textContent).toBe("### Track 1");
    expect(mocks.ensureLanguage).toHaveBeenCalledTimes(1);
  });

  it("replaces superseded streaming prefixes in the shared cache", async () => {
    const view = render(<CodeBlock text="stream-prefix-1" lang="json" />);
    await act(async () => {});
    view.rerender(<CodeBlock text="stream-prefix-12" lang="json" />);
    view.rerender(<CodeBlock text="stream-prefix-123" lang="json" />);
    view.unmount();

    const callsBeforeRemount = mocks.highlightLoadedCode.mock.calls.length;
    // The final text hits cache without re-highlighting.
    const finalView = render(<CodeBlock text="stream-prefix-123" lang="json" />);
    expect(finalView.container.querySelector(".lc-shiki")).not.toBeNull();
    expect(mocks.highlightLoadedCode).toHaveBeenCalledTimes(callsBeforeRemount);
    finalView.unmount();

    // Intermediate prefixes were pruned instead of lingering in the LRU.
    render(<CodeBlock text="stream-prefix-1" lang="json" />);
    expect(mocks.highlightLoadedCode).toHaveBeenCalledTimes(callsBeforeRemount + 1);
  });

  it("shows the current text while a newly requested grammar loads", async () => {
    const view = render(<CodeBlock text="before-language-switch" lang="json" />);
    await act(async () => {});
    const language = Promise.withResolvers<boolean>();
    const originalEnsure = mocks.ensureLanguage.getMockImplementation()!;
    mocks.ensureLanguage.mockImplementationOnce(async (lang) => {
      const ok = await language.promise;
      if (ok) await originalEnsure(lang);
      return ok;
    });
    view.rerender(<CodeBlock text="after-language-switch" lang="python" />);
    expect(screen.queryByText("before-language-switch")).toBeNull();
    expect(screen.getByText("after-language-switch").tagName).toBe("PRE");
    await act(async () => language.resolve(true));
    expect(mocks.highlightLoadedCode.mock.lastCall?.[0]).toBe("after-language-switch");
  });

  it("falls back to plain text without re-requesting when synchronous highlighting fails", async () => {
    mocks.highlightLoadedCode.mockReturnValueOnce({ html: null });
    const view = render(<CodeBlock text="broken-sync-highlight" lang="markdown" />);
    await act(async () => {});
    expect(view.container.querySelector(".lc-shiki")).toBeNull();
    expect(screen.getByText("broken-sync-highlight").tagName).toBe("PRE");
    expect(mocks.ensureLanguage).not.toHaveBeenCalled();
  });

  it.each(["rejected", "unsupported"] as const)(
    "keeps plain code visible when grammar loading is %s",
    async (outcome) => {
      if (outcome === "rejected") {
        mocks.ensureLanguage.mockRejectedValueOnce(new Error("WASM blocked"));
      } else {
        mocks.ensureLanguage.mockResolvedValueOnce(false);
      }
      render(<CodeBlock text={`failed-${outcome}`} lang="json" />);
      await act(async () => {});
      expect(screen.getByText(`failed-${outcome}`).tagName).toBe("PRE");
      expect(mocks.highlightLoadedCode).toHaveBeenCalledTimes(1);
    },
  );

  it("does not highlight after an unmounted language request resolves", async () => {
    const language = Promise.withResolvers<boolean>();
    mocks.ensureLanguage.mockReturnValue(language.promise);
    const view = render(<CodeBlock text="unmounted-language" lang="json" />);
    expect(mocks.highlightLoadedCode).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () => language.resolve(true));
    expect(mocks.highlightLoadedCode).toHaveBeenCalledTimes(1);
  });

  it("does not tokenize obsolete text after grammar loading finishes", async () => {
    const language = Promise.withResolvers<boolean>();
    const loaded = new Set<string>();
    mocks.ensureLanguage.mockImplementation(async (lang) => {
      const ok = await language.promise;
      if (ok) loaded.add(lang);
      return ok;
    });
    const tokenized: string[] = [];
    mocks.highlightLoadedCode.mockImplementation((text, lang) => {
      if (!loaded.has(lang)) return null;
      tokenized.push(text);
      return { html: `<pre>${text}</pre>` };
    });
    const view = render(<CodeBlock text="obsolete-body" lang="json" />);
    await act(async () => {});
    view.rerender(<CodeBlock text="current-body" lang="json" />);
    await act(async () => language.resolve(true));
    expect(tokenized).toEqual(["current-body"]);
    expect(screen.getByText("current-body")).toBeTruthy();
  });

  it("leaves oversized markup renderable while declining document-cache retention", async () => {
    const large = `<pre>${"x".repeat(4 * 1024 * 1024 + 1)}</pre>`;
    const loaded = new Set<string>();
    const tokenized: string[] = [];
    mocks.ensureLanguage.mockImplementation(async (lang) => {
      loaded.add(lang);
      return true;
    });
    mocks.highlightLoadedCode.mockImplementation((text, lang) => {
      if (!loaded.has(lang)) return null;
      tokenized.push(text);
      return { html: large };
    });
    const view = render(<CodeBlock text="oversized-highlight" lang="json" />);
    await act(async () => {});
    expect(view.container.querySelector("pre")?.textContent?.length).toBe(4 * 1024 * 1024 + 1);
    expect(tokenized).toHaveLength(1);
    // Unrelated rerenders reuse the memoized result without re-tokenizing.
    view.rerender(<CodeBlock text="oversized-highlight" lang="json" className="extra" />);
    expect(tokenized).toHaveLength(1);
    view.unmount();
    render(<CodeBlock text="oversized-highlight" lang="json" />);
    await act(async () => {});
    expect(tokenized).toHaveLength(2);
  });
});
