import { expect, test } from "bun:test";
import { mapToolItem } from "./toolMapping";

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
