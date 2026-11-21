import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ createHighlighterCore: vi.fn<() => Promise<unknown>>() }));
vi.mock("shiki/core", () => fixture);
vi.mock("shiki/engine/javascript", () => ({ createJavaScriptRegexEngine: () => ({}) }));

beforeEach(() => {
  vi.resetModules();
  fixture.createHighlighterCore.mockReset();
});

describe("lazy highlighter failures", () => {
  it("shares pending loads but retries after a failed initialization", async () => {
    const { getShikiHighlighter } = await import("./shikiClient");
    const first = Promise.withResolvers<unknown>();
    const highlighter = { codeToHtml: vi.fn<(text: string) => string>() };
    fixture.createHighlighterCore
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(highlighter);
    const pending = getShikiHighlighter();
    expect(getShikiHighlighter()).toBe(pending);
    await vi.waitFor(() => expect(fixture.createHighlighterCore).toHaveBeenCalledTimes(1));
    first.reject(new Error("temporary engine failure"));
    await expect(pending).rejects.toThrow("temporary engine failure");
    const retry = getShikiHighlighter();
    expect(retry).not.toBe(pending);
    await expect(retry).resolves.toBe(highlighter);
    expect(getShikiHighlighter()).toBe(retry);
    expect(fixture.createHighlighterCore).toHaveBeenCalledTimes(2);
  });

  it("loads only the requested grammar, sharing concurrent requests and keeping it warm", async () => {
    const loaded: string[] = [];
    const pending = Promise.withResolvers<void>();
    const codeToHtml = vi.fn<(text: string, options: unknown) => string>(
      (text) => `<pre>${text}</pre>`,
    );
    const highlighter = {
      codeToHtml,
      getLoadedLanguages: () => loaded,
      loadLanguage: vi.fn<(...grammars: unknown[]) => Promise<void>>(async () => {
        await pending.promise;
        loaded.push("json");
      }),
    };
    fixture.createHighlighterCore.mockResolvedValue(highlighter);
    const { ensureLanguage, getLoadedShikiHighlighter, highlightLoadedCode } =
      await import("./shikiClient");
    expect(getLoadedShikiHighlighter("json")).toBeNull();
    expect(highlightLoadedCode("{}", "json", "github-dark")).toBeNull();
    const first = ensureLanguage("json");
    const second = ensureLanguage("json");
    await vi.waitFor(() => expect(highlighter.loadLanguage).toHaveBeenCalledTimes(1));
    expect(getLoadedShikiHighlighter("json")).toBeNull();
    expect(fixture.createHighlighterCore).toHaveBeenCalledWith(
      expect.objectContaining({ langs: [] }),
    );
    expect(highlighter.loadLanguage.mock.calls[0]).toHaveLength(1);
    pending.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(getLoadedShikiHighlighter("json")).toBe(highlighter);
    expect(getLoadedShikiHighlighter("python")).toBeNull();
    expect(getLoadedShikiHighlighter("markdown")).toBeNull();
    expect(getLoadedShikiHighlighter("not-a-language")).toBeNull();
    expect(getLoadedShikiHighlighter("constructor")).toBeNull();
    expect(getLoadedShikiHighlighter("__proto__")).toBeNull();
    expect(highlightLoadedCode("{}", "json", "github-dark")).toEqual({ html: "<pre>{}</pre>" });
    expect(codeToHtml.mock.calls[0]?.[1]).toMatchObject({
      lang: "json",
      theme: "github-dark",
      mergeSameStyleTokens: true,
    });
    await expect(ensureLanguage("json")).resolves.toBe(true);
    expect(highlighter.loadLanguage).toHaveBeenCalledTimes(1);
  });

  it("promotes transitive embedded grammars without marking markdown ready prematurely", async () => {
    const loaded: string[] = [];
    const highlighter = {
      getLoadedLanguages: () => loaded,
      loadLanguage: vi.fn<(...grammars: unknown[]) => Promise<void>>(async () => {
        loaded.push("html", "javascript", "css", "markdown");
      }),
    };
    fixture.createHighlighterCore.mockResolvedValue(highlighter);
    const { ensureLanguage, getLoadedShikiHighlighter } = await import("./shikiClient");
    await expect(ensureLanguage("html")).resolves.toBe(true);
    expect(getLoadedShikiHighlighter("html")).toBe(highlighter);
    expect(getLoadedShikiHighlighter("javascript")).toBe(highlighter);
    expect(getLoadedShikiHighlighter("css")).toBe(highlighter);
    // Markdown requires all embedded grammars before becoming synchronously ready.
    expect(getLoadedShikiHighlighter("markdown")).toBeNull();

    // Requesting markdown loads only the missing embedded grammars, then marks all ready.
    await expect(ensureLanguage("markdown")).resolves.toBe(true);
    expect(highlighter.loadLanguage).toHaveBeenCalledTimes(2);
    expect(highlighter.loadLanguage.mock.calls[1]).toHaveLength(13);
    expect(getLoadedShikiHighlighter("markdown")).toBe(highlighter);
    expect(getLoadedShikiHighlighter("typescript")).toBe(highlighter);
  });

  it("retries failed markdown loads without marking markdown or embedded grammars ready", async () => {
    const loaded: string[] = [];
    const highlighter = {
      getLoadedLanguages: () => loaded,
      loadLanguage: vi
        .fn<(...grammars: unknown[]) => Promise<void>>()
        .mockRejectedValueOnce(new Error("markdown chunk unavailable"))
        .mockImplementationOnce(async () => {
          loaded.push("markdown");
        }),
    };
    fixture.createHighlighterCore.mockResolvedValue(highlighter);
    const { ensureLanguage, getLoadedShikiHighlighter } = await import("./shikiClient");
    await expect(ensureLanguage("markdown")).rejects.toThrow("markdown chunk unavailable");
    expect(getLoadedShikiHighlighter("markdown")).toBeNull();
    expect(getLoadedShikiHighlighter("typescript")).toBeNull();
    await expect(ensureLanguage("markdown")).resolves.toBe(true);
    expect(getLoadedShikiHighlighter("markdown")).toBe(highlighter);
    expect(getLoadedShikiHighlighter("typescript")).toBe(highlighter);
  });

  it("returns null html when synchronous codeToHtml throws on a loaded grammar", async () => {
    const highlighter = {
      codeToHtml: vi.fn<() => string>(() => {
        throw new Error("tokenization failed");
      }),
      getLoadedLanguages: () => ["json"],
      loadLanguage: vi.fn<() => Promise<void>>(),
    };
    fixture.createHighlighterCore.mockResolvedValue(highlighter);
    const { ensureLanguage, highlightLoadedCode } = await import("./shikiClient");
    await expect(ensureLanguage("json")).resolves.toBe(true);
    expect(highlightLoadedCode("{}", "json", "github-dark")).toEqual({ html: null });
  });

  it("retries failed grammar loads without replacing the shared highlighter", async () => {
    const highlighter = {
      getLoadedLanguages: () => [],
      loadLanguage: vi
        .fn<() => Promise<void>>()
        .mockRejectedValueOnce(new Error("chunk unavailable"))
        .mockResolvedValue(undefined),
    };
    fixture.createHighlighterCore.mockResolvedValue(highlighter);
    const { ensureLanguage, getLoadedShikiHighlighter } = await import("./shikiClient");
    await expect(ensureLanguage("json")).rejects.toThrow("chunk unavailable");
    expect(getLoadedShikiHighlighter("json")).toBeNull();
    await expect(ensureLanguage("json")).resolves.toBe(true);
    expect(getLoadedShikiHighlighter("json")).toBe(highlighter);
    expect(fixture.createHighlighterCore).toHaveBeenCalledTimes(1);
    expect(highlighter.loadLanguage).toHaveBeenCalledTimes(2);
  });

  it("does not load the engine for unsupported names or inherited object keys", async () => {
    const { ensureLanguage } = await import("./shikiClient");
    for (const lang of ["plain", "not-a-language", "constructor", "__proto__"]) {
      await expect(ensureLanguage(lang)).resolves.toBe(false);
    }
    expect(fixture.createHighlighterCore).not.toHaveBeenCalled();
  });
});
