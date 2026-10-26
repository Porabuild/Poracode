import { describe, expect, it } from "vitest";
import type { HistoryRuntimeItem } from "@/shared/remote/historyPresentation";
import {
  DEFERRED_FILE_CHANGE_VALUE_MAX_BYTES,
  slimDeferredFileChange,
} from "./historyBodyDeferral";
import { parseHistoryReadNegotiation } from "./historyReadNegotiation";

const BIG = "x".repeat(DEFERRED_FILE_CHANGE_VALUE_MAX_BYTES * 4);

function fileChange(
  payload: Record<string, unknown>,
  overrides: Partial<HistoryRuntimeItem> = {},
): HistoryRuntimeItem {
  return {
    id: "fc-1",
    type: "file_change",
    state: "completed",
    payload,
    streams: {},
    ...overrides,
  } as HistoryRuntimeItem;
}

const header = {
  path: "src/a.ts",
  changeKind: "edit",
  name: "Edit src/a.ts",
  status: "completed",
  diffSummary: { added: 3, removed: 1 },
};

describe("slimDeferredFileChange", () => {
  it("keeps the header fields, drops large values and flags the row deferred", () => {
    const item = fileChange({
      ...header,
      args: { old_str: BIG, new_str: BIG },
      result: BIG,
      editOldText: BIG,
      editNewText: BIG,
    });
    const slim = slimDeferredFileChange(item);
    expect(slim.detailsDeferred).toBe(true);
    expect(slim.payload).toEqual(header);
    expect(JSON.stringify(slim).length).toBeLessThan(1024);
  });

  it("keeps a long collapsed-row label while still dropping the body", () => {
    const longName = `Patched 80 files ${"src/some/path.ts, ".repeat(300)}`;
    expect(longName.length).toBeGreaterThan(DEFERRED_FILE_CHANGE_VALUE_MAX_BYTES);
    const slim = slimDeferredFileChange(
      fileChange({ ...header, name: longName, path: "", args: { old_str: BIG } }),
    );
    expect(slim.detailsDeferred).toBe(true);
    expect((slim.payload as Record<string, unknown>).name).toBe(longName);
    expect(slim.payload).not.toHaveProperty("args");
  });

  it("drops a collapsed-row field only past its larger bound", () => {
    const slim = slimDeferredFileChange(fileChange({ ...header, name: "n".repeat(20 * 1024) }));
    expect(slim.detailsDeferred).toBe(true);
    expect(slim.payload).not.toHaveProperty("name");
  });

  it("drops a large output stream and keeps small ones", () => {
    const slim = slimDeferredFileChange(
      fileChange(header, { streams: { file_change_output: BIG, note: "ok" } }),
    );
    expect(slim.detailsDeferred).toBe(true);
    expect(slim.streams).toEqual({ note: "ok" });
  });

  it("measures the bound in UTF-8 bytes, not characters", () => {
    // 1000 CJK characters serialize to ~1000 characters but 3000 bytes.
    const multibyte = "界".repeat(1000);
    expect(JSON.stringify(multibyte).length).toBeLessThan(DEFERRED_FILE_CHANGE_VALUE_MAX_BYTES);
    const slim = slimDeferredFileChange(fileChange({ ...header, note: multibyte }));
    expect(slim.detailsDeferred).toBe(true);
    expect(slim.payload).not.toHaveProperty("note");
  });

  it("leaves a small row complete and unflagged", () => {
    const item = fileChange({ ...header, args: { old_str: "a", new_str: "b" } });
    expect(slimDeferredFileChange(item)).toBe(item);
  });

  it("sends a row without a diff summary complete so its header keeps its totals", () => {
    const { diffSummary: _omitted, ...withoutSummary } = header;
    const item = fileChange({ ...withoutSummary, editOldText: BIG });
    expect(slimDeferredFileChange(item)).toBe(item);
  });

  it("never touches running rows or other item types", () => {
    const running = fileChange({ ...header, editOldText: BIG }, { state: "started" });
    expect(slimDeferredFileChange(running)).toBe(running);
    const command = fileChange(
      { ...header, editOldText: BIG },
      {
        type: "command_execution",
      },
    );
    expect(slimDeferredFileChange(command)).toBe(command);
  });
});

describe("deferBodies negotiation", () => {
  const url = (query: string) =>
    new URL(`http://host/api/threads/t/history?reads=bounded-v1${query}`);

  it("accepts file_change with the compact projection", () => {
    expect(
      parseHistoryReadNegotiation(url("&projection=details-v1&deferBodies=file_change")),
    ).toMatchObject({ compactDetails: true, deferFileChangeBodies: true });
  });

  it("does not defer without the parameter, as a client from before it sends", () => {
    const negotiation = parseHistoryReadNegotiation(url("&projection=details-v1"));
    expect(negotiation.compactDetails).toBe(true);
    expect(negotiation.deferFileChangeBodies).toBeUndefined();
  });

  it("rejects an unknown value or a deferral without the projection", () => {
    expect(() =>
      parseHistoryReadNegotiation(url("&projection=details-v1&deferBodies=everything")),
    ).toThrow(/Unsupported history body deferral/u);
    expect(() => parseHistoryReadNegotiation(url("&deferBodies=file_change"))).toThrow(
      /requires the compact history projection/u,
    );
  });
});
