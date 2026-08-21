import {
  Children,
  isValidElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { AgentStatus, Project } from "@/shared/contracts";
import { HOME_PROJECT_ID, HOME_PROJECT_NAME } from "@/shared/homeScope";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";

const { composerSpy, launchExperimentMock } = vi.hoisted(() => ({
  composerSpy: vi.fn<(props: unknown) => void>(),
  launchExperimentMock: vi.fn<(input: unknown) => Promise<string | null>>(),
}));

vi.mock("./ThreadComposer", () => ({
  ThreadComposer: (props: {
    controls: unknown[];
    onPromptChange: (value: string) => void;
    onSubmit: () => void;
  }) => {
    composerSpy(props);
    return (
      <div>
        <button type="button" onClick={() => props.onPromptChange("hello world")}>
          set-prompt
        </button>
        <button type="button" onClick={props.onSubmit}>
          submit
        </button>
      </div>
    );
  },
}));

vi.mock("@/renderer/actions/experimentActions", () => ({
  launchExperiment: launchExperimentMock,
}));

import "@/renderer/components/providers/bootstrap";
import { ThreadDraftView } from "./ThreadDraftView";

const project: Project = {
  id: "project-1",
  name: "Repo",
  location: {
    kind: "windows",
    path: "C:\\repo",
  },
  createdAt: "2026-03-28T00:00:00.000Z",
};

const legacyCodexProject: Project = {
  ...project,
  lastDraftConfig: {
    agentKind: "codex",
    model: "gpt-5.4",
    effort: "high",
    mode: "agent",
    approvalPolicy: "on-request",
    approvalsReviewer: "auto_review",
    sandboxMode: "workspace-write",
  },
};

const remoteProject: Project = {
  ...project,
  id: "remote-project",
  remoteServerId: "desktop-1",
  remoteId: "project-1",
};

const wslProject: Project = {
  id: "project-wsl",
  name: "Repo WSL",
  location: {
    kind: "wsl",
    distro: "Ubuntu",
    linuxPath: "/home/demo/repo",
    uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\repo",
  },
  createdAt: "2026-03-28T00:00:00.000Z",
};

const homeProject: Project = {
  id: HOME_PROJECT_ID,
  name: HOME_PROJECT_NAME,
  location: {
    kind: "windows",
    path: "C:\\Users\\demo",
  },
  disabled: true,
  createdAt: "2026-03-28T00:00:00.000Z",
};

const codexStatus: AgentStatus = {
  kind: "codex",
  label: "Codex",
  installed: true,
  authState: "authenticated",
  capabilities: {
    models: [
      { id: "gpt-5.4", label: "5.4" },
      { id: "gpt-5.4-mini", label: "5.4 Mini" },
    ],
    efforts: ["low", "medium", "high", "xhigh"],
    defaultEffort: "high",
    modelEfforts: {},
    modes: ["agent", "plan"],
    approvalPolicies: [
      { id: "on-request", label: "On Request" },
      { id: "never", label: "Full Access" },
      { id: "untrusted", label: "Untrusted" },
    ],
    sandboxModes: [
      { id: "workspace-write", label: "Workspace Write" },
      { id: "read-only", label: "Read Only" },
      { id: "danger-full-access", label: "Full Access" },
    ],
    defaultApprovalPolicy: "on-request",
    defaultApprovalsReviewer: "auto_review",
    defaultSandboxMode: "workspace-write",
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "server",
    presentationMode: "terminal",
    settingDefs: [],
  },
};

const rememberedCodexStatus: AgentStatus = {
  ...codexStatus,
  capabilities: {
    ...codexStatus.capabilities,
    models: [
      { id: "gpt-5.6-luna", label: "Luna" },
      { id: "gpt-5.6-sol", label: "Sol" },
    ],
    efforts: ["low", "medium", "high", "max"],
    modelEfforts: {
      "gpt-5.6-luna": ["low", "medium", "high", "max"],
      "gpt-5.6-sol": ["low", "medium", "high"],
    },
    fastModels: ["gpt-5.6-luna", "gpt-5.6-sol"],
  },
};

const dualModeCodexStatus: AgentStatus = {
  ...codexStatus,
  capabilities: {
    ...codexStatus.capabilities,
    presentationModes: ["terminal", "gui"],
  },
};

const contextualCodexStatus: AgentStatus = {
  ...dualModeCodexStatus,
  capabilities: {
    ...dualModeCodexStatus.capabilities,
    contextSizes: [
      { id: "272k", label: "272k" },
      { id: "400k", label: "400k" },
      { id: "1m", label: "1M" },
    ],
    modelContextSizes: {
      "gpt-5.4": ["272k", "400k", "1m"],
    },
    defaultContextSize: "272k",
  },
};

const geminiStatus: AgentStatus = {
  kind: "gemini",
  label: "Gemini",
  installed: true,
  authState: "authenticated",
  capabilities: {
    models: [
      { id: "auto", label: "Auto" },
      { id: "gemini-2.5-flash", label: "2.5 Flash" },
    ],
    efforts: [],
    modelEfforts: {},
    modes: ["agent", "plan"],
    approvalPolicies: [
      { id: "default", label: "Default" },
      { id: "auto_edit", label: "Auto Edit" },
      { id: "never", label: "Full Access" },
    ],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "terminal",
    presentationMode: "terminal",
    defaultApprovalPolicy: "never",
    settingDefs: [],
  },
};

const antigravityStatus: AgentStatus = {
  kind: "antigravity",
  label: "Antigravity",
  installed: true,
  authState: "authenticated",
  capabilities: {
    models: [{ id: "auto", label: "Auto" }],
    efforts: [],
    modelEfforts: {},
    modes: [],
    approvalPolicies: [
      { id: "default", label: "Default" },
      { id: "yolo", label: "Bypass Permissions" },
    ],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "terminal",
    presentationMode: "terminal",
    presentationModes: ["terminal"],
    bypassPermissions: { approvalPolicy: "yolo" },
    settingDefs: [],
  },
};

const commandCodeStatus: AgentStatus = {
  kind: "commandcode",
  label: "Command Code",
  installed: true,
  authState: "authenticated",
  capabilities: {
    models: [
      { id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash" },
      { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
    ],
    efforts: [],
    defaultEffort: "high",
    modelEfforts: {
      "deepseek/deepseek-v4-flash": ["high", "max"],
      "gpt-5.4-mini": ["low", "medium", "high"],
    },
    modes: ["agent", "plan"],
    approvalPolicies: [{ id: "yolo", label: "Bypass Permissions" }],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "terminal",
    presentationMode: "terminal",
    presentationModes: ["terminal"],
    defaultApprovalPolicy: "yolo",
    settingDefs: [],
  },
};

const claudeStatus: AgentStatus = {
  kind: "claude",
  label: "Claude",
  installed: true,
  authState: "authenticated",
  capabilities: {
    models: [
      { id: "claude-sonnet-4-7", label: "Sonnet 4.7" },
      { id: "claude-opus-4-7", label: "Opus 4.7" },
    ],
    efforts: [],
    modelEfforts: {},
    modes: ["agent", "plan"],
    approvalPolicies: [
      { id: "default", label: "Default" },
      { id: "auto", label: "Auto mode" },
    ],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "terminal",
    presentationMode: "terminal",
    defaultApprovalPolicy: "auto",
    bypassPermissions: { approvalPolicy: "auto" },
    settingDefs: [],
  },
};

const cursorStatus: AgentStatus = {
  kind: "cursor",
  label: "Cursor",
  installed: true,
  authState: "authenticated",
  capabilities: {
    models: [
      { id: "composer-2", label: "Composer 2" },
      { id: "gpt-5.5", label: "GPT-5.5" },
    ],
    efforts: ["low", "high"],
    modelEfforts: { "composer-2": [], "gpt-5.5": ["low", "high"] },
    contextSizes: [
      { id: "272k", label: "272K" },
      { id: "1m", label: "1M" },
    ],
    modelContextSizes: {
      "gpt-5.5": ["272k", "1m"],
    },
    fastModels: ["composer-2", "gpt-5.5"],
    thinkingModels: ["gpt-5.5"],
    modes: ["agent", "plan"],
    approvalPolicies: [{ id: "default", label: "Default" }],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "terminal",
    presentationMode: "terminal",
    presentationModes: ["terminal", "gui"],
    settingDefs: [],
  },
};

const acpGenericStatus: AgentStatus = {
  kind: "acp-generic:example-agent",
  label: "Example Agent",
  installed: true,
  authState: "authenticated",
  capabilities: {
    models: [{ id: "model-a", label: "Model A" }],
    efforts: [],
    modelEfforts: {},
    modes: ["agent"],
    approvalPolicies: [
      { id: "default", label: "Supervised" },
      { id: "never", label: "Auto Approve" },
    ],
    defaultApprovalPolicy: "never",
    sandboxModes: [],
    supportsResume: false,
    supportsDirectInput: true,
    liveInputMode: "server",
    presentationMode: "gui",
    presentationModes: ["gui"],
    settingDefs: [],
  },
};

function StoreBackedThreadDraftView(props: {
  onStart: ComponentProps<typeof ThreadDraftView>["onStart"];
}) {
  const storedProject = useAppStore((state) =>
    state.projects.find((candidate) => candidate.id === project.id),
  );
  if (!storedProject) return null;
  return (
    <ThreadDraftView
      project={storedProject}
      agentStatuses={[contextualCodexStatus]}
      {...(storedProject.lastDraftConfig ? { lastDraftConfig: storedProject.lastDraftConfig } : {})}
      onStart={props.onStart}
    />
  );
}

function classNameIncludes(element: HTMLElement, value: string): boolean {
  return typeof element.className === "string" && element.className.includes(value);
}

function collectElementTypeNames(node: ReactNode): string[] {
  const names: string[] = [];
  Children.forEach(node, (child) => {
    if (!isValidElement(child)) return;
    const type = child.type;
    if (typeof type === "function" && type.name) names.push(type.name);
    const props = child.props as { children?: ReactNode };
    if (props.children !== undefined) names.push(...collectElementTypeNames(props.children));
  });
  return names;
}

function findElementByTypeName(
  node: ReactNode,
  name: string,
): ReactElement<Record<string, unknown>> | undefined {
  let match: ReactElement<Record<string, unknown>> | undefined;
  Children.forEach(node, (child) => {
    if (match || !isValidElement(child)) return;
    const type = child.type;
    if (typeof type === "function" && type.name === name) {
      match = child as ReactElement<Record<string, unknown>>;
      return;
    }
    const props = child.props as { children?: ReactNode };
    match = findElementByTypeName(props.children, name);
  });
  return match;
}

function installDraftComposerLayoutMetrics(): () => void {
  const originalClientHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientHeight",
  );
  const originalOffsetHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "offsetHeight",
  );
  const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return classNameIncludes(this, "max-w-[1040px]") ? 800 : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() {
      if (classNameIncludes(this, "max-w-[720px]")) return 160;
      return Number.parseInt(this.style.height, 10) || 0;
    },
  });
  HTMLElement.prototype.getBoundingClientRect = function () {
    return {
      x: 0,
      y: 0,
      top: 0,
      right: 720,
      bottom: 0,
      left: 0,
      width: 720,
      height: 0,
      toJSON: () => ({}),
    } as DOMRect;
  };

  return () => {
    if (originalClientHeight) {
      Object.defineProperty(HTMLElement.prototype, "clientHeight", originalClientHeight);
    }
    if (originalOffsetHeight) {
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalOffsetHeight);
    }
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  };
}

