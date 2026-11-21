import { readToolValuePath } from "./toolPresentationSource";

/** These are exactly the canonical/auxiliary fields used by command headings. */
export const COMMAND_HEADER_INPUTS = [
  ["command"],
  ["cwd"],
  ["actions"],
  ["status"],
  ["exitCode"],
  ["durationMs"],
  ["args", "command"],
  ["args", "cwd"],
].map((path) => ({ root: "payload" as const, path }));

export const MCP_TOOL_HEADER_INPUTS = [["name"], ["serverId"], ["status"]].map((path) => ({
  root: "payload" as const,
  path,
}));

/** Registration recovery deliberately excludes scripts and all output streams. */
export const WORKFLOW_REGISTRATION_INPUTS = [
  ["name"],
  ["serverId"],
  ["workflow"],
  ["result"],
  ["progress", "description"],
].map((path) => ({ root: "payload" as const, path }));

/** Requested only when opening the viewer, rather than for every visible row. */
export const WORKFLOW_VIEW_INPUTS = [
  ...WORKFLOW_REGISTRATION_INPUTS,
  { root: "payload" as const, path: ["args"] },
];

/** Body interpretation reads only the completed result and its canonical identity. */
export const TOOL_BODY_INPUTS = [["name"], ["serverId"], ["workflow"], ["status"], ["result"]].map(
  (path) => ({ root: "payload" as const, path }),
);

export function runtimeHeaderInput(
  type: string,
  state: string,
  payload: unknown,
  version: 1 | 2 | 3 | 4 | 5 = 1,
): unknown[] {
  const inputs =
    version === 1
      ? COMMAND_HEADER_INPUTS
      : version === 2
        ? MCP_TOOL_HEADER_INPUTS
        : version === 3
          ? WORKFLOW_REGISTRATION_INPUTS
          : version === 4
            ? WORKFLOW_VIEW_INPUTS
            : TOOL_BODY_INPUTS;
  return [
    `runtime-item-header-v${version}`,
    type,
    state,
    ...inputs.map((source) => [
      source.root,
      source.path,
      readToolValuePath(payload, source.path) ?? null,
    ]),
  ];
}
