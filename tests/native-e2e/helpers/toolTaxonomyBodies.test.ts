// @vitest-environment jsdom
// Run with the repository's renderer Lingui/Babel plugins (see the qualification
// report's exact isolated Vitest invocation). No app process or real tools run.
import { describe, expect, it } from "vitest";
import type { MessageDescriptor } from "@lingui/core";
import type { FileChangePayload, ToolCallPayload } from "@/shared/contracts";
import {
  extractAcpAddedFileText,
  extractAcpArgsPart,
  extractAcpDiffResultPart,
  extractAcpDiffSummary,
  extractAcpResultPart,
  extractReadFileResultPart,
} from "@/renderer/components/thread/ChatPane/parts/items/acpToolPayload";
import {
  getFileChangeCollapsedHeader,
  getToolCallCollapsedHeader,
} from "@/renderer/components/thread/ChatPane/parts/items/collapsedHeaderCache";
import { deriveWebSearchDisplay } from "@/renderer/components/thread/ChatPane/parts/items/webSearchDisplay";
import { i18n, type TranslateFn } from "@/renderer/i18n/i18n";
import { BODY_ALIAS_CASES, NEW_TEXT, taxonomyItem } from "../fixtures/tool-taxonomy-workload";
import { payload } from "./tool-taxonomy/test-support";

describe("body forms reach the existing extractors", () => {
  it("distinguishes plain, JSON, envelope precedence, header-only, and error bodies", () => {
    expect(extractAcpArgsPart(payload("tool_plain"))).toEqual({
      text: "plain request",
      language: "plain",
    });
    expect(extractAcpResultPart(payload("tool_plain"))).toEqual({
      text: "start-marker\nplain result\nend-marker",
      language: "plain",
    });
    expect(extractAcpArgsPart(payload("tool_json")).language).toBe("json");
    expect(JSON.parse(extractAcpResultPart(payload("tool_json")).text)).toEqual({
      records: [{ id: 1, ok: true }],
    });
    expect(extractAcpResultPart(payload("tool_result_envelopes"))).toEqual({
      text: "full-marker",
      language: "plain",
    });
    expect(extractAcpResultPart(payload("tool_header_only")).text).toBe("");
    expect(
      getToolCallCollapsedHeader(taxonomyItem("tool_header_only"), payload("tool_header_only"))
        .hasAuxDetails,
    ).toBe(false);
    expect(extractAcpResultPart(payload("tool_error")).text).toContain("failure-marker");
    for (const c of BODY_ALIAS_CASES.filter((candidate) => candidate.id.startsWith("result-text:")))
      expect(extractAcpResultPart(c.item.payload)).toEqual({
        text: "body-marker",
        language: "plain",
      });
    for (const c of BODY_ALIAS_CASES.filter((candidate) =>
      candidate.id.startsWith("result-blocks:"),
    ))
      expect(extractAcpResultPart(c.item.payload)).toEqual({
        text: "one\n\ntwo",
        language: "plain",
      });
  });

  it("unwraps every read carrier/text/path key and recognizes lazy reads without fetching", () => {
    for (const c of BODY_ALIAS_CASES.filter((candidate) =>
      /^read-(?:wrapper|result-path|direct)/.test(candidate.id),
    ))
      expect(extractReadFileResultPart(c.item.payload)).toEqual({
        text: NEW_TEXT,
        language: "typescript",
      });
    expect(extractReadFileResultPart(payload("read-markup-wrapper"))).toEqual({
      text: NEW_TEXT.trimEnd(),
      language: "typescript",
    });
    expect(extractReadFileResultPart(payload("read_range"))).toEqual({
      text: "const n = 1;\nconst m = 2;\nconst endMarker = true;",
      language: "typescript",
    });
    expect(extractReadFileResultPart(payload("read_full"))).toEqual({
      text: NEW_TEXT,
      language: "typescript",
    });
    const lazy = taxonomyItem("read_lazy");
    expect(getToolCallCollapsedHeader(lazy, lazy.payload as ToolCallPayload)).toMatchObject({
      lazyReadPath: "/tmp/tool-taxonomy/fixture.ts",
      hasReadResult: false,
    });
    for (const c of BODY_ALIAS_CASES.filter((candidate) => candidate.id.startsWith("read-header:")))
      expect(
        getToolCallCollapsedHeader(c.item, c.item.payload as ToolCallPayload).hasReadResult,
      ).toBe(true);
  });

  it("extracts create/edit/delete bodies and exact diff totals across distinct carriers", () => {
    for (const id of [
      "edit_unified",
      "edit_replacement",
      "edit_content_diff",
      "edit_changes",
      "generic_edit_patch",
      ...BODY_ALIAS_CASES.filter(
        (c) => c.id.startsWith("patch-arg:") || c.id.startsWith("replacement:"),
      ).map((c) => c.id),
    ]) {
      const p = taxonomyItem(id).payload;
      const diff = extractAcpDiffResultPart(p);
      expect(diff.language).toBe("diff");
      expect(diff.text).toContain("-export const n = 1;");
      expect(diff.text).toContain("+export const n = 2;");
      expect(extractAcpDiffSummary(p)).toEqual({ added: 1, removed: 1 });
    }
    for (const c of BODY_ALIAS_CASES.filter((candidate) => candidate.id.startsWith("edit-header:")))
      expect(
        getToolCallCollapsedHeader(c.item, c.item.payload as ToolCallPayload).hasDiffText,
      ).toBe(true);
    for (const id of ["create_content", "create_patch", "create_changes"]) {
      const item = taxonomyItem(id);
      expect(
        getFileChangeCollapsedHeader(item, item.payload as FileChangePayload).hasArgContent,
      ).toBe(true);
    }
    expect(
      extractAcpAddedFileText(taxonomyItem("create_patch").payload, "src/new-fixture.ts"),
    ).toBe("export const fixture = true;\n");
    expect(
      extractAcpAddedFileText(taxonomyItem("create_changes").payload, "src/new-fixture.ts"),
    ).toBe("export const fixture = true;\n");
    expect(
      getFileChangeCollapsedHeader(
        taxonomyItem("create_lazy"),
        taxonomyItem("create_lazy").payload as FileChangePayload,
      ).hasArgContent,
    ).toBe(false);
    expect(extractAcpDiffSummary(taxonomyItem("delete").payload)).toEqual({ added: 0, removed: 1 });
  });

  it("recognizes every generic web label and retains result count without external search", () => {
    for (const c of BODY_ALIAS_CASES.filter((candidate) => candidate.id.startsWith("web-label:"))) {
      expect(
        deriveWebSearchDisplay(
          c.item.payload as { query: string },
          ((descriptor: MessageDescriptor) => i18n._(descriptor)) as TranslateFn,
        ),
      ).toEqual({
        title: "Web search: fixture query",
        parts: { prefix: "Web search: ", path: "fixture query" },
        resultCount: 2,
        hasDetails: true,
      });
    }
  });
});
