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
    const highlighter = {
      getLoadedLanguages: () => loaded,
      loadLanguage: vi.fn<(...grammars: unknown[]) => Promise<void>>(async () => {
        await pending.promise;
        loaded.push("json");
      }),
    };
    fixture.createHighlighterCore.mockResolvedValue(highlighter);
    const { ensureLanguage } = await import("./shikiClient");
    const first = ensureLanguage("json");
    const second = ensureLanguage("json");
    await vi.waitFor(() => expect(highlighter.loadLanguage).toHaveBeenCalledTimes(1));
    expect(fixture.createHighlighterCore).toHaveBeenCalledWith(
      expect.objectContaining({ langs: [] }),
    );
    expect(highlighter.loadLanguage.mock.calls[0]).toHaveLength(1);
    pending.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    await expect(ensureLanguage("json")).resolves.toBe(true);
    expect(highlighter.loadLanguage).toHaveBeenCalledTimes(1);
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
    const { ensureLanguage } = await import("./shikiClient");
    await expect(ensureLanguage("json")).rejects.toThrow("chunk unavailable");
    await expect(ensureLanguage("json")).resolves.toBe(true);
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
