import type { TaxonomyCase } from "./types";
import { itemCase, toolCase } from "./builders";
import { COMMAND_ROWS } from "./commands";

export const TOOL_PAYLOAD_CASES: readonly TaxonomyCase[] = [
  ...COMMAND_ROWS.map(([intent, command, category]) =>
    itemCase(
      `command_${intent}`,
      "command_execution",
      { command, cwd: "/tmp/fixture-project", exitCode: 0, durationMs: 120, status: "success" },
      category,
      {},
      { streams: { command_output: "command-start-marker\ncommand-end-marker" } },
    ),
  ),
  itemCase(
    "command_stream",
    "command_execution",
    { command: "fixture-stream-command", status: "running" },
    "executed",
    {},
    { state: "updated", streams: { command_output: "first\nlast-marker" } },
  ),
  itemCase(
    "command_error",
    "command_execution",
    {
      command: "fixture-failure",
      status: "error",
      exitCode: 2,
      durationMs: 120,
      errorMessage: "offline failure-marker",
    },
    "executed",
    {},
    { streams: { command_output: "offline failure-marker" } },
  ),
  itemCase(
    "mcp_names",
    "mcp_tool_call",
    {
      name: "mcp__fixture_server__lookup",
      kind: "read",
      args: { id: 1 },
      result: { content: [{ type: "text", text: "mcp-marker" }] },
      status: "success",
    },
    "mcp",
  ),
  itemCase(
    "dynamic_bucket",
    "dynamic_tool_call",
    {
      name: "FixtureDynamic",
      kind: "other",
      args: { op: "inspect" },
      result: "dynamic-marker",
      status: "success",
    },
    "other",
  ),
  toolCase(
    "skill",
    {
      name: "Skill",
      args: { skill: "fixture-skill" },
      result: "# Skill\n\n- one\n- two\n\n`marker`",
      status: "success",
    },
    "other",
    { skill: true },
  ),
  toolCase(
    "task_bookkeeping",
    {
      name: "TaskCreate",
      args: { description: "fixture task", id: "task-1" },
      result: { id: "task-1" },
      status: "success",
    },
    "other",
  ),
  toolCase(
    "task_name_only",
    {
      name: "Task",
      args: { description: "fixture name only" },
      result: "simulated output",
      status: "success",
    },
    "other",
    { subagent: false },
  ),
  toolCase(
    "persisted_summary",
    { name: "3 views, 2 edits, 1 command", status: "success" },
    "viewed",
  ),
];

export const TOOL_ERROR_CASE = toolCase(
  "tool_error",
  {
    name: "FixtureTool",
    args: { op: "fail" },
    result: { message: "failure-marker" },
    status: "error",
  },
  "other",
);