const singleContextThinkingCursorStatus: AgentStatus = {
  ...cursorStatus,
  capabilities: {
    ...cursorStatus.capabilities,
    models: [{ id: "claude-4.5-sonnet", label: "Sonnet 4.5" }],
    efforts: [],
    modelEfforts: { "claude-4.5-sonnet": [] },
    contextSizes: [{ id: "200k", label: "200K" }],
    modelContextSizes: {
      "claude-4.5-sonnet": ["200k"],
    },
    fastModels: [],
    thinkingModels: ["claude-4.5-sonnet"],
  },
};

const singleEffortMultiContextCursorStatus: AgentStatus = {
  ...cursorStatus,
  capabilities: {
    ...cursorStatus.capabilities,
    models: [{ id: "claude-4.6-sonnet", label: "Sonnet 4.6" }],
    efforts: ["medium"],
    modelEfforts: { "claude-4.6-sonnet": ["medium"] },
    contextSizes: [
      { id: "200k", label: "200K" },
      { id: "1m", label: "1M" },
    ],
    modelContextSizes: {
      "claude-4.6-sonnet": ["200k", "1m"],
    },
    fastModels: [],
    thinkingModels: ["claude-4.6-sonnet"],
  },
};

describe("ThreadDraftView", () => {
  beforeEach(() => {
    composerSpy.mockClear();
    launchExperimentMock.mockReset();
    launchExperimentMock.mockResolvedValue("experiment-1");
    delete (window as unknown as { poracode?: unknown }).poracode;
    useAgentStatusesStore.setState({
      agentStatuses: [],
      wslAgentStatuses: [],
      windowsLoaded: false,
      wslLoaded: false,
      inFirstLaunchDiscovery: false,
      discoveryScope: undefined,
      discoveredAgents: [],
    });
    useSharedSettings.setState({
      providerConfigs: {},
      providerModelPreferences: {},
      hiddenModels: {},
      disabledAgents: [],
      lastPresentationModeByAgent: {},
      enabledMcpServers: {},
      disabledBuiltInMcpServers: {},
      sharedSettingsHydrated: true,
    });
    useAppStore.setState({ pendingDraftWorktreeSelections: {} });
    useRemoteServersStore.setState({ servers: [], runtime: {}, hostUpdates: {} });
  });

  it("adds experiment candidates without a prompt and keeps the composer submit button", () => {
    useGitStore.setState({
      statuses: {
        [project.id]: {
          isRepo: true,
          branch: "main",
          tracking: "origin/main",
          hasRemote: true,
          remoteInfo: null,
          ahead: 0,
          behind: 0,
          staged: [],
          unstaged: [],
          totalInsertions: 0,
          totalDeletions: 0,
        },
      },
    });
    render(<ThreadDraftView project={project} agentStatuses={[codexStatus]} onStart={() => {}} />);

    const initialComposer = composerSpy.mock.lastCall?.[0] as {
      afterControls: ReactElement<{
        experiment?: { onToggle: (enabled: boolean) => void };
      }>;
    };
    act(() => initialComposer.afterControls.props.experiment?.onToggle(true));

    let composer = composerSpy.mock.lastCall?.[0] as {
      fixedContent: ReactNode;
      submitContent?: ReactNode;
      submitDisabled: boolean;
      submitLabel: string;
    };
    expect(composer.submitLabel).toBe("Run experiment");
    expect(composer.submitContent).toBeUndefined();
    expect(screen.getByRole("button", { name: "Worktree mode" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Select branch" })).toBeEnabled();
    expect(screen.getByText("from")).toBeInTheDocument();

    let targets = findElementByTypeName(composer.fixedContent, "ExperimentDraftTargets");
    expect(targets?.props.isAddDisabled).toBe(false);
    if (!targets) throw new Error("Expected experiment targets");
    const addCandidate = targets.props.onAdd as () => void;
    act(addCandidate);

    composer = composerSpy.mock.lastCall?.[0] as typeof composer;
    targets = findElementByTypeName(composer.fixedContent, "ExperimentDraftTargets");
    expect(targets?.props.candidates).toHaveLength(1);
    expect(targets?.props.isAddDisabled).toBe(false);
    expect(composer.submitDisabled).toBe(true);
  });

  it("renders the quick-composer surface with new-thread project and worktree controls", () => {
    useGitStore.setState({
      statuses: {
        [project.id]: {
          isRepo: true,
          branch: "main",
          tracking: "origin/main",
          hasRemote: true,
          remoteInfo: null,
          ahead: 0,
          behind: 0,
          staged: [],
          unstaged: [],
          totalInsertions: 0,
          totalDeletions: 0,
        },
      },
    });
    const { container } = render(
      <ThreadDraftView
        project={project}
        agentStatuses={[codexStatus]}
        quickComposer
        composerPlaceholder="Ask Repo anything about this workspace"
        paneCount={1}
        onStart={() => {}}
      />,
    );

    const props = composerSpy.mock.lastCall?.[0] as {
      compact?: boolean;
      placeholder?: string;
    };
    expect(props.compact).toBe(true);
    expect(props.placeholder).toBe("Ask Repo anything about this workspace");
    expect(container.querySelector(".quick-composer-control-surface")).toBeInTheDocument();
    expect(container.querySelector("[data-draft-controls]")).toBeInTheDocument();
    expect(container.querySelector("[data-draft-worktree-row]")).toBeInTheDocument();
  });

  it("defaults a new worktree to the tracking branch when local is in sync", () => {
    useGitStore.setState({
      statuses: {
        [project.id]: {
          isRepo: true,
          branch: "main",
          tracking: "origin/main",
          hasRemote: true,
          remoteInfo: null,
          ahead: 0,
          behind: 0,
          staged: [],
          unstaged: [],
          totalInsertions: 0,
          totalDeletions: 0,
        },
      },
    });

    render(<ThreadDraftView project={project} agentStatuses={[codexStatus]} onStart={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Worktree mode" }));
    expect(screen.getByRole("button", { name: "Select branch" })).toHaveTextContent("origin/main");
  });

  it("keeps the origin worktree base after selecting the matching local branch", async () => {
    const onStart = vi.fn<(input: unknown) => void>();
    useGitStore.setState({
      statuses: {
        [project.id]: {
          isRepo: true,
          branch: "main",
          tracking: "origin/main",
          hasRemote: true,
          remoteInfo: null,
          ahead: 0,
          behind: 4,
          staged: [],
          unstaged: [],
          totalInsertions: 0,
          totalDeletions: 0,
        },
      },
      branches: {
        [project.id]: {
          current: "main",
          branches: [
            { name: "main", current: true, commit: "abc", isRemote: false },
            { name: "develop", current: false, commit: "ghi", isRemote: false },
            { name: "main", current: false, commit: "def", isRemote: true, remote: "origin" },
            { name: "develop", current: false, commit: "jkl", isRemote: true, remote: "origin" },
          ],
        },
      },
    });

    render(<ThreadDraftView project={project} agentStatuses={[codexStatus]} onStart={onStart} />);

    fireEvent.click(screen.getByRole("button", { name: "Worktree mode" }));
    expect(screen.getByRole("button", { name: "Select branch" })).toHaveTextContent("origin/main");

    fireEvent.click(screen.getByRole("button", { name: "Select branch" }));
    fireEvent.click(await screen.findByRole("option", { name: "develop" }));
    expect(screen.getByRole("button", { name: "Select branch" })).toHaveTextContent(
      "origin/develop",
    );

    fireEvent.click(screen.getByRole("button", { name: "Select branch" }));
    fireEvent.click(await screen.findByRole("option", { name: "main" }));
    expect(screen.getByRole("button", { name: "Select branch" })).toHaveTextContent("origin/main");

    fireEvent.click(screen.getByText("set-prompt"));
    fireEvent.click(screen.getByText("submit"));

    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        worktreeBaseBranch: "origin/main",
        worktreeIsNewBranch: true,
      }),
    );
  });

  it("defaults a new worktree to the tracking branch when the local branch is behind", () => {
    const onStart = vi.fn<(input: unknown) => void>();
    useGitStore.setState({
      statuses: {
        [project.id]: {
          isRepo: true,
          branch: "main",
          tracking: "origin/main",
          hasRemote: true,
          remoteInfo: null,
          ahead: 0,
          behind: 4,
          staged: [],
          unstaged: [],
          totalInsertions: 0,
          totalDeletions: 0,
        },
      },
    });

    render(<ThreadDraftView project={project} agentStatuses={[codexStatus]} onStart={onStart} />);

    fireEvent.click(screen.getByRole("button", { name: "Worktree mode" }));
    expect(screen.getByRole("button", { name: "Select branch" })).toHaveTextContent("origin/main");

    fireEvent.click(screen.getByText("set-prompt"));
    fireEvent.click(screen.getByText("submit"));

    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        worktreeBaseBranch: "origin/main",
        worktreeIsNewBranch: true,
      }),
    );
  });

  it("keeps the uncommitted-changes worktree option after selecting a tracking branch", async () => {
    const onStart = vi.fn<(input: unknown) => void>();
    useGitStore.setState({
      statuses: {
        [project.id]: {
          isRepo: true,
          branch: "main",
          tracking: "origin/main",
          hasRemote: true,
          remoteInfo: null,
          ahead: 0,
          behind: 4,
          staged: [],
          unstaged: [
            { path: "src/file.ts", status: "M", staged: false, insertions: 1, deletions: 0 },
          ],
          totalInsertions: 1,
          totalDeletions: 0,
        },
      },
    });

    render(<ThreadDraftView project={project} agentStatuses={[codexStatus]} onStart={onStart} />);

    fireEvent.click(screen.getByRole("button", { name: "Worktree mode" }));
    fireEvent.click(await screen.findByRole("option", { name: /Run in a separate worktree/ }));
    expect(screen.getByRole("button", { name: "Select branch" })).toHaveTextContent("origin/main");

    fireEvent.click(screen.getByRole("button", { name: "Worktree mode" }));
    fireEvent.click(await screen.findByRole("option", { name: /Worktree \+ changes/ }));
    expect(screen.getByRole("button", { name: "Select branch" })).toHaveTextContent("main");

    fireEvent.click(screen.getByText("set-prompt"));
    fireEvent.click(screen.getByText("submit"));

    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        worktreeBaseBranch: "main",
        worktreeIsNewBranch: true,
        worktreeTransferUncommitted: true,
      }),
    );
  });

  it("keeps the local checkout after selecting the branch in worktree + changes", async () => {
    const onStart = vi.fn<(input: unknown) => void>();
    useGitStore.setState({
      statuses: {
        [project.id]: {
          isRepo: true,
          branch: "main",
          tracking: "origin/main",
          hasRemote: true,
          remoteInfo: null,
          ahead: 0,
          behind: 4,
          staged: [],
          unstaged: [
            { path: "src/file.ts", status: "M", staged: false, insertions: 1, deletions: 0 },
          ],
          totalInsertions: 1,
          totalDeletions: 0,
        },
      },
      branches: {
        [project.id]: {
          current: "main",
          branches: [
            { name: "main", current: true, commit: "abc", isRemote: false },
            { name: "main", current: false, commit: "def", isRemote: true, remote: "origin" },
          ],
        },
      },
    });

    render(<ThreadDraftView project={project} agentStatuses={[codexStatus]} onStart={onStart} />);

    fireEvent.click(screen.getByRole("button", { name: "Worktree mode" }));
    fireEvent.click(await screen.findByRole("option", { name: /Worktree \+ changes/ }));
    expect(screen.getByRole("button", { name: "Select branch" })).toHaveTextContent("main");

    fireEvent.click(screen.getByRole("button", { name: "Select branch" }));
    const localMain = await screen.findByRole("option", { name: "main" });
    expect(localMain).toHaveAttribute("aria-selected", "true");
    fireEvent.click(localMain);
    fireEvent.keyDown(screen.getByPlaceholderText("Search branches..."), { key: "Escape" });
    expect(screen.getByRole("button", { name: "Select branch" })).toHaveTextContent("main");

    fireEvent.click(screen.getByText("set-prompt"));
    fireEvent.click(screen.getByText("submit"));

    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        worktreeBaseBranch: "main",
        worktreeIsNewBranch: true,
        worktreeTransferUncommitted: true,
      }),
    );
  });

  it("defaults experiment worktrees to the tracking branch when the local branch is behind", async () => {
    useGitStore.setState({
      statuses: {
        [project.id]: {
          isRepo: true,
          branch: "main",
          tracking: "origin/main",
          hasRemote: true,
          remoteInfo: null,
          ahead: 0,
          behind: 4,
          staged: [],
          unstaged: [],
          totalInsertions: 0,
          totalDeletions: 0,
        },
      },
    });
    render(<ThreadDraftView project={project} agentStatuses={[codexStatus]} onStart={() => {}} />);

    const initialComposer = composerSpy.mock.lastCall?.[0] as {
      afterControls: ReactElement<{ experiment?: { onToggle: (enabled: boolean) => void } }>;
    };
    act(() => initialComposer.afterControls.props.experiment?.onToggle(true));
    expect(screen.getByRole("button", { name: "Select branch" })).toHaveTextContent("origin/main");

    for (let index = 0; index < 2; index += 1) {
      const composer = composerSpy.mock.lastCall?.[0] as { fixedContent: ReactNode };
      const targets = findElementByTypeName(composer.fixedContent, "ExperimentDraftTargets");
      if (!targets) throw new Error("Expected experiment targets");
      act(targets.props.onAdd as () => void);
    }
    fireEvent.click(screen.getByText("set-prompt"));
    fireEvent.click(screen.getByText("submit"));

    await waitFor(() =>
      expect(launchExperimentMock).toHaveBeenCalledWith(
        expect.objectContaining({ baseBranch: "origin/main" }),
      ),
    );
  });

  it("reserves the worktree control row for Home drafts", () => {
    const { container } = render(
      <ThreadDraftView project={homeProject} agentStatuses={[codexStatus]} onStart={() => {}} />,
    );

    const worktreeRow = container.querySelector("[data-draft-worktree-row]");
    expect(worktreeRow).toBeEmptyDOMElement();
    expect(worktreeRow).toHaveClass("min-h-[1.625rem]");
    expect(screen.queryByRole("button", { name: "Worktree mode" })).not.toBeInTheDocument();
  });

  it("restores the selection replaced by a targeted worktree when the inline composer collapses", async () => {
    useGitStore.setState({
      statuses: {
        [project.id]: {
          isRepo: true,
          branch: "main",
          tracking: "origin/main",
          hasRemote: true,
          remoteInfo: null,
          ahead: 0,
          behind: 0,
          staged: [],
          unstaged: [],
          totalInsertions: 0,
          totalDeletions: 0,
        },
      },
    });
    useAppStore.getState().setPendingDraftWorktreeSelection(project.id, {
      branch: "poracode/calm-viper",
      baseBranch: "poracode/calm-viper",
      isWorktree: true,
      worktreePath: "C:\\repo-worktrees\\calm-viper",
    });

    const { rerender } = render(
      <ThreadDraftView
        project={project}
        agentStatuses={[codexStatus]}
        quickComposer
        restoreWorktreeSelectionToken={0}
        onStart={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Select branch" })).toHaveTextContent(
        "poracode/calm-viper",
      );
    });

    rerender(
      <ThreadDraftView
        project={project}
        agentStatuses={[codexStatus]}
        quickComposer
        restoreWorktreeSelectionToken={1}
        onStart={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Select branch" })).toHaveTextContent("main");
    });
  });

  afterEach(() => {
    delete (window as unknown as { poracode?: unknown }).poracode;
  });

  it("switches to the first installed agent when statuses resolve after mount", async () => {
    const onStart = vi.fn<(input: unknown) => void>();
    const { rerender } = render(
      <ThreadDraftView project={project} agentStatuses={[]} onStart={onStart} />,
    );

    expect(screen.getByText("No supported agents detected")).toBeInTheDocument();

    rerender(
      <ThreadDraftView project={project} agentStatuses={[geminiStatus]} onStart={onStart} />,
    );

    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as {
        controls: Array<{
          kind?: string;
          currentAgentKind?: string;
          currentModel?: string;
          value?: string;
        }>;
      };
      const providerModel = props.controls.find((c) => c.kind === "provider-model");
      expect(providerModel?.currentAgentKind).toBe("gemini");
      expect(providerModel?.currentModel).toBe("auto");
      expect(props.controls.some((control) => control.value === "never")).toBe(true);
    });
  });

  it("anchors the full draft composer after agents resolve on the initial mount", async () => {
    const restoreLayoutMetrics = installDraftComposerLayoutMetrics();
    const onStart = vi.fn<(input: unknown) => void>();

    try {
      const { container, rerender } = render(
        <ThreadDraftView project={project} agentStatuses={[]} onStart={onStart} />,
      );

      expect(container.querySelector("[data-draft-composer-anchor-spacer]")).toBeNull();

      rerender(
        <ThreadDraftView project={project} agentStatuses={[geminiStatus]} onStart={onStart} />,
      );

      await waitFor(() => expect(composerSpy).toHaveBeenCalled());

      const spacer = container.querySelector<HTMLElement>("[data-draft-composer-anchor-spacer]");
      expect(spacer?.style.height).toBe("320px");
    } finally {
      restoreLayoutMetrics();
    }
  });

  it("shows the detecting state while agents are still loading", () => {
    const onStart = vi.fn<(input: unknown) => void>();
    render(
      <ThreadDraftView project={project} agentStatuses={[]} isDetectingAgents onStart={onStart} />,
    );

    // While detection is in flight we suppress the "no agents installed"
    // message so the renderer doesn't flash it before the cache or detection
    // events hydrate the store.
    expect(screen.getByText(/detecting agents/i)).toBeInTheDocument();
    expect(screen.queryByText("No supported agents detected")).not.toBeInTheDocument();
  });

  it("shows the remote connection error instead of the missing-agent message", () => {
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "desktop-1",
          label: "Remote Mac",
          endpoint: "http://remote/",
          accessToken: "token",
          scopes: [],
        },
      ],
      runtime: {
        "desktop-1": { status: "error", projects: [], threads: [] },
      },
    });

    render(<ThreadDraftView project={remoteProject} agentStatuses={[]} onStart={() => {}} />);

    expect(screen.getByText("Connection error")).toBeInTheDocument();
    expect(screen.getByText(/remote server is offline/i)).toBeInTheDocument();
    expect(screen.queryByText("No supported agents detected")).not.toBeInTheDocument();
  });

  it("shows the discovery reveal for a WSL project while its distro is probing", () => {
    const onStart = vi.fn<(input: unknown) => void>();
    useAgentStatusesStore.getState().beginFirstLaunchDiscovery({ kind: "wsl", distro: "Ubuntu" });

    render(
      <ThreadDraftView
        project={wslProject}
        agentStatuses={[]}
        isDetectingAgents
        onStart={onStart}
      />,
    );

    expect(screen.getByText("Discovering coding agents…")).toBeInTheDocument();
    expect(screen.getByText(/Scanning Ubuntu/)).toBeInTheDocument();
    expect(screen.queryByText("No supported agents detected")).not.toBeInTheDocument();
  });

  it("keeps auth-missing agents selectable but blocks launching from the draft composer", () => {
    const onStart = vi.fn<(input: unknown) => void>();
    render(
      <ThreadDraftView
        project={project}
        agentStatuses={[{ ...codexStatus, authState: "missing", loginCommand: "codex login" }]}
        onStart={onStart}
      />,
    );

    const props = composerSpy.mock.lastCall?.[0] as {
      fixedContent?: unknown;
      submitDisabled?: boolean;
    };
    expect(props.fixedContent).toBeTruthy();
    expect(props.submitDisabled).toBe(true);

    fireEvent.click(screen.getByText("set-prompt"));
    fireEvent.click(screen.getByText("submit"));

    expect(onStart).not.toHaveBeenCalled();
  });

  it("does not mount desktop update or hook-install docks in remote drafts", () => {
    const onStart = vi.fn<(input: unknown) => void>();
    const statusWithVersion: AgentStatus = {
      ...codexStatus,
      version: "0.1.0",
    };

    render(
      <ThreadDraftView project={project} agentStatuses={[statusWithVersion]} onStart={onStart} />,
    );

    const desktopProps = composerSpy.mock.lastCall?.[0] as { fixedContent?: ReactNode };
    expect(collectElementTypeNames(desktopProps.fixedContent)).toEqual(
      expect.arrayContaining(["ThreadAgentUpdateDock", "HookInstallProposal"]),
    );

    composerSpy.mockClear();
    (window as unknown as { poracode?: unknown }).poracode = { appVersion: "remote" };

    render(
      <ThreadDraftView project={project} agentStatuses={[statusWithVersion]} onStart={onStart} />,
    );

    const remoteProps = composerSpy.mock.lastCall?.[0] as { fixedContent?: ReactNode };
    const remoteTypes = collectElementTypeNames(remoteProps.fixedContent);
    expect(remoteTypes).not.toContain("ThreadAgentUpdateDock");
    expect(remoteTypes).not.toContain("HookInstallProposal");
  });

  it("adds the remote host update line to a remote new-thread composer", () => {
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "desktop-1",
          label: "Remote Mac",
          endpoint: "http://remote/",
          accessToken: "token",
          scopes: ["projects:manage"],
          hostMode: "desktop",
        },
      ],
      runtime: {
        "desktop-1": { status: "online", projects: [], threads: [] },
      },
      hostUpdates: {
        "desktop-1": {
          currentVersion: "1.0.0",
          status: { type: "downloaded", version: "1.1.0" },
        },
      },
    });

    render(
      <ThreadDraftView project={remoteProject} agentStatuses={[codexStatus]} onStart={() => {}} />,
    );

    const composer = composerSpy.mock.lastCall?.[0] as { fixedContent?: ReactNode };
    expect(collectElementTypeNames(composer.fixedContent)).toContain("RemoteHostUpdateDock");
  });

  it("submits codex defaults on first launch", async () => {
    const onStart = vi.fn<(input: unknown) => void>();

    render(
      <ThreadDraftView project={project} agentStatuses={[dualModeCodexStatus]} onStart={onStart} />,
    );

    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as {
        controls: Array<{
          kind?: string;
          currentAgentKind?: string;
          currentModel?: string;
          effortValue?: string;
          value?: string;
          label?: string;
          isSelected?: boolean;
          options?: Array<{ id: string; label: string }>;
        }>;
      };
      const providerModel = props.controls.find((c) => c.kind === "provider-model");
      expect(providerModel?.currentAgentKind).toBe("codex");
      expect(providerModel?.currentModel).toBe("gpt-5.4");
      const effortContext = props.controls.find((c) => c.kind === "effort-context");
      expect(effortContext?.effortValue).toBe("high");
      const permission = props.controls.find((control) => control.value === "auto-review");
      expect(permission?.options?.some((option) => option.label === "Auto-review")).toBe(true);
    });

    fireEvent.click(screen.getByText("set-prompt"));
    fireEvent.click(screen.getByText("submit"));

    expect(onStart).toHaveBeenCalledWith({
      agentKind: "codex",
      config: {
        model: "gpt-5.4",
        effort: "high",
        mode: "agent",
        approvalPolicy: "on-request",
        approvalsReviewer: "auto_review",
        sandboxMode: "workspace-write",
      },
      presentationMode: "gui",
      prompt: "hello world",
    });
  });

  it("inherits the saved Codex context window when the project draft predates it", async () => {
    const onStart = vi.fn<(input: unknown) => void>();
    useSharedSettings.setState({ sharedSettingsHydrated: false, providerConfigs: {} });
    useAppStore.setState({ projects: [legacyCodexProject] });

    render(<StoreBackedThreadDraftView onStart={onStart} />);

    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as {
        controls: Array<{ kind?: string; contextValue?: string }>;
      };
      const effortContext = props.controls.find((control) => control.kind === "effort-context");
      expect(effortContext?.contextValue).toBe("272k");
    });

    const initialProps = composerSpy.mock.lastCall?.[0] as {
      controls: Array<{ kind?: string; onEffortChange?: (value: string) => void }>;
    };
    const initialEffortContext = initialProps.controls.find(
      (control) => control.kind === "effort-context",
    );
    act(() => initialEffortContext?.onEffortChange?.("xhigh"));

    act(() => {
      useSharedSettings.setState({
        providerConfigs: {
          codex: {
            model: "gpt-5.4",
            effort: "medium",
            contextSize: "400k",
            mode: "agent",
            approvalPolicy: "on-request",
            approvalsReviewer: "auto_review",
            sandboxMode: "workspace-write",
          },
        },
        sharedSettingsHydrated: true,
      });
    });

    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as {
        controls: Array<{ kind?: string; contextValue?: string; effortValue?: string }>;
      };
      const effortContext = props.controls.find((control) => control.kind === "effort-context");
      expect(effortContext?.contextValue).toBe("400k");
      expect(effortContext?.effortValue).toBe("xhigh");
    });

    fireEvent.click(screen.getByText("set-prompt"));
    fireEvent.click(screen.getByText("submit"));

    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ contextSize: "400k", effort: "xhigh" }),
      }),
    );
  });

  it("keeps an explicit Codex context choice made before settings hydrate", async () => {
    const onStart = vi.fn<(input: unknown) => void>();
    useSharedSettings.setState({ sharedSettingsHydrated: false, providerConfigs: {} });
    useAppStore.setState({ projects: [legacyCodexProject] });

    render(<StoreBackedThreadDraftView onStart={onStart} />);

    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as {
        controls: Array<{ kind?: string; contextValue?: string }>;
      };
      const effortContext = props.controls.find((control) => control.kind === "effort-context");
      expect(effortContext?.contextValue).toBe("272k");
    });

    const initialProps = composerSpy.mock.lastCall?.[0] as {
      controls: Array<{ kind?: string; onContextChange?: (value: string) => void }>;
    };
    const initialEffortContext = initialProps.controls.find(
      (control) => control.kind === "effort-context",
    );
    act(() => initialEffortContext?.onContextChange?.("1m"));

    act(() => {
      useSharedSettings.setState({
        providerConfigs: {
          codex: {
            model: "gpt-5.4",
            effort: "medium",
            contextSize: "400k",
            mode: "agent",
            approvalPolicy: "on-request",
            approvalsReviewer: "auto_review",
            sandboxMode: "workspace-write",
          },
        },
        sharedSettingsHydrated: true,
      });
    });

    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as {
        controls: Array<{ kind?: string; contextValue?: string }>;
      };
      const effortContext = props.controls.find((control) => control.kind === "effort-context");
      expect(effortContext?.contextValue).toBe("1m");
    });

    fireEvent.click(screen.getByText("set-prompt"));
    fireEvent.click(screen.getByText("submit"));

    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ contextSize: "1m" }),
      }),
    );
  });

  it("submits an explicit Fast-off selection in the launch config", async () => {
    const onStart = vi.fn<(input: unknown) => void>();
    useSharedSettings.setState({
      providerModelPreferences: { cursor: { "composer-2": { fast: false } } },
    });

    render(
      <ThreadDraftView
        project={project}
        agentStatuses={[cursorStatus]}
        lastDraftConfig={{
          agentKind: "cursor",
          model: "composer-2",
          effort: "",
          fast: false,
          mode: "agent",
          approvalPolicy: "default",
          sandboxMode: "",
          worktreeMode: false,
        }}
        onStart={onStart}
      />,
    );

    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as {
        controls: Array<{ kind?: string; currentModel?: string }>;
      };
      expect(
        props.controls.some(
          (control) => control.kind === "provider-model" && control.currentModel === "composer-2",
        ),
      ).toBe(true);
    });

    fireEvent.click(screen.getByText("set-prompt"));
    fireEvent.click(screen.getByText("submit"));

    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ fast: false }),
      }),
    );
  });

  it("keeps a globally disabled built-in out of the composer and launch config", async () => {
    const onStart = vi.fn<(input: unknown) => void>();
    useSharedSettings.setState({
      enabledMcpServers: { browser: true },
      disabledBuiltInMcpServers: { browser: true },
    });

    render(
      <ThreadDraftView project={project} agentStatuses={[dualModeCodexStatus]} onStart={onStart} />,
    );

    await waitFor(() => expect(composerSpy).toHaveBeenCalled());
    const props = composerSpy.mock.lastCall?.[0] as { afterControls?: ReactNode };
    expect(isValidElement(props.afterControls)).toBe(true);
    const mcpServers = (
      props.afterControls as ReactElement<{
        mcpServers: Array<{ descriptor: { id: string } }>;
      }>
    ).props.mcpServers;
    expect(mcpServers.some((server) => server.descriptor.id === "browser")).toBe(false);

    fireEvent.click(screen.getByText("set-prompt"));
    fireEvent.click(screen.getByText("submit"));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect((onStart.mock.lastCall![0] as { config: object }).config).not.toHaveProperty(
      "browserMcp",
    );
  });

  it("submits the Codex Ask for approval reviewer override", async () => {
    const onStart = vi.fn<(input: unknown) => void>();

    render(
      <ThreadDraftView project={project} agentStatuses={[dualModeCodexStatus]} onStart={onStart} />,
    );

    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as {
        controls: Array<{ value?: string; onChange?: (value: string) => void }>;
      };
      expect(props.controls.some((control) => control.value === "auto-review")).toBe(true);
    });

    const props = composerSpy.mock.lastCall?.[0] as {
      controls: Array<{ value?: string; onChange?: (value: string) => void }>;
    };
    const permission = props.controls.find((control) => control.value === "auto-review");
    act(() => {
      permission?.onChange?.("review-on-request");
    });

    await waitFor(() => {
      const nextProps = composerSpy.mock.lastCall?.[0] as {
        controls: Array<{ value?: string }>;
      };
      expect(nextProps.controls.some((control) => control.value === "review-on-request")).toBe(
        true,
      );
    });

    fireEvent.click(screen.getByText("set-prompt"));
    fireEvent.click(screen.getByText("submit"));

    expect(onStart).toHaveBeenCalledWith({
      agentKind: "codex",
      config: {
        model: "gpt-5.4",
        effort: "high",
        mode: "agent",
        approvalPolicy: "on-request",
        approvalsReviewer: "user",
        sandboxMode: "workspace-write",
      },
      presentationMode: "gui",
      prompt: "hello world",
    });
  });

  it("re-enables the composer when onStart rejects (e.g. worktree creation fails)", async () => {
    const onStart = vi.fn<(input: unknown) => void | Promise<void>>(() =>
      Promise.reject(new Error("worktree creation failed")),
    );

    render(
      <ThreadDraftView project={project} agentStatuses={[dualModeCodexStatus]} onStart={onStart} />,
    );

    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as { controls: Array<{ kind?: string }> };
      expect(props.controls.some((c) => c.kind === "provider-model")).toBe(true);
    });

    fireEvent.click(screen.getByText("set-prompt"));
    await act(async () => {
      fireEvent.click(screen.getByText("submit"));
    });

    expect(onStart).toHaveBeenCalledTimes(1);

    // Once the rejection settles the composer is interactive again rather than
    // frozen on the launch spinner with the prompt trapped behind it.
    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as { submitPending?: boolean };
      expect(props.submitPending).toBe(false);
    });
  });

  it("defaults Home Codex drafts to provider defaults, same as any other project", async () => {
    const onStart = vi.fn<(input: unknown) => void>();
    useSharedSettings.setState({
      providerConfigs: {
        codex: {
          model: "gpt-5.4",
          effort: "high",
          mode: "agent",
          approvalPolicy: "",
          sandboxMode: "",
        },
      },
    });

    render(
      <ThreadDraftView
        project={homeProject}
        agentStatuses={[dualModeCodexStatus]}
        onStart={onStart}
      />,
    );

    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as {
        controls: Array<{
          kind?: string;
          currentAgentKind?: string;
          currentModel?: string;
          value?: string;
        }>;
      };
      const providerModel = props.controls.find((c) => c.kind === "provider-model");
      expect(providerModel?.currentAgentKind).toBe("codex");
      expect(providerModel?.currentModel).toBe("gpt-5.4");
      expect(props.controls.some((control) => control.value === "auto-review")).toBe(true);
    });

    fireEvent.click(screen.getByText("set-prompt"));
    fireEvent.click(screen.getByText("submit"));

    expect(onStart).toHaveBeenCalledWith({
      agentKind: "codex",
      config: {
        model: "gpt-5.4",
        effort: "high",
        mode: "agent",
        approvalPolicy: "on-request",
        approvalsReviewer: "auto_review",
        sandboxMode: "workspace-write",
      },
      presentationMode: "gui",
      prompt: "hello world",
    });
  });

  it("defaults synthetic generic ACP permissions to auto approve", async () => {
    const onStart = vi.fn<(input: unknown) => void>();

    render(
      <ThreadDraftView project={project} agentStatuses={[acpGenericStatus]} onStart={onStart} />,
    );

    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as {
        controls: Array<{
          kind?: string;
          label?: string;
          isSelected?: boolean;
        }>;
      };
      const permission = props.controls.find((control) => control.label === "Auto Approve");
      expect(permission).toMatchObject({
        kind: "toggle",
        isSelected: true,
      });
    });

    fireEvent.click(screen.getByText("set-prompt"));
    fireEvent.click(screen.getByText("submit"));

    expect(onStart).toHaveBeenCalledWith({
      agentKind: "acp-generic:example-agent",
      config: {
        model: "model-a",
        mode: "agent",
        approvalPolicy: "never",
      },
      presentationMode: "gui",
      prompt: "hello world",
    });
  });

  it("renders Chat first and selects it by default for dual-mode agents", async () => {
    const onStart = vi.fn<(input: unknown) => void>();

    render(
      <ThreadDraftView project={project} agentStatuses={[dualModeCodexStatus]} onStart={onStart} />,
    );

    await waitFor(() => {
      const tabs = screen.getAllByRole("tab");
      expect(tabs.map((tab) => tab.textContent?.replace(/\s+/g, " ").trim())).toEqual([
        "Chat",
        "CLI",
      ]);
      expect(screen.getByRole("tab", { name: "Chat" })).toHaveAttribute("aria-selected", "true");
    });
  });

  it("surfaces terminal-only providers in the draft model picker", async () => {
    const onStart = vi.fn<(input: unknown) => void>();

    render(
      <ThreadDraftView
        project={project}
        agentStatuses={[dualModeCodexStatus, antigravityStatus]}
        onStart={onStart}
      />,
    );

    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as {
        controls: Array<{
          kind?: string;
          presentationMode?: string;
          providers?: Array<{
            kind: string;
            presentationMode?: string;
            capabilities: { models: Array<{ id: string; label: string }> };
          }>;
        }>;
      };
      const providerModel = props.controls.find((c) => c.kind === "provider-model");
      const antigravity = providerModel?.providers?.find(
        (provider) => provider.kind === "antigravity",
      );
      expect(providerModel?.presentationMode).toBe("gui");
      expect(antigravity?.presentationMode).toBe("terminal");
      expect(antigravity?.capabilities.models).toEqual([{ id: "auto", label: "Auto" }]);
    });
  });

  it("switches the draft surface when selecting a terminal-only provider", async () => {
    const onStart = vi.fn<(input: unknown) => void>();

    render(
      <ThreadDraftView
        project={project}
        agentStatuses={[dualModeCodexStatus, antigravityStatus]}
        onStart={onStart}
      />,
    );

    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as {
        controls: Array<{
          kind?: string;
          currentAgentKind?: string;
          currentModel?: string;
          presentationMode?: string;
          onChange?: (next: {
            agentKind: string;
            model: string;
            presentationMode?: "terminal" | "gui";
          }) => void;
        }>;
      };
      const providerModel = props.controls.find((c) => c.kind === "provider-model");
      expect(providerModel?.currentAgentKind).toBe("codex");
    });

    const initialProps = composerSpy.mock.lastCall?.[0] as {
      controls: Array<{
        kind?: string;
        onChange?: (next: {
          agentKind: string;
          model: string;
          presentationMode?: "terminal" | "gui";
        }) => void;
      }>;
    };
    const providerModel = initialProps.controls.find((c) => c.kind === "provider-model");

    composerSpy.mockClear();
    act(() => {
      providerModel?.onChange?.({
        agentKind: "antigravity",
        model: "auto",
        presentationMode: "terminal",
      });
    });

    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as {
        controls: Array<{
          kind?: string;
          currentAgentKind?: string;
          currentModel?: string;
          presentationMode?: string;
        }>;
      };
      const nextProviderModel = props.controls.find((c) => c.kind === "provider-model");
      expect(nextProviderModel?.currentAgentKind).toBe("antigravity");
      expect(nextProviderModel?.currentModel).toBe("auto");
      expect(nextProviderModel?.presentationMode).toBe("terminal");
    });
  });

  it("keeps Chat as the default when a dual-mode agent resolves after mount", async () => {
    const onStart = vi.fn<(input: unknown) => void>();
    const { rerender } = render(
      <ThreadDraftView project={project} agentStatuses={[]} onStart={onStart} />,
    );

    rerender(
      <ThreadDraftView project={project} agentStatuses={[dualModeCodexStatus]} onStart={onStart} />,
    );

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Chat" })).toHaveAttribute("aria-selected", "true");
    });
  });

  it("adds a provider to the mounted draft picker when it becomes installed", async () => {
    const onStart = vi.fn<(input: unknown) => void>();
    const lastDraftConfig = {
      agentKind: "commandcode",
      model: "deepseek/deepseek-v4-flash",
      effort: "high",
      mode: "agent",
      approvalPolicy: "yolo",
      sandboxMode: "",
    } as const;
    const { rerender } = render(
      <ThreadDraftView
        project={project}
        agentStatuses={[dualModeCodexStatus]}
        lastDraftConfig={lastDraftConfig}
        onStart={onStart}
      />,
    );

    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as {
        controls: Array<{
          kind?: string;
          currentAgentKind?: string;
          providers?: Array<{ kind: string }>;
        }>;
      };
      const providerModel = props.controls.find((c) => c.kind === "provider-model");
      expect(providerModel?.currentAgentKind).toBe("codex");
      expect(providerModel?.providers?.map((provider) => provider.kind)).toEqual(["codex"]);
    });

    rerender(
      <ThreadDraftView
        project={project}
        agentStatuses={[dualModeCodexStatus, commandCodeStatus]}
        lastDraftConfig={lastDraftConfig}
        onStart={onStart}
      />,
    );

    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as {
        controls: Array<{
          kind?: string;
          currentAgentKind?: string;
          currentModel?: string;
          presentationMode?: string;
          providers?: Array<{
            kind: string;
            capabilities: { models: Array<{ id: string; label: string }> };
          }>;
        }>;
      };
      const providerModel = props.controls.find((c) => c.kind === "provider-model");
      expect(providerModel?.currentAgentKind).toBe("codex");
      expect(providerModel?.currentModel).toBe("gpt-5.4");
      const commandCodeProvider = providerModel?.providers?.find(
        (provider) => provider.kind === "commandcode",
      );
      expect(commandCodeProvider?.capabilities.models.map((model) => model.id)).toEqual([
        "deepseek/deepseek-v4-flash",
        "gpt-5.4-mini",
      ]);
    });
  });

  it("respects a saved CLI choice for dual-mode agents", async () => {
    const onStart = vi.fn<(input: unknown) => void>();

    act(() => {
      useSharedSettings.setState({
        lastPresentationModeByAgent: { codex: "terminal" },
      });
    });

    render(
      <ThreadDraftView project={project} agentStatuses={[dualModeCodexStatus]} onStart={onStart} />,
    );

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "CLI" })).toHaveAttribute("aria-selected", "true");
    });
  });

  it("applies a saved codex effort after shared settings load", async () => {
    const onStart = vi.fn<(input: unknown) => void>();
    useSharedSettings.setState({ sharedSettingsHydrated: false, providerConfigs: {} });

    render(<ThreadDraftView project={project} agentStatuses={[codexStatus]} onStart={onStart} />);

    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as {
        controls: Array<{ kind?: string; effortValue?: string; currentModel?: string }>;
      };
      const effortContext = props.controls.find((c) => c.kind === "effort-context");
      expect(effortContext?.effortValue).toBe("high");
    });

    act(() => {
      useSharedSettings.setState({
        providerConfigs: {
          codex: {
            model: "gpt-5.4",
            effort: "medium",
            mode: "agent",
            approvalPolicy: "never",
            sandboxMode: "danger-full-access",
          },
        },
        providerModelPreferences: {},
        sharedSettingsHydrated: true,
      });
    });

    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as {
        controls: Array<{ kind?: string; effortValue?: string; currentModel?: string }>;
      };
      const providerModel = props.controls.find((c) => c.kind === "provider-model");
      const effortContext = props.controls.find((c) => c.kind === "effort-context");
      expect(providerModel?.currentModel).toBe("gpt-5.4");
      expect(effortContext?.effortValue).toBe("medium");
    });
  });

  it("recalls app-wide effort and Fast choices when switching between Codex models", async () => {
    useSharedSettings.setState({
      providerConfigs: {
        codex: {
          model: "gpt-5.6-luna",
          effort: "max",
          fast: true,
          mode: "agent",
          approvalPolicy: "on-request",
          sandboxMode: "workspace-write",
        },
      },
      providerModelPreferences: {
        codex: {
          "gpt-5.6-luna": { effort: "max", fast: true },
          "gpt-5.6-sol": { effort: "high", fast: false },
        },
      },
    });

    render(
      <ThreadDraftView
        project={project}
        agentStatuses={[rememberedCodexStatus]}
        lastDraftConfig={{
          agentKind: "codex",
          model: "gpt-5.6-luna",
          effort: "low",
          fast: false,
        }}
        onStart={vi.fn<(input: unknown) => void>()}
      />,
    );

    type ModelControl = {
      kind?: string;
      currentModel?: string;
      effortValue?: string;
      label?: string;
      isSelected?: boolean;
      onChange?: (next: { agentKind: string; model: string }) => void;
    };
    const currentControls = () => {
      const call = composerSpy.mock.lastCall;
      if (!call) throw new Error("Composer has not rendered");
      return (call[0] as { controls: ModelControl[] }).controls;
    };
    const expectSelection = async (model: string, effort: string, fast: boolean) => {
      await waitFor(() => {
        const controls = currentControls();
        expect(controls.find((control) => control.kind === "provider-model")?.currentModel).toBe(
          model,
        );
        expect(controls.find((control) => control.kind === "effort-context")?.effortValue).toBe(
          effort,
        );
        expect(controls.find((control) => control.label === "Fast")?.isSelected).toBe(fast);
      });
    };

    await expectSelection("gpt-5.6-luna", "max", true);
    act(() => {
      currentControls()
        .find((control) => control.kind === "provider-model")
        ?.onChange?.({ agentKind: "codex", model: "gpt-5.6-sol" });
    });
    await expectSelection("gpt-5.6-sol", "high", false);
    act(() => {
      currentControls()
        .find((control) => control.kind === "provider-model")
        ?.onChange?.({ agentKind: "codex", model: "gpt-5.6-luna" });
    });
    await expectSelection("gpt-5.6-luna", "max", true);
  });

  it("keeps simultaneously open draft configs independent while saving defaults for later drafts", async () => {
    render(
      <>
        <ThreadDraftView
          project={project}
          agentStatuses={[dualModeCodexStatus]}
          onStart={vi.fn<(input: unknown) => void>()}
        />
        <ThreadDraftView
          project={project}
          agentStatuses={[dualModeCodexStatus]}
          onStart={vi.fn<(input: unknown) => void>()}
        />
      </>,
    );

    await waitFor(() => {
      const recentCalls = composerSpy.mock.calls.slice(-2) as Array<
        [
          {
            controls: Array<{
              label?: string;
              onChange?: (selected: boolean) => void;
            }>;
          },
        ]
      >;
      expect(recentCalls).toHaveLength(2);
      expect(recentCalls.every(([props]) => props.controls.some((c) => c.label === "Work"))).toBe(
        true,
      );
    });

    const firstDraftProps = composerSpy.mock.calls.at(-2)?.[0] as {
      controls: Array<{
        label?: string;
        onChange?: (selected: boolean) => void;
      }>;
    };
    const firstModeToggle = firstDraftProps.controls.find((control) => control.label === "Work");

    composerSpy.mockClear();
    act(() => {
      firstModeToggle?.onChange?.(true);
    });

    await waitFor(() => {
      expect(composerSpy).toHaveBeenCalled();
      const lastProps = composerSpy.mock.lastCall?.[0] as {
        controls: Array<{ label?: string }>;
      };
      expect(lastProps.controls.some((control) => control.label === "Plan")).toBe(true);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    expect(composerSpy.mock.calls).toHaveLength(1);
    expect(useSharedSettings.getState().providerConfigs.codex?.mode).toBe("plan");
  });

  it("does not show effort/context control for Cursor models without those capabilities", async () => {
    const onStart = vi.fn<(input: unknown) => void>();

    render(<ThreadDraftView project={project} agentStatuses={[cursorStatus]} onStart={onStart} />);

    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as {
        controls: Array<{
          kind?: string;
          currentModel?: string;
          label?: string;
          iconOnly?: boolean;
        }>;
      };
      const providerModel = props.controls.find((c) => c.kind === "provider-model");
      const fast = props.controls.find((control) => control.label === "Fast");
      expect(providerModel?.currentModel).toBe("composer-2");
      expect(props.controls.some((control) => control.kind === "effort-context")).toBe(false);
      expect(fast?.iconOnly).toBe(true);
    });
  });

  it("normalizes saved Cursor effort variants into base model plus effort", async () => {
    const onStart = vi.fn<(input: unknown) => void>();

    act(() => {
      useSharedSettings.setState({
        providerConfigs: {
          cursor: {
            model: "gpt-5.5-high",
            effort: "",
            mode: "agent",
            approvalPolicy: "default",
          },
        },
      });
    });

    render(<ThreadDraftView project={project} agentStatuses={[cursorStatus]} onStart={onStart} />);

    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as {
        controls: Array<{
          kind?: string;
          currentModel?: string;
          effortValue?: string;
        }>;
      };
      const providerModel = props.controls.find((c) => c.kind === "provider-model");
      const effortContext = props.controls.find((c) => c.kind === "effort-context");
      expect(providerModel?.currentModel).toBe("gpt-5.5");
      expect(effortContext?.effortValue).toBe("high");
    });
  });

  it("enables Thinking by default when switching to a supported Cursor model", async () => {
    const onStart = vi.fn<(input: unknown) => void>();

    render(<ThreadDraftView project={project} agentStatuses={[cursorStatus]} onStart={onStart} />);

    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as {
        controls: Array<{
          kind?: string;
          currentModel?: string;
          onChange?: (next: { agentKind: string; model: string }) => void;
        }>;
      };
      expect(
        props.controls.find((control) => control.kind === "provider-model")?.currentModel,
      ).toBe("composer-2");
    });

    const initialProps = composerSpy.mock.lastCall?.[0] as {
      controls: Array<{
        kind?: string;
        onChange?: (next: { agentKind: string; model: string }) => void;
      }>;
    };
    const providerModel = initialProps.controls.find(
      (control) => control.kind === "provider-model",
    );

    act(() => {
      providerModel?.onChange?.({ agentKind: "cursor", model: "gpt-5.5" });
    });

    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as {
        controls: Array<{
          kind?: string;
          currentModel?: string;
          thinkingValue?: boolean;
        }>;
      };
      expect(
        props.controls.find((control) => control.kind === "provider-model")?.currentModel,
      ).toBe("gpt-5.5");
      expect(
        props.controls.find((control) => control.kind === "effort-context")?.thinkingValue,
      ).toBe(true);
    });
  });

  it("does not expose a single Cursor context option as a dropdown control", async () => {
    const onStart = vi.fn<(input: unknown) => void>();

    render(
      <ThreadDraftView
        project={project}
        agentStatuses={[singleContextThinkingCursorStatus]}
        onStart={onStart}
      />,
    );

    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as {
        controls: Array<{
          kind?: string;
          currentModel?: string;
          contextSizes?: Array<{ id: string; label: string }>;
          contextValue?: string;
          thinkingSupported?: boolean;
        }>;
      };
      const providerModel = props.controls.find((c) => c.kind === "provider-model");
      const effortContext = props.controls.find((c) => c.kind === "effort-context");
      expect(providerModel?.currentModel).toBe("claude-4.5-sonnet");
      expect(effortContext?.contextSizes).toEqual([]);
      expect(effortContext?.contextValue).toBeUndefined();
      expect(effortContext?.thinkingSupported).toBe(true);
    });
  });

  it("does not expose a single Cursor reasoning option as a dropdown control", async () => {
    const onStart = vi.fn<(input: unknown) => void>();

    render(
      <ThreadDraftView
        project={project}
        agentStatuses={[singleEffortMultiContextCursorStatus]}
        onStart={onStart}
      />,
    );

    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as {
        controls: Array<{
          kind?: string;
          currentModel?: string;
          efforts?: Array<{ id: string; label: string }>;
          effortValue?: string;
          contextSizes?: Array<{ id: string; label: string }>;
          contextValue?: string;
          thinkingSupported?: boolean;
        }>;
      };
      const providerModel = props.controls.find((c) => c.kind === "provider-model");
      const effortContext = props.controls.find((c) => c.kind === "effort-context");
      expect(providerModel?.currentModel).toBe("claude-4.6-sonnet");
      expect(effortContext?.efforts).toEqual([]);
      expect(effortContext?.effortValue).toBeUndefined();
      expect(effortContext?.contextSizes).toEqual([
        { id: "200k", label: "200K" },
        { id: "1m", label: "1M" },
      ]);
      expect(effortContext?.contextValue).toBe("200k");
      expect(effortContext?.thinkingSupported).toBe(true);
    });
  });

  it("switches provider and selected model in one coherent composer state", async () => {
    const onStart = vi.fn<(input: unknown) => void>();

    render(
      <ThreadDraftView
        project={project}
        agentStatuses={[codexStatus, claudeStatus]}
        onStart={onStart}
      />,
    );

    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as {
        controls: Array<{
          kind?: string;
          currentAgentKind?: string;
          currentModel?: string;
          onChange?: (next: { agentKind: string; model: string }) => void;
        }>;
      };
      const providerModel = props.controls.find((c) => c.kind === "provider-model");
      expect(providerModel?.currentAgentKind).toBe("codex");
      expect(providerModel?.currentModel).toBe("gpt-5.4");
    });

    const initialProps = composerSpy.mock.lastCall?.[0] as {
      controls: Array<{
        kind?: string;
        currentAgentKind?: string;
        currentModel?: string;
        onChange?: (next: { agentKind: string; model: string }) => void;
      }>;
    };
    const providerModel = initialProps.controls.find((c) => c.kind === "provider-model");

    composerSpy.mockClear();
    act(() => {
      providerModel?.onChange?.({ agentKind: "claude", model: "claude-opus-4-7" });
    });

    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as {
        controls: Array<{
          kind?: string;
          currentAgentKind?: string;
          currentModel?: string;
          value?: string;
        }>;
      };
      const nextProviderModel = props.controls.find((c) => c.kind === "provider-model");
      expect(nextProviderModel?.currentAgentKind).toBe("claude");
      expect(nextProviderModel?.currentModel).toBe("claude-opus-4-7");
      expect(props.controls.some((control) => control.value === "auto")).toBe(true);
    });

    const claudeRenderModels = (
      composerSpy.mock.calls as Array<
        [
          {
            controls: Array<{
              kind?: string;
              currentAgentKind?: string;
              currentModel?: string;
            }>;
          },
        ]
      >
    )
      .map(([props]) => props.controls.find((c) => c.kind === "provider-model"))
      .filter(
        (control): control is { kind?: string; currentAgentKind?: string; currentModel?: string } =>
          control?.currentAgentKind === "claude",
      )
      .map((control) => control.currentModel);

    expect(claudeRenderModels.length).toBeGreaterThan(0);
    expect(claudeRenderModels).toEqual(claudeRenderModels.map(() => "claude-opus-4-7"));
  });

  it("keeps a local plan-mode selection while deferred persistence catches up", async () => {
    render(
      <ThreadDraftView
        project={project}
        agentStatuses={[dualModeCodexStatus]}
        onStart={vi.fn<(input: unknown) => void>()}
      />,
    );

    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as {
        controls: Array<{
          kind?: string;
          label?: string;
          onChange?: (selected: boolean) => void;
        }>;
      };
      expect(props.controls.some((control) => control.label === "Work")).toBe(true);
    });

    const initialProps = composerSpy.mock.lastCall?.[0] as {
      controls: Array<{
        kind?: string;
        label?: string;
        onChange?: (selected: boolean) => void;
      }>;
    };
    const modeToggle = initialProps.controls.find((control) => control.label === "Work");

    composerSpy.mockClear();
    act(() => {
      modeToggle?.onChange?.(true);
    });

    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as {
        controls: Array<{ label?: string }>;
      };
      expect(props.controls.some((control) => control.label === "Plan")).toBe(true);
      expect(props.controls.some((control) => control.label === "Work")).toBe(false);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    const settledProps = composerSpy.mock.lastCall?.[0] as {
      controls: Array<{ label?: string }>;
    };
    expect(settledProps.controls.some((control) => control.label === "Plan")).toBe(true);
    expect(settledProps.controls.some((control) => control.label === "Work")).toBe(false);
  });
});
