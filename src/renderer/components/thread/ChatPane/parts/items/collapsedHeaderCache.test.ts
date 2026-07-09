import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolCallPayload } from "@/shared/contracts";
import { i18n } from "@/renderer/i18n/i18n";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import {
  getCommandExecutionCollapsedHeader,
  getFileChangeCollapsedHeader,
  getToolCallCollapsedHeader,
  hasCachedCommandHeader,
  hasCachedFileChangeHeader,
  hasCachedToolCallHeader,
} from "./collapsedHeaderCache";

vi.mock("./toolDisplay", async () => {
  const actual = await vi.importActual<typeof import("./toolDisplay")>("./toolDisplay");
  return {
    ...actual,
    deriveToolDisplay: vi.fn<typeof actual.deriveToolDisplay>(actual.deriveToolDisplay),
  };
});

vi.mock("./acpToolPayload", async () => {
  const actual = await vi.importActual<typeof import("./acpToolPayload")>("./acpToolPayload");
  return {
    ...actual,
    extractAcpDiffResultPart: vi.fn<typeof actual.extractAcpDiffResultPart>(
      actual.extractAcpDiffResultPart,
    ),
    extractAcpDiffSummary: vi.fn<typeof actual.extractAcpDiffSummary>(actual.extractAcpDiffSummary),
  };
});

vi.mock("./commandSummary", async () => {
  const actual = await vi.importActual<typeof import("./commandSummary")>("./commandSummary");
  return {
    ...actual,
    summarizeShellCommand: vi.fn<typeof actual.summarizeShellCommand>(actual.summarizeShellCommand),
    commandIntentDisplay: vi.fn<typeof actual.commandIntentDisplay>(actual.commandIntentDisplay),
  };
});

import { deriveToolDisplay } from "./toolDisplay";
import { extractAcpDiffResultPart, extractAcpDiffSummary } from "./acpToolPayload";
import { commandIntentDisplay, summarizeShellCommand } from "./commandSummary";

const deriveToolDisplayMock = vi.mocked(deriveToolDisplay);
const extractAcpDiffResultPartMock = vi.mocked(extractAcpDiffResultPart);
const extractAcpDiffSummaryMock = vi.mocked(extractAcpDiffSummary);
const summarizeShellCommandMock = vi.mocked(summarizeShellCommand);
const commandIntentDisplayMock = vi.mocked(commandIntentDisplay);

function makeToolItem(
  overrides: Partial<RuntimeChatItem> & { payload: ToolCallPayload },
): RuntimeChatItem {
  return {
    id: "tool-1",
    type: "tool_call",
    state: "completed",
    streams: {},
    ...overrides,
  };
}

