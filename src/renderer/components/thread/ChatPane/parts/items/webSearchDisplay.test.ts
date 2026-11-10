import { describe, expect, it } from "vitest";
import type { MessageDescriptor } from "@lingui/core";
import type { WebSearchPayload } from "@/shared/contracts";
import { i18n, type TranslateFn } from "@/renderer/i18n/i18n";
import { deriveWebSearchDisplay } from "./webSearchDisplay";

const t = ((descriptor: MessageDescriptor) => i18n._(descriptor)) as TranslateFn;

function makePayload(payload: Record<string, unknown>): WebSearchPayload {
  return payload as unknown as WebSearchPayload;
}

describe("deriveWebSearchDisplay", () => {
  it("labels the query with the tool name when the provider names the tool", () => {
    // Grok: name from the ACP title, query lifted off the backend result.
    const grok = deriveWebSearchDisplay(
      makePayload({
        name: "Web search",
        query: "best electric toothbrush 2026",
        result: { contents: [{ type: "text", text: "https://example.com/a" }] },
      }),
      t,
    );
    expect(grok.title).toBe("Web search: best electric toothbrush 2026");
    expect(grok.parts).toEqual({ prefix: "Web search: ", path: "best electric toothbrush 2026" });
    expect(grok.resultCount).toBe(1);

    // Codex spells the same tool `webSearch` and surfaces no result blocks.
    const codex = deriveWebSearchDisplay(
      makePayload({ name: "webSearch", query: "cron-parser 5.6.2 strict mode" }),
      t,
    );
    expect(codex.title).toBe("Web search: cron-parser 5.6.2 strict mode");
    expect(codex.resultCount).toBeUndefined();
  });

  it("leaves self-describing rows alone", () => {
    // Claude folds the whole call into the query and carries no tool name.
    const claude = deriveWebSearchDisplay(
      makePayload({ query: 'WebFetch: {"url":"https://agent-plugins.org/"}' }),
      t,
    );
    expect(claude.title).toBe('WebFetch: {"url":"https://agent-plugins.org/"}');
    expect(claude.parts).toBeUndefined();

    // OpenCode reuses the type for page fetches; its name is the fetched URL.
    const opencode = deriveWebSearchDisplay(
      makePayload({
        name: "https://cursor.com/docs (text/plain)",
        query: "https://cursor.com/docs",
        result: "# Cursor",
      }),
      t,
    );
    expect(opencode.title).toBe("https://cursor.com/docs");
    expect(opencode.parts).toBeUndefined();
  });

  it("falls back to the generic label while the query is still unknown", () => {
    const pending = deriveWebSearchDisplay(makePayload({ name: "WebSearch", query: "" }), t);
    expect(pending.title).toBe("Web search");
    expect(pending.parts).toBeUndefined();
    expect(pending.hasDetails).toBe(false);
  });

  it("does not repeat the tool name when the query is still the placeholder", () => {
    // Grok's opening tool_call has no query yet, so the canonical query falls
    // back to the title — the row must not read `Web search: Web search`.
    for (const query of ["Web search", "Web search:", "web_search"]) {
      const running = deriveWebSearchDisplay(makePayload({ name: "Web search", query }), t);
      expect(running.title).toBe("Web search");
      expect(running.parts).toBeUndefined();
    }
  });

  it("titles open_page actions with the URL", () => {
    const display = deriveWebSearchDisplay(
      makePayload({
        name: "webSearch",
        action: "open_page",
        url: "https://openrgb.org/releases.html",
        query: "https://openrgb.org/releases.html",
        args: { type: "openPage", url: "https://openrgb.org/releases.html" },
        result: { contents: [{ type: "text", text: "Release notes" }] },
      }),
      t,
    );
    expect(display.title).toBe("Open page: https://openrgb.org/releases.html");
    expect(display.parts).toEqual({
      prefix: "Open page: ",
      path: "https://openrgb.org/releases.html",
    });
    expect(display.hasDetails).toBe(true);
  });

  it("titles find_in_page actions with pattern and page", () => {
    const both = deriveWebSearchDisplay(
      makePayload({
        name: "webSearch",
        action: "find_in_page",
        pattern: "Release",
        url: "https://openrgb.org/releases.html",
      }),
      t,
    );
    expect(both.title).toBe('Find "Release" in https://openrgb.org/releases.html');

    const patternOnly = deriveWebSearchDisplay(
      makePayload({ name: "webSearch", action: "find_in_page", pattern: "Release" }),
      t,
    );
    expect(patternOnly.title).toBe('Find in page: "Release"');

    const urlOnly = deriveWebSearchDisplay(
      makePayload({
        name: "webSearch",
        action: "find_in_page",
        url: "https://openrgb.org/releases.html",
      }),
      t,
    );
    expect(urlOnly.title).toBe("Open page: https://openrgb.org/releases.html");
  });

  it("joins multi-query searches into one title", () => {
    const display = deriveWebSearchDisplay(
      makePayload({
        name: "webSearch",
        action: "search",
        query: "OpenRGB latest release · OpenRGB supported devices",
        queries: ["OpenRGB latest release", "OpenRGB supported devices"],
      }),
      t,
    );
    expect(display.title).toBe("Web search: OpenRGB latest release · OpenRGB supported devices");
    expect(display.parts).toEqual({
      prefix: "Web search: ",
      path: "OpenRGB latest release · OpenRGB supported devices",
    });
  });

  it("keeps pre-upgrade persisted payloads expandable-free", () => {
    // Rows persisted before structured actions existed carry args:null and no
    // result; they must not grow an empty expandable body.
    const legacy = deriveWebSearchDisplay(
      makePayload({
        query: "OpenRGB latest release ...",
        name: "webSearch",
        args: null,
        status: "success",
        resultCount: 40,
      }),
      t,
    );
    expect(legacy.title).toBe("Web search: OpenRGB latest release ...");
    expect(legacy.hasDetails).toBe(false);
    expect(legacy.resultCount).toBe(40);
  });

  it("preserves ambiguous pre-upgrade search queries without inventing actions", () => {
    const openPage = deriveWebSearchDisplay(
      makePayload({
        query: "https://openrgb.org/releases.html",
        name: "webSearch",
        args: null,
        status: "success",
        resultCount: 1,
      }),
      t,
    );
    expect(openPage.title).toBe("Web search: https://openrgb.org/releases.html");
    expect(openPage.parts).toEqual({
      prefix: "Web search: ",
      path: "https://openrgb.org/releases.html",
    });
    expect(openPage.hasDetails).toBe(false);

    const findInPage = deriveWebSearchDisplay(
      makePayload({
        query: "'Release'",
        name: "webSearch",
        args: null,
        status: "success",
        resultCount: 1,
      }),
      t,
    );
    expect(findInPage.title).toBe("Web search: 'Release'");
    expect(findInPage.hasDetails).toBe(false);

    const findInPageWithUrl = deriveWebSearchDisplay(
      makePayload({
        query: "'Release' in https://openrgb.org/releases.html",
        name: "webSearch",
        args: null,
        status: "success",
        resultCount: 1,
      }),
      t,
    );
    expect(findInPageWithUrl.title).toBe(
      "Web search: 'Release' in https://openrgb.org/releases.html",
    );
    expect(findInPageWithUrl.hasDetails).toBe(false);
  });
});
