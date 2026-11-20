import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalToolPresentation,
  canonicalToolPresentationCatalog,
  resolveToolPresentationSections,
} from "./canonicalToolPresentation";
import {
  TOOL_PRESENTATION_MAX_WIRE_BYTES,
  toolPresentationCatalogSchema,
  toolPresentationSchema,
} from "./contracts/toolPresentation";
import {
  remoteEnvironmentDescriptorSchema,
  PORACODE_REMOTE_PROTOCOL_VERSION,
} from "./remote/protocol";
import { resolveToolTextSource } from "./toolPresentationSource";

describe("host tool presentation catalog", () => {
  it("pins the host-produced catalog used by native readers", () => {
    const fixture = JSON.parse(
      readFileSync(
        resolve("protocol/remote/v3/fixtures/client-tool-presentation-catalog.json"),
        "utf8",
      ),
    ) as unknown;
    expect(canonicalToolPresentationCatalog()).toEqual(fixture);
    expect(toolPresentationCatalogSchema.parse(fixture)).toEqual(fixture);
  });

  it("bounds connection metadata without copying bodies into history or live rows", () => {
    const catalog = canonicalToolPresentationCatalog();
    expect(catalog.itemTypes).toHaveLength(7);
    expect(new Set(catalog.itemTypes.map((entry) => entry.itemType)).size).toBe(
      catalog.itemTypes.length,
    );
    expect(Buffer.byteLength(JSON.stringify(catalog))).toBeLessThan(16 * 1024);
    for (const entry of catalog.itemTypes) {
      expect(Buffer.byteLength(JSON.stringify(entry.presentation))).toBeLessThanOrEqual(
        TOOL_PRESENTATION_MAX_WIRE_BYTES,
      );
    }
    expect(canonicalToolPresentation("assistant_message")).toBeUndefined();
  });

  it("selects complete command output, strips terminal escapes, and keeps fallback results", () => {
    const presentation = canonicalToolPresentation("command_execution")!;
    const payload = {
      command: "node app.js",
      result: { content: "preview", detailedContent: "complete result" },
    };
    expect(resolveToolTextSource(presentation.header!.source, { payload }).text).toBe(
      "node app.js",
    );
    const output = presentation.sections[1]!.source;
    expect(
      resolveToolTextSource(output, {
        payload,
        streams: { command_output: "\u001b[31mhello\u001b[0m\nend" },
      }),
    ).toEqual({ text: "hello\nend", language: "plain" });
    expect(resolveToolTextSource(output, { payload, streams: {} }).text).toBe("complete result");
    expect(payload.result.content).toBe("preview");
  });

  it("keeps argument/result selection in the shared formatter rather than client tool-name branches", () => {
    for (const type of ["tool_call", "dynamic_tool_call", "mcp_tool_call"]) {
      const presentation = canonicalToolPresentation(type)!;
      const payload = { name: "arbitrary.tool", args: false, result: { text: "response" } };
      expect(presentation.sections.map((section) => section.label)).toEqual(["args", "result"]);
      expect(resolveToolTextSource(presentation.sections[0]!.source, { payload })).toEqual({
        text: "false",
        language: "json",
      });
      expect(resolveToolTextSource(presentation.sections[1]!.source, { payload }).text).toBe(
        "response",
      );
    }
  });

  it("shows a unified diff instead of redundant arguments and results", () => {
    const presentation = canonicalToolPresentation("file_change")!;
    const diff = "diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new\n";
    const payload = {
      path: "x",
      changeKind: "edit",
      args: { old: "old", new: "new" },
      result: diff,
    };
    const sections = resolveToolPresentationSections(presentation, { payload });
    expect(sections).toHaveLength(1);
    expect(sections[0]!.part).toEqual({ text: diff, language: "diff" });
    const fallback = resolveToolPresentationSections(presentation, {
      payload: { ...payload, result: "saved" },
    });
    expect(fallback.map((section) => section.section.label)).toEqual(["args", "result"]);
    const streamed = resolveToolPresentationSections(presentation, {
      payload,
      streams: { file_change_output: "complete output" },
    });
    expect(streamed).toHaveLength(1);
    expect(streamed[0]!.part.text).toBe("complete output");
    expect(presentation.header!.labelChoice!.labels).toEqual({
      create: "create",
      edit: "edit",
      delete: "delete",
    });
  });

  it("accepts older environment descriptors and retains future opaque catalogs", () => {
    const older = {
      protocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
      desktopId: "fixture-host",
      label: "Fixture",
      appVersion: "1.0",
      auth: {
        policy: "remote-reachable",
        bootstrapMethods: ["one-time-token"],
        sessionMethods: ["bearer-access-token"],
        scopes: ["session:read"],
      },
      endpoints: { httpBaseUrl: "http://127.0.0.1:3100", wsBaseUrl: "ws://127.0.0.1:3100" },
    };
    expect(remoteEnvironmentDescriptorSchema.parse(older).toolPresentation).toBeUndefined();
    const future = { version: 2, futureLayout: { opaque: [false, "retained"] } };
    expect(
      remoteEnvironmentDescriptorSchema.parse({ ...older, toolPresentation: future })
        .toolPresentation,
    ).toEqual(future);
    const catalog = canonicalToolPresentationCatalog();
    expect(
      remoteEnvironmentDescriptorSchema.parse({ ...older, toolPresentation: catalog })
        .toolPresentation,
    ).toEqual(catalog);
  });

  it("rejects unsupported operations and unbounded sources in the known vocabulary", () => {
    expect(
      toolPresentationSchema.safeParse({ version: 1, sections: [{ kind: "execute", source: {} }] })
        .success,
    ).toBe(false);
    expect(
      toolPresentationSchema.safeParse({
        version: 1,
        sections: [
          { kind: "code", source: { root: "payload", path: Array(13).fill("x"), format: "value" } },
        ],
      }).success,
    ).toBe(false);
  });
});