describe("collapsedHeaderCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computes a completed tool header once and reuses it on remount", () => {
    const payload: ToolCallPayload = {
      name: "Read",
      kind: "read",
      status: "success",
      locations: [{ path: "src/foo.ts" }],
    };
    const item = makeToolItem({ payload });

    const first = getToolCallCollapsedHeader(item, payload);
    const second = getToolCallCollapsedHeader(item, payload);

    expect(second).toBe(first);
    expect(deriveToolDisplayMock).toHaveBeenCalledTimes(1);
    expect(hasCachedToolCallHeader(item)).toBe(true);
  });

  it("does not populate the cache for running tool rows", () => {
    const payload: ToolCallPayload = {
      name: "Read",
      kind: "read",
      status: "running",
      locations: [{ path: "src/foo.ts" }],
    };
    const item = makeToolItem({ state: "started", payload });

    getToolCallCollapsedHeader(item, payload);
    getToolCallCollapsedHeader(item, payload);

    expect(hasCachedToolCallHeader(item)).toBe(false);
    expect(deriveToolDisplayMock).toHaveBeenCalledTimes(2);
  });

  it("recomputes when the RuntimeChatItem object is replaced (late payload patch)", () => {
    const payload: ToolCallPayload = {
      name: "Edit",
      kind: "edit",
      status: "success",
      result: { text: "--- a\n+++ b\n@@\n-a\n+b\n" },
    };
    const item1 = makeToolItem({ payload });
    getToolCallCollapsedHeader(item1, payload);
    expect(deriveToolDisplayMock).toHaveBeenCalledTimes(1);

    // Reducer always spreads a new item object on item.updated / item.completed.
    const item2 = { ...item1, payload: { ...payload, title: "Editing src/foo.ts" } };
    getToolCallCollapsedHeader(item2, item2.payload as ToolCallPayload);

    expect(deriveToolDisplayMock).toHaveBeenCalledTimes(2);
    expect(hasCachedToolCallHeader(item1)).toBe(true);
    expect(hasCachedToolCallHeader(item2)).toBe(true);
  });

  it("recomputes when the active locale changes", () => {
    const payload: ToolCallPayload = {
      name: "Read",
      kind: "read",
      status: "success",
      locations: [{ path: "src/foo.ts" }],
    };
    const item = makeToolItem({ payload });
    getToolCallCollapsedHeader(item, payload);
    expect(deriveToolDisplayMock).toHaveBeenCalledTimes(1);

    const prev = i18n.locale;
    i18n.activate(prev === "en" ? "es" : "en");
    try {
      getToolCallCollapsedHeader(item, payload);
      expect(deriveToolDisplayMock).toHaveBeenCalledTimes(2);
    } finally {
      i18n.activate(prev);
    }
  });

  it("passes the synthesized diff part into the summary fallback", () => {
    const payload: ToolCallPayload = {
      name: "apply_patch",
      kind: "edit",
      status: "success",
      args: {
        patchText: [
          "*** Begin Patch",
          "*** Update File: src/foo.ts",
          "@@",
          "-old",
          "+new",
          "*** End Patch",
        ].join("\n"),
      },
    };
    const item = makeToolItem({ payload });

    const header = getToolCallCollapsedHeader(item, payload);

    expect(header.diffSummary).toEqual({ added: 1, removed: 1 });
    // The already-synthesized diff part must ride along so the summary
    // fallback does not rebuild the diff from the payload a second time.
    expect(extractAcpDiffSummaryMock).toHaveBeenCalledWith(
      payload,
      expect.objectContaining({ language: "diff" }),
    );
  });

  it("caches completed file-change headers across remounts", () => {
    const payload = {
      path: "src/foo.ts",
      changeKind: "edit" as const,
      status: "success" as const,
      diffSummary: { added: 2, removed: 1 },
    };
    const item: RuntimeChatItem = {
      id: "fc-1",
      type: "file_change",
      state: "completed",
      streams: {},
      payload,
    };

    getFileChangeCollapsedHeader(item, payload);
    getFileChangeCollapsedHeader(item, payload);

    expect(hasCachedFileChangeHeader(item)).toBe(true);
    // First compute may call extractors; remount must not.
    const callsAfterFirst = extractAcpDiffResultPartMock.mock.calls.length;
    getFileChangeCollapsedHeader(item, payload);
    expect(extractAcpDiffResultPartMock).toHaveBeenCalledTimes(callsAfterFirst);
    expect(extractAcpDiffSummaryMock.mock.calls.length).toBeLessThanOrEqual(callsAfterFirst + 1);
  });

  it("caches completed command headers across remounts", () => {
    const payload = {
      command: "pnpm test",
      cwd: "E:/repo",
      exitCode: 0,
      durationMs: 1200,
      status: "success" as const,
    };
    const item: RuntimeChatItem = {
      id: "cmd-1",
      type: "command_execution",
      state: "completed",
      streams: {},
      payload,
    };

    getCommandExecutionCollapsedHeader(item, payload);
    getCommandExecutionCollapsedHeader(item, payload);

    expect(hasCachedCommandHeader(item)).toBe(true);
    expect(summarizeShellCommandMock).toHaveBeenCalledTimes(1);
    expect(commandIntentDisplayMock).toHaveBeenCalledTimes(1);
  });
});
