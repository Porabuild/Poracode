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
});
