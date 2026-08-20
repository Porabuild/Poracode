// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GhCancelWorkflowRunPayload,
  GhDeleteWorkflowRunPayload,
  GhDispatchWorkflowPayload,
  GhGetWorkflowDefinitionPayload,
  GhGetWorkflowDefinitionResult,
  GhGetWorkflowRunPayload,
  GhGetWorkflowRunResult,
  GhListAccountsResult,
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
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSidebarUiStore } from "@/renderer/state/sidebarUiStore";

const bridge = vi.hoisted(() => ({
  ghListWorkflows: vi.fn<(payload: GhListWorkflowsPayload) => Promise<GhListWorkflowsResult>>(),
  ghListWorkflowRuns:
    vi.fn<(payload: GhListWorkflowRunsPayload) => Promise<GhListWorkflowRunsResult>>(),
  ghGetWorkflowDefinition:
    vi.fn<(payload: GhGetWorkflowDefinitionPayload) => Promise<GhGetWorkflowDefinitionResult>>(),
  ghGetWorkflowRun: vi.fn<(payload: GhGetWorkflowRunPayload) => Promise<GhGetWorkflowRunResult>>(),
  ghDispatchWorkflow: vi.fn<(payload: GhDispatchWorkflowPayload) => Promise<void>>(),
  ghRerunWorkflowRun: vi.fn<(payload: GhRerunWorkflowRunPayload) => Promise<void>>(),
  ghCancelWorkflowRun: vi.fn<(payload: GhCancelWorkflowRunPayload) => Promise<void>>(),
  ghDeleteWorkflowRun: vi.fn<(payload: GhDeleteWorkflowRunPayload) => Promise<void>>(),
  ghListAccounts: vi.fn<() => Promise<GhListAccountsResult>>(),
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
import { resetGitHubActionsCaches } from "./useGitHubActionsViewModel";

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
    // The workflow/run/definition caches persist across mounts by design, so
    // each case has to start cold or it inherits the previous one's data.
    resetGitHubActionsCaches();
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
            url: "https://github.com/owner/repo/actions/runs/501/job/9001",
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
    bridge.ghCancelWorkflowRun.mockReset().mockResolvedValue(undefined);
    bridge.ghDeleteWorkflowRun.mockReset().mockResolvedValue(undefined);
    bridge.ghListAccounts.mockReset().mockResolvedValue({ accounts: [] });
    bridge.openExternal.mockReset().mockResolvedValue(undefined);
    useRemoteServersStore.setState({ servers: [], runtime: {} });
    useAppStore.setState({ projects: [project] });
    useSidebarUiStore.setState({ pinnedGitHubWorkflows: {} });
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
    const jobName = await screen.findByText("Typecheck");
    expect(bridge.ghGetWorkflowRun).toHaveBeenCalledWith({
      projectLocation: project.location,
      runId: run.id,
    });

    const jobDetails = jobName.closest("details");
    expect(jobDetails).not.toHaveAttribute("open");
    expect(jobName).toHaveClass("cursor-default");

    fireEvent.click(jobName);
    expect(jobDetails).toHaveAttribute("open");
    expect(bridge.openExternal).not.toHaveBeenCalled();

    fireEvent.click(within(jobDetails!).getByRole("button", { name: "Open job on GitHub" }));
    expect(bridge.openExternal).toHaveBeenCalledWith(
      "https://github.com/owner/repo/actions/runs/501/job/9001",
    );
    expect(jobDetails).toHaveAttribute("open");
  });

  it("selects the first active project by default", async () => {
    render(<GitHubActionsView onClose={() => {}} />);

    const trigger = await screen.findByRole("button", { name: "Project" });
    expect(trigger).toHaveTextContent(project.name);
    expect(trigger).toHaveClass("text-sm");
    expect(trigger).not.toHaveClass("font-mono");
    expect(trigger.querySelector(".lucide-monitor")).not.toBeNull();
    expect(bridge.ghListWorkflows).toHaveBeenCalledWith({
      projectLocation: project.location,
    });
  });

  it("shows project icons and the hosting machine in the trigger and menu", async () => {
    const mirrored: Project = {
      ...project,
      id: "remote:desktop-1:project:project-1",
      remoteServerId: "desktop-1",
      remoteId: project.id,
      location: { ...project.location, remoteServerId: "desktop-1" },
    };
    useRemoteServersStore.setState({
      servers: [{ desktopId: "desktop-1", label: "Poracode on MacBook 16" }],
      runtime: { "desktop-1": { status: "online", projects: [], threads: [] } },
    } as never);
    useAppStore.setState({ projects: [project, mirrored] });

    render(<GitHubActionsView projectId={mirrored.id} onClose={() => {}} />);

    const trigger = await screen.findByRole("button", { name: "Project" });
    expect(trigger).toHaveTextContent("PoracodeMacBook 16");
    expect(trigger.querySelector(".lucide-server")).not.toBeNull();
    expect(trigger.parentElement).not.toHaveClass("px-2");

    fireEvent.click(trigger);
    const remoteRow = await screen.findByRole("menuitemradio", { name: /MacBook 16/ });
    expect(remoteRow).toHaveTextContent("MacBook 16");
    expect(remoteRow.querySelector(".lucide-server")).not.toBeNull();
    expect(document.querySelector('[class~="min-w-[--trigger-width]"]')).toBeInTheDocument();
  });

  it("selects the first pinned workflow by default", async () => {
    bridge.ghListWorkflows.mockResolvedValue({
      workflows: [
        { id: 11, name: "CI", path: ".github/workflows/ci.yml", state: "active" },
        { id: 22, name: "Zulu", path: ".github/workflows/zulu.yml", state: "active" },
        { id: 33, name: "Alpha", path: ".github/workflows/alpha.yml", state: "active" },
      ],
    });
    bridge.ghListWorkflowRuns.mockResolvedValue({ runs: [] });
    bridge.ghGetWorkflowDefinition.mockImplementation(async ({ workflowId }) => ({
      definition: { ...definition.definition, workflowId },
    }));
    useSidebarUiStore.setState({
      pinnedGitHubWorkflows: { [project.id]: [22, 33] },
    });

    render(<GitHubActionsView projectId={project.id} onClose={() => {}} />);

    expect(await screen.findByRole("heading", { name: "Alpha" })).toBeInTheDocument();
    // The runs fetch is kicked off by an effect after the selection commits, so
    // under CI load it can lag the heading by a tick.
    await waitFor(() =>
      expect(bridge.ghListWorkflowRuns).toHaveBeenCalledWith({
        projectLocation: project.location,
        workflowId: 33,
      }),
    );
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
    expect(screen.getByRole("button", { name: "Run" })).toBeInTheDocument();
    expect(screen.queryByText("Inputs (JSON)")).not.toBeInTheDocument();
  });

  it("opens dispatch controls after selecting another workflow from its run button", async () => {
    let resolveReleaseDefinition: ((result: GhGetWorkflowDefinitionResult) => void) | undefined;
    bridge.ghListWorkflows.mockResolvedValue({
      workflows: [
        { id: 11, name: "CI", path: ".github/workflows/ci.yml", state: "active" },
        { id: 22, name: "Release", path: ".github/workflows/release.yml", state: "active" },
      ],
    });
    bridge.ghGetWorkflowDefinition.mockImplementation(({ workflowId }) =>
      workflowId === 22
        ? new Promise((resolve) => {
            resolveReleaseDefinition = resolve;
          })
        : Promise.resolve({
            definition: { ...definition.definition, workflowId },
          }),
    );

    render(<GitHubActionsView projectId={project.id} onClose={() => {}} />);
    const releaseWorkflowButton = (await screen.findByText("Release")).closest("button");
    expect(releaseWorkflowButton).not.toBeNull();
    const releaseWorkflowRow = releaseWorkflowButton!.parentElement;
    expect(releaseWorkflowRow).not.toBeNull();

    fireEvent.click(
      within(releaseWorkflowRow!).getByRole("button", {
        name: "Run workflow",
      }),
    );

    expect(await screen.findByText("Run Release")).toBeInTheDocument();
    expect(screen.getByText("Loading workflow inputs")).toBeInTheDocument();
    await waitFor(() => expect(resolveReleaseDefinition).toBeDefined());
    await act(async () => {
      resolveReleaseDefinition!({
        definition: { ...definition.definition, workflowId: 22 },
      });
    });

    expect(await screen.findByText("Release channel")).toBeInTheDocument();
    expect(bridge.ghGetWorkflowDefinition).toHaveBeenCalledWith({
      projectLocation: project.location,
      workflowId: 22,
    });
  });

  it("shows non-dispatchable state only after the workflow definition loads", async () => {
    let resolveDefinition: ((result: GhGetWorkflowDefinitionResult) => void) | undefined;
    bridge.ghGetWorkflowDefinition.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDefinition = resolve;
        }),
    );

    render(<GitHubActionsView projectId={project.id} onClose={() => {}} />);
    await waitFor(() => expect(bridge.ghGetWorkflowDefinition).toHaveBeenCalled());

    expect(screen.queryByText("This workflow cannot be started manually.")).not.toBeInTheDocument();
    await act(async () => {
      resolveDefinition!({
        definition: {
          ...definition.definition,
          dispatchable: false,
          triggers: ["push"],
          inputs: [],
        },
      });
    });

    expect(
      await screen.findByText("This workflow cannot be started manually."),
    ).toBeInTheDocument();
  });

  it("keeps cached workflow runs visible while refreshing in the background", async () => {
    useAppStore.setState({
      projects: [{ ...project, ghAccount: { host: "github.com", login: "octocat" } }],
    });
    const ciRun = { ...run, title: "Cached CI run" };
    const releaseRun = {
      ...run,
      id: 502,
      workflowId: 22,
      workflowName: "Release",
      name: "Release",
      title: "Release run",
    };
    let ciRequestCount = 0;
    let resolveCiRefresh: ((result: GhListWorkflowRunsResult) => void) | undefined;
    let ciDefinitionRequestCount = 0;
    let resolveCiDefinitionRefresh: ((result: GhGetWorkflowDefinitionResult) => void) | undefined;
    bridge.ghListWorkflows.mockResolvedValue({
      workflows: [
        { id: 11, name: "CI", path: ".github/workflows/ci.yml", state: "active" },
        { id: 22, name: "Release", path: ".github/workflows/release.yml", state: "active" },
      ],
    });
    bridge.ghListWorkflowRuns.mockImplementation(({ workflowId }) => {
      if (workflowId === 22) return Promise.resolve({ runs: [releaseRun] });
      ciRequestCount += 1;
      if (ciRequestCount === 1) return Promise.resolve({ runs: [ciRun] });
      return new Promise((resolve) => {
        resolveCiRefresh = resolve;
      });
    });
    bridge.ghGetWorkflowDefinition.mockImplementation(({ workflowId }) => {
      if (workflowId !== 11 || ciDefinitionRequestCount++ === 0) {
        return Promise.resolve({
          definition: { ...definition.definition, workflowId },
        });
      }
      return new Promise((resolve) => {
        resolveCiDefinitionRefresh = resolve;
      });
    });

    render(<GitHubActionsView projectId={project.id} onClose={() => {}} />);
    expect(await screen.findByText("Cached CI run")).toBeInTheDocument();

    fireEvent.click((await screen.findByText("Release")).closest("button")!);
    expect(await screen.findByText("Release run")).toBeInTheDocument();

    const ciWorkflowButton = screen
      .getAllByText("CI")
      .map((element) => element.closest("button"))
      .find((button) => button !== null);
    fireEvent.click(ciWorkflowButton!);

    expect(screen.getByText("Cached CI run")).toBeInTheDocument();
    const ciHeader = screen.getByRole("heading", { name: "CI" }).closest("header");
    const cachedRunButton = within(ciHeader!)
      .getAllByRole("button", { name: "Run workflow" })
      .find((element) => element.tagName === "BUTTON");
    expect(cachedRunButton).toBeEnabled();
    await waitFor(() => {
      expect(resolveCiRefresh).toBeDefined();
      expect(resolveCiDefinitionRefresh).toBeDefined();
    });
    await act(async () => {
      resolveCiRefresh!({ runs: [{ ...ciRun, title: "Refreshed CI run" }] });
      resolveCiDefinitionRefresh!({
        definition: { ...definition.definition, workflowId: 11 },
      });
    });
    expect(await screen.findByText("Refreshed CI run")).toBeInTheDocument();
  });

  it("renders workflows and runs from cache on the first frame after reopening", async () => {
    useAppStore.setState({
      projects: [{ ...project, ghAccount: { host: "github.com", login: "octocat" } }],
    });
    const { unmount } = render(<GitHubActionsView projectId={project.id} onClose={() => {}} />);
    expect(await screen.findByText(run.title)).toBeInTheDocument();

    // Closing the overlay unmounts the view; the caches must outlive it.
    unmount();

    let resolveWorkflows: ((result: GhListWorkflowsResult) => void) | undefined;
    bridge.ghListWorkflows.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveWorkflows = resolve;
        }),
    );

    render(<GitHubActionsView projectId={project.id} onClose={() => {}} />);

    // Synchronous — no findBy, no awaited fetch: the sidebar and run list are
    // painted from cache while the refetch is still pending.
    expect(screen.getByRole("heading", { name: "CI" })).toBeInTheDocument();
    expect(screen.getByText(run.title)).toBeInTheDocument();
    expect(resolveWorkflows).toBeDefined();

    await act(async () => {
      resolveWorkflows!({
        workflows: [{ id: 11, name: "CI", path: ".github/workflows/ci.yml", state: "active" }],
      });
    });
    expect(screen.getByText(run.title)).toBeInTheDocument();
  });

  it("drops the cached seed once its TTL lapses", async () => {
    useAppStore.setState({
      projects: [{ ...project, ghAccount: { host: "github.com", login: "octocat" } }],
    });
    const { unmount } = render(<GitHubActionsView projectId={project.id} onClose={() => {}} />);
    expect(await screen.findByText(run.title)).toBeInTheDocument();
    unmount();

    // Runs expire after a minute; the workflow list lasts ten.
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 2 * 60_000);

    let resolveWorkflows: ((result: GhListWorkflowsResult) => void) | undefined;
    bridge.ghListWorkflows.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveWorkflows = resolve;
        }),
    );

    render(<GitHubActionsView projectId={project.id} onClose={() => {}} />);

    // Sidebar still seeds from the workflow cache, but the stale run is gone.
    expect(screen.getByRole("heading", { name: "CI" })).toBeInTheDocument();
    expect(screen.queryByText(run.title)).not.toBeInTheDocument();

    await act(async () => {
      resolveWorkflows!({
        workflows: [{ id: 11, name: "CI", path: ".github/workflows/ci.yml", state: "active" }],
      });
    });
    expect(await screen.findByText(run.title)).toBeInTheDocument();
    vi.mocked(Date.now).mockRestore();
  });

  it("re-applies the pinned default after reopening with a cached list", async () => {
    bridge.ghListWorkflows.mockResolvedValue({
      workflows: [
        { id: 11, name: "CI", path: ".github/workflows/ci.yml", state: "active" },
        { id: 33, name: "Alpha", path: ".github/workflows/alpha.yml", state: "active" },
      ],
    });
    bridge.ghListWorkflowRuns.mockResolvedValue({ runs: [] });
    bridge.ghGetWorkflowDefinition.mockImplementation(async ({ workflowId }) => ({
      definition: { ...definition.definition, workflowId },
    }));

    const { unmount } = render(<GitHubActionsView projectId={project.id} onClose={() => {}} />);
    expect(await screen.findByRole("heading", { name: "CI" })).toBeInTheDocument();
    unmount();

    // Pinned while the overlay was closed — the cache seed must not pin the
    // stale selection in place once the fresh list arrives.
    useSidebarUiStore.setState({ pinnedGitHubWorkflows: { [project.id]: [33] } });

    render(<GitHubActionsView projectId={project.id} onClose={() => {}} />);

    expect(await screen.findByRole("heading", { name: "Alpha" })).toBeInTheDocument();
  });

  it("does not expand or count jobs without steps", async () => {
    bridge.ghGetWorkflowRun.mockResolvedValue({
      run: {
        ...run,
        jobs: [
          {
            id: 9002,
            name: "cleanup",
            status: "completed",
            conclusion: "skipped",
            steps: [],
          },
        ],
      },
    });

    render(<GitHubActionsView projectId={project.id} runId={run.id} onClose={() => {}} />);

    const jobName = await screen.findByText("cleanup");
    expect(jobName.closest("summary")).toBeNull();
    expect(screen.queryByText("0 of 0 steps")).not.toBeInTheDocument();
  });

  it("groups failed-run rerun choices in a split button", async () => {
    bridge.ghGetWorkflowRun.mockResolvedValue({
      run: {
        ...run,
        status: "completed",
        conclusion: "failure",
        jobs: [],
      },
    });

    render(<GitHubActionsView projectId={project.id} runId={run.id} onClose={() => {}} />);

    const heading = await screen.findByRole("heading", { name: run.title });
    const detail = heading.closest("section");
    expect(detail).not.toBeNull();
    expect(within(detail!).getByRole("button", { name: "Re-run all jobs" })).toBeInTheDocument();
    expect(
      within(detail!).queryByRole("button", { name: "Re-run failed jobs" }),
    ).not.toBeInTheDocument();

    fireEvent.click(within(detail!).getByRole("button", { name: "Run actions" }));
    expect(screen.queryByRole("menuitem", { name: "Re-run all jobs" })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Re-run failed jobs" }));

    await waitFor(() =>
      expect(bridge.ghRerunWorkflowRun).toHaveBeenCalledWith({
        projectLocation: project.location,
        runId: run.id,
        failedOnly: true,
      }),
    );
  });

  it("cancels an active workflow run", async () => {
    render(<GitHubActionsView projectId={project.id} runId={run.id} onClose={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: "Cancel workflow" }));

    await waitFor(() =>
      expect(bridge.ghCancelWorkflowRun).toHaveBeenCalledWith({
        projectLocation: project.location,
        runId: run.id,
      }),
    );
  });

  it("clears account-scoped Actions data before the next account responds", async () => {
    const firstAccount = { host: "github.com", login: "first" };
    const secondAccount = { host: "github.com", login: "second" };
    useAppStore.setState({ projects: [{ ...project, ghAccount: firstAccount }] });
    bridge.ghListAccounts.mockResolvedValue({
      accounts: [
        { ...firstAccount, active: true },
        { ...secondAccount, active: false },
      ],
    });
    let resolveSecondWorkflows: ((result: GhListWorkflowsResult) => void) | undefined;
    bridge.ghListWorkflows.mockImplementation(({ ghAccount }) =>
      ghAccount?.login === firstAccount.login
        ? Promise.resolve({
            workflows: [{ id: 11, name: "CI", path: ".github/workflows/ci.yml", state: "active" }],
          })
        : new Promise((resolve) => {
            resolveSecondWorkflows = resolve;
          }),
    );

    render(<GitHubActionsView projectId={project.id} runId={run.id} onClose={() => {}} />);
    expect(await screen.findByRole("heading", { name: run.title })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "GitHub account" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /second/ }));

    expect(screen.queryByRole("heading", { name: "CI" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: run.title })).not.toBeInTheDocument();
    expect(resolveSecondWorkflows).toBeDefined();

    await act(async () => {
      resolveSecondWorkflows!({
        workflows: [
          { id: 22, name: "Deploy", path: ".github/workflows/deploy.yml", state: "active" },
        ],
      });
    });
    expect(await screen.findByRole("heading", { name: "Deploy" })).toBeInTheDocument();
  });

  it("hides the account selector when fewer than two accounts are signed in", async () => {
    render(<GitHubActionsView projectId={project.id} onClose={() => {}} />);

    expect(await screen.findByRole("button", { name: "Project" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "GitHub account" })).not.toBeInTheDocument();
  });

  it("keeps a persisted account override visible and clearable when discovery returns none", async () => {
    useAppStore.setState({
      projects: [{ ...project, ghAccount: { host: "github.com", login: "signed-out" } }],
    });

    render(<GitHubActionsView projectId={project.id} onClose={() => {}} />);

    const trigger = await screen.findByRole("button", { name: "GitHub account" });
    expect(trigger).toHaveTextContent("signed-out");
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Auto/ }));

    await waitFor(() => expect(useAppStore.getState().projects[0]?.ghAccount).toBeUndefined());
  });

  it("distinguishes the same login on different GitHub hosts", async () => {
    bridge.ghListAccounts.mockResolvedValue({
      accounts: [
        { host: "github.com", login: "octocat", active: true },
        { host: "ghe.example.com", login: "octocat", active: false },
      ],
    });

    render(<GitHubActionsView projectId={project.id} onClose={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: "GitHub account" }));
    fireEvent.click(
      await screen.findByRole("menuitemradio", { name: /octocat ghe\.example\.com/ }),
    );

    await waitFor(() =>
      expect(useAppStore.getState().projects[0]?.ghAccount).toEqual({
        host: "ghe.example.com",
        login: "octocat",
      }),
    );
  });

  it("scopes Actions calls to the account picked in the selector", async () => {
    const accounts = [
      { host: "github.com", login: "SDSLeon", active: true },
      { host: "github.com", login: "ym-svecherenko", active: false },
    ];
    bridge.ghListAccounts.mockResolvedValue({ accounts });

    render(<GitHubActionsView projectId={project.id} onClose={() => {}} />);

    const trigger = await screen.findByRole("button", { name: "GitHub account" });
    expect(trigger).toHaveTextContent("Auto");

    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /ym-svecherenko/ }));

    await waitFor(() =>
      expect(bridge.ghListWorkflows).toHaveBeenCalledWith({
        projectLocation: project.location,
        ghAccount: { host: "github.com", login: "ym-svecherenko" },
      }),
    );
    expect(useAppStore.getState().projects[0]?.ghAccount).toEqual({
      host: "github.com",
      login: "ym-svecherenko",
    });

    fireEvent.click(await screen.findByRole("button", { name: "GitHub account" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Auto/ }));

    await waitFor(() => {
      expect(useAppStore.getState().projects[0]?.ghAccount).toBeUndefined();
    });
    await waitFor(() =>
      expect(bridge.ghListWorkflows).toHaveBeenLastCalledWith({
        projectLocation: project.location,
      }),
    );
  });
});
