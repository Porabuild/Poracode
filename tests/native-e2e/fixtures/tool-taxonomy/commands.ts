import { itemCase } from "./builders";
import { EDIT_PATH } from "./core";

export const COMMAND_ROWS = [
  ["view", `sed -n '1,4p' ${EDIT_PATH}`, "viewed"],
  ["search", "rg fixture src", "searched"],
  ["git", "git status --short", "executed"],
  ["check", "pnpm run typecheck", "executed"],
  ["install", "pnpm install", "executed"],
  ["package", "pnpm --version", "executed"],
  ["list", "ls src", "viewed"],
  ["command", "echo fixture-marker", "executed"],
] as const;

export const COMMAND_RECOGNITION_CASES = [
  ...["lint", "typecheck", "typecheck:compat", "test", "fmt", "format", "fmt:check"].map((script) =>
    itemCase(
      `command-check:${script}`,
      "command_execution",
      { command: `pnpm run ${script}`, status: "success" },
      "executed",
    ),
  ),
  itemCase(
    "command-bare-cat",
    "command_execution",
    { command: `cat ${EDIT_PATH}`, status: "success" },
    "executed",
  ),
];
