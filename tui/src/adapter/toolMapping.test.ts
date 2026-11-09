import { expect, test } from "bun:test";
import { mapToolItem, mergePayload, PORACODE_ITEM_KEY } from "./toolMapping";

test("tool metadata keeps the runtime item for the transcript, bounded and without inline images", () => {
  const tool = mapToolItem("tool_call", {
    name: "Read",
    status: "success",
    args: { file_path: "a.ts" },
    result: "x".repeat(70 * 1024),
    images: ["data:image/png;base64,AAAA"],
  });
  const item = tool?.metadata[PORACODE_ITEM_KEY] as {
    type: string;
    payload: Record<string, unknown>;
  };
  expect(item.type).toBe("tool_call");
  expect(item.payload.args).toEqual({ file_path: "a.ts" });
  expect(String(item.payload.result)).toHaveLength(64 * 1024);
  expect(item.payload).not.toHaveProperty("images");
});

test("payload updates merge shallowly like the desktop reducer", () => {
  expect(mergePayload({ command: "ls", cwd: "/" }, { exitCode: 0 })).toEqual({
    command: "ls",
    cwd: "/",
    exitCode: 0,
  });
  expect(mergePayload({ command: "ls" }, undefined)).toEqual({ command: "ls" });
});

test("a crossagent tool tile names the role that ran it", () => {
  const tool = mapToolItem("tool_call", {
    name: "read",
    status: "success",
    isCrossagent: true,
    subAgentType: "Builder",
    args: { path: "src/a.ts" },
  });
  expect(tool?.name).toBe("Builder \u00b7 read");
});

test("a crossagent tool tile without a role keeps the plain tool name", () => {
  const tool = mapToolItem("tool_call", {
    name: "read",
    status: "success",
    isCrossagent: true,
    args: { path: "src/a.ts" },
  });
  expect(tool?.name).toBe("read");
});

test("a native sub-agent tile still maps to task", () => {
  const tool = mapToolItem("tool_call", {
    name: "run",
    title: "Research",
    status: "success",
    isSubAgent: true,
    subAgentType: "explore",
  });
  expect(tool?.name).toBe("task");
  expect(tool?.input).toMatchObject({ subagent_type: "explore" });
});

test("question_answer maps to a dedicated tool carrying its runtime item", () => {
  const tool = mapToolItem("question_answer", {
    questions: [
      {
        header: "Color",
        question: "Which color?",
        selected: [{ label: "Blue" }],
      },
    ],
  });
  expect(tool?.name).toBe("poracode_question_answer");
  const item = tool?.metadata[PORACODE_ITEM_KEY] as {
    type: string;
    payload: { questions: { question: string }[] };
  };
  expect(item.type).toBe("question_answer");
  expect(item.payload.questions[0]?.question).toBe("Which color?");
});
