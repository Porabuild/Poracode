import { describe, expect, it } from "vitest";
import { parseGitHubActionsWorkflowYaml } from "./githubWorkflowDefinition";

describe("parseGitHubActionsWorkflowYaml", () => {
  it("maps workflow_dispatch inputs to typed controls", () => {
    expect(
      parseGitHubActionsWorkflowYaml(`
name: Release
on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      version:
        description: Release version
        required: true
        type: string
      dry_run:
        description: Skip publishing
        type: boolean
        default: false
      channel:
        type: choice
        options: [nightly, stable]
        default: nightly
`),
    ).toEqual({
      dispatchable: true,
      triggers: ["push", "workflow_dispatch"],
      inputs: [
        {
          name: "version",
          description: "Release version",
          required: true,
          type: "string",
          options: [],
        },
        {
          name: "dry_run",
          description: "Skip publishing",
          required: false,
          type: "boolean",
          defaultValue: false,
          options: [],
        },
        {
          name: "channel",
          description: "",
          required: false,
          type: "choice",
          defaultValue: "nightly",
          options: ["nightly", "stable"],
        },
      ],
    });
  });

  it("recognizes scalar and list workflow_dispatch triggers", () => {
    expect(parseGitHubActionsWorkflowYaml("on: workflow_dispatch").dispatchable).toBe(true);
    expect(parseGitHubActionsWorkflowYaml("on: [push, workflow_dispatch]").dispatchable).toBe(true);
  });

  it("returns a non-dispatchable definition for invalid yaml roots", () => {
    expect(parseGitHubActionsWorkflowYaml("[]")).toEqual({
      dispatchable: false,
      triggers: [],
      inputs: [],
    });
  });
});
