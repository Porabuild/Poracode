import { expect, test } from "bun:test";
import type { RuntimeChatItem } from "../../desktop/presentation";
import { toolRow } from "./model";

const readFileTool = {
  id: "t1",
  type: "tool_call",
  state: "completed",
  payload: {
    name: "Read",
    kind: "readfile",
    title: "Read tool",
    status: "success",
    args: { file_path: "/repo/src/app.ts" },
    result: "1: const port = 3000\n2: start({ port })",
  },
  streams: {},
} as unknown as RuntimeChatItem;

test("a readfile-kind tool shows its read body", () => {
  const row = toolRow(readFileTool);
  expect(row?.hasBody).toBe(true);
  const body = row?.body();
  expect(body?.kind).toBe("code");
  expect(body && "text" in body ? body.text : "").toContain("const port = 3000");
});
