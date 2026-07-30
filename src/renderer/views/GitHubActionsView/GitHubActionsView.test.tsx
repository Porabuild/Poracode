// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GhDeleteWorkflowRunPayload,
  GhDispatchWorkflowPayload,
  GhGetWorkflowDefinitionPayload,
  GhGetWorkflowDefinitionResult,
  GhGetWorkflowRunPayload,
  GhGetWorkflowRunResult,
  GhListWorkflowRunsPayload,
  GhListWorkflowRunsResult,
  GhListWorkflowsPayload,
  GhListWorkflowsResult,
  GhRerunWorkflowRunPayload,
  GitHubActionsRun,
  Project,
} from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";

const bridge = vi.hoisted(() => ({
  ghListWorkflows: vi.fn<(payload: GhListWorkflowsPayload) => Promise<GhListWorkflowsResult>>(),
  ghListWorkflowRuns:
    vi.fn<(payload: GhListWorkflowRunsPayload) => Promise<GhListWorkflowRunsResult>>(),
  ghGetWorkflowDefinition:
    vi.fn<(payload: GhGetWorkflowDefinitionPayload) => Promise<GhGetWorkflowDefinitionResult>>(),
  ghGetWorkflowRun: vi.fn<(payload: GhGetWorkflowRunPayload) => Promise<GhGetWorkflowRunResult>>(),
  ghDispatchWorkflow: vi.fn<(payload: GhDispatchWorkflowPayload) => Promise<void>>(),
  ghRerunWorkflowRun: vi.fn<(payload: GhRerunWorkflowRunPayload) => Promise<void>>(),
  ghDeleteWorkflowRun: vi.fn<(payload: GhDeleteWorkflowRunPayload) => Promise<void>>(),
  openExternal: vi.fn<() => Promise<void>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
  isRemoteSession: () => false,
  isMac: () => false,
  isWindows: () => false,
}));

import { buildWorkflowDispatchInputs } from "./GitHubActionsDispatchPopover";
import { GitHubActionsView } from "./GitHubActionsView";

const project: Project = {
  id: "project-1",
  name: "Poracode",
  location: { kind: "windows", path: "E:\\work\\poracode" },
  createdAt: "2026-07-25T10:00:00.000Z",
};

const run: GitHubActionsRun = {
  id: 501,
  workflowId: 11,
  workflowName: "CI",
  name: "CI",
  number: 7,
  attempt: 1,
  title: "Test Actions dashboard",
  event: "workflow_dispatch",
  headBranch: "main",
  headSha: "abc123",
  status: "in_progress",
  conclusion: "",
  createdAt: "2026-07-25T10:00:00.000Z",
  startedAt: "2026-07-25T10:00:01.000Z",
  updatedAt: "2026-07-25T10:00:02.000Z",
  url: "https://github.com/owner/repo/actions/runs/501",
  jobs: [],
};

const definition: GhGetWorkflowDefinitionResult = {
  definition: {
    workflowId: 11,
    ref: "main",
    defaultBranch: "main",
    dispatchable: true,
    triggers: ["push", "workflow_dispatch"],
    inputs: [
      {
        name: "channel",
        description: "Release channel",
        required: true,
        type: "choice",
        defaultValue: "nightly",
        options: ["nightly", "stable"],
      },
      {
        name: "dry_run",
        description: "Skip publishing",
        required: false,
        type: "boolean",
        defaultValue: false,
        options: [],
      },
    ],
  },
};

describe("buildWorkflowDispatchInputs", () => {
  it("serializes declared workflow inputs without JSON", () => {
    expect(
      buildWorkflowDispatchInputs(definition.definition, {
        channel: "stable",
        dry_run: true,
      }),
    ).toEqual({
      inputs: { channel: "stable", dry_run: "true" },
      missing: [],
    });
  });
});

describe("GitHubActionsView", () => {
  beforeEach(() => {
    bridge.ghListWorkflows.mockReset().mockResolvedValue({
      workflows: [{ id: 11, name: "CI", path: ".github/workflows/ci.yml", state: "active" }],
    });
    bridge.ghListWorkflowRuns.mockReset().mockResolvedValue({ runs: [run] });
    bridge.ghGetWorkflowDefinition.mockReset().mockResolvedValue(definition);
    bridge.ghGetWorkflowRun.mockReset().mockResolvedValue({
      run: {
        ...run,
        jobs: [
          {
            id: 9001,
            name: "Typecheck",
            status: "in_progress",
            conclusion: "",
            steps: [
              {
                number: 1,
                name: "Checkout",
                status: "completed",
                conclusion: "success",
              },
            ],
          },
        ],
      },
    });
    bridge.ghDispatchWorkflow.mockReset().mockResolvedValue(undefined);
    bridge.ghRerunWorkflowRun.mockReset().mockResolvedValue(undefined);
    bridge.ghDeleteWorkflowRun.mockReset().mockResolvedValue(undefined);
    bridge.openExternal.mockReset().mockResolvedValue(undefined);
    useAppStore.setState({ projects: [project] });
    useGitStore.setState({
      branches: {
        [project.id]: {
          current: "main",
          branches: [{ name: "main", current: true, commit: "abc123", isRemote: false }],
        },
      },
    });
  });

  it("filters runs by workflow and leaves details collapsed", async () => {
    render(<GitHubActionsView projectId={project.id} onClose={() => {}} />);

    expect(await screen.findByText(run.title)).toBeInTheDocument();
    expect(bridge.ghListWorkflowRuns).toHaveBeenCalledWith({
      projectLocation: project.location,
      workflowId: 11,
    });
    expect(bridge.ghGetWorkflowRun).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("link", { name: new RegExp(run.title) }));
    expect(await screen.findByText("Typecheck")).toBeInTheDocument();
    expect(bridge.ghGetWorkflowRun).toHaveBeenCalledWith({
      projectLocation: project.location,
      runId: run.id,
    });
  });

  it("deep-links directly to a PR check run", async () => {
    render(<GitHubActionsView projectId={project.id} runId={run.id} onClose={() => {}} />);

    expect(await screen.findByText("Typecheck")).toBeInTheDocument();
    await waitFor(() =>
      expect(bridge.ghGetWorkflowRun).toHaveBeenCalledWith({
        projectLocation: project.location,
        runId: run.id,
      }),
    );
  });

  it("shows workflow-declared controls instead of a JSON field", async () => {
    render(<GitHubActionsView projectId={project.id} onClose={() => {}} />);
    await screen.findByText(run.title);

    fireEvent.click(screen.getAllByRole("button", { name: "Run workflow" })[1]!);

    expect(await screen.findByText("Release channel")).toBeInTheDocument();
    expect(screen.getByText("Skip publishing")).toBeInTheDocument();
    expect(screen.queryByText("Inputs (JSON)")).not.toBeInTheDocument();
  });
});
