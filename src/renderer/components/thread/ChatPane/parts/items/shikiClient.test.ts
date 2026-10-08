import { describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ createHighlighterCore: vi.fn<() => Promise<unknown>>() }));
vi.mock("shiki/core", () => fixture);
vi.mock("shiki/engine/oniguruma", () => ({ createOnigurumaEngine: () => ({}) }));
vi.mock("shiki/wasm", () => ({}));

import { getShikiHighlighter } from "./shikiClient";

describe("lazy highlighter failures", () => {
  it("shares pending loads but retries after a failed initialization", async () => {
    const first = Promise.withResolvers<unknown>();
    const highlighter = { codeToHtml: vi.fn<(text: string) => string>() };
    fixture.createHighlighterCore
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(highlighter);
    const pending = getShikiHighlighter();
    expect(getShikiHighlighter()).toBe(pending);
    await vi.waitFor(() => expect(fixture.createHighlighterCore).toHaveBeenCalledTimes(1));
    first.reject(new Error("temporary WASM failure"));
    await expect(pending).rejects.toThrow("temporary WASM failure");
    const retry = getShikiHighlighter();
    expect(retry).not.toBe(pending);
    await expect(retry).resolves.toBe(highlighter);
    expect(getShikiHighlighter()).toBe(retry);
    expect(fixture.createHighlighterCore).toHaveBeenCalledTimes(2);
  });
});
