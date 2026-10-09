import {
  Children,
  isValidElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { toast } from "@heroui/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { AgentStatus, Project, ThreadConfig } from "@/shared/contracts";
import { HOME_PROJECT_ID, HOME_PROJECT_NAME } from "@/shared/homeScope";
import { selectionBindingMatches } from "@/shared/selectionBinding";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { liveVoice } from "@/renderer/speech/liveVoice";

const { composerSpy, launchExperimentMock } = vi.hoisted(() => ({
  composerSpy: vi.fn<(props: unknown) => void>(),
  launchExperimentMock: vi.fn<(input: unknown) => Promise<string | null>>(),
}));

vi.mock("./ThreadComposer", () => ({
  ThreadComposer: (props: {
    controls: unknown[];
    onPromptChange: (value: string) => void;
    onSubmit: () => void;
    afterControls?: ReactNode;
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

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

const liveVoiceCodexStatus: AgentStatus = {
  ...dualModeCodexStatus,
  capabilities: {
    ...dualModeCodexStatus.capabilities,
    liveVoice: { transport: "webrtc", dataChannel: "audio-events" },
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
      agentSettings: {},
      hiddenModels: {},
      disabledAgents: [],
      lastPresentationModeByAgent: {},
      enabledMcpServers: {},
      disabledBuiltInMcpServers: {},
      sharedSettingsHydrated: true,
    });
    useAppStore.setState({ pendingDraftWorktreeSelections: {} });
    useRemoteServersStore.setState({
      servers: [],
      runtime: {},
      hostUpdates: {},
      hostUpdateRestarts: {},
    });
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

  it.each([false, true])(
    "keeps configured experiment targets runnable after model catalog refresh (empty: %s)",
    async (emptyCatalog) => {
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
      const { rerender } = render(
        <ThreadDraftView project={project} agentStatuses={[codexStatus]} onStart={() => {}} />,
      );

      const initialComposer = composerSpy.mock.lastCall?.[0] as {
        afterControls: ReactElement<{ experiment?: { onToggle: (enabled: boolean) => void } }>;
      };
      act(() => initialComposer.afterControls.props.experiment?.onToggle(true));
      expect(screen.getByRole("button", { name: "Select branch" })).toHaveTextContent(
        "origin/main",
      );

      for (let index = 0; index < 2; index += 1) {
        const composer = composerSpy.mock.lastCall?.[0] as { fixedContent: ReactNode };
        const targets = findElementByTypeName(composer.fixedContent, "ExperimentDraftTargets");
        if (!targets) throw new Error("Expected experiment targets");
        act(targets.props.onAdd as () => void);
      }
      rerender(
        <ThreadDraftView
          project={project}
          agentStatuses={[
            {
              ...codexStatus,
              capabilities: {
                ...codexStatus.capabilities,
                models: emptyCatalog ? [] : codexStatus.capabilities.models,
              },
            },
          ]}
          onStart={() => {}}
        />,
      );
      fireEvent.click(screen.getByText("set-prompt"));
      const contentProps = composerSpy.mock.lastCall?.[0] as { inputContent: ReactElement };
      const inputRender = render(contentProps.inputContent);
      const editor = inputRender.container.querySelector<HTMLElement>('[contenteditable="true"]');
      if (!editor) throw new Error("Expected experiment draft editor");
      act(() => {
        editor.textContent = "hello world";
        fireEvent.input(editor);
      });
      const refreshedComposer = composerSpy.mock.lastCall?.[0] as { submitDisabled: boolean };
      expect(refreshedComposer.submitDisabled).toBe(false);
      fireEvent.click(screen.getByText("submit"));

      await waitFor(() =>
        expect(launchExperimentMock).toHaveBeenCalledWith(
          expect.objectContaining({
            baseBranch: "origin/main",
            candidates: expect.arrayContaining([
              expect.objectContaining({ config: expect.objectContaining({ model: "gpt-5.4" }) }),
            ]),
          }),
        ),
      );
    },
  );

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

  afterEach(async () => {
    await liveVoice.stop();
    vi.unstubAllGlobals();
    delete (window as unknown as { poracode?: unknown }).poracode;
  });

  it("cancels deferred draft voice before a typed Send can hand off content", async () => {
    const permission = deferred<MediaStream>();
    const track = { enabled: true, stop: vi.fn<() => void>(), onended: null };
    const stream = {
      getTracks: () => [track],
      getAudioTracks: () => [track],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn<() => Promise<MediaStream>>(() => permission.promise);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    const onStart = vi.fn<(input: unknown) => void>();

    render(
      <ThreadDraftView
        project={project}
        agentStatuses={[liveVoiceCodexStatus]}
        onStart={onStart}
      />,
    );

    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as {
        submitControl?: ReactElement<{ onStart: () => void }>;
      };
      expect(props.submitControl).toBeDefined();
    });
    const props = composerSpy.mock.lastCall?.[0] as {
      submitControl: ReactElement<{ onStart: () => void }>;
      inputContent: ReactElement;
    };

    act(() => props.submitControl.props.onStart());
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());

    const inputRender = render(props.inputContent);
    const editor = inputRender.container.querySelector<HTMLElement>('[contenteditable="true"]');
    expect(editor).not.toBeNull();
    if (!editor) throw new Error("Expected draft editor");
    act(() => {
      editor.innerHTML =
        '<span data-mention-path="C:\\src\\main.ts">main.ts</span> ask while permission is pending';
      fireEvent.input(editor);
    });
    const afterInputProps = composerSpy.mock.lastCall?.[0] as {
      onAttachFiles?: (paths: string[]) => void;
    };
    act(() => afterInputProps.onAttachFiles?.(["C:\\draft-note.txt"]));
    await waitFor(() => {
      const nextProps = composerSpy.mock.lastCall?.[0] as { submitDisabled: boolean };
      expect(nextProps.submitDisabled).toBe(false);
    });
    const nextProps = composerSpy.mock.lastCall?.[0] as { onSubmit: () => void };
    act(() => nextProps.onSubmit());

    expect(onStart).toHaveBeenCalledOnce();
    expect(onStart.mock.calls[0]?.[0]).toMatchObject({
      segments: [
        { kind: "attachment", path: "C:\\draft-note.txt", mimeType: "text/plain" },
        { kind: "file", path: "C:\\src\\main.ts" },
        { kind: "text", content: " ask while permission is pending" },
      ],
    });

    permission.resolve(stream);
    await waitFor(() => expect(track.stop).toHaveBeenCalledOnce());
    expect(onStart).toHaveBeenCalledOnce();
  });

  it("cancels deferred draft voice when an attachment is added", async () => {
    const permission = deferred<MediaStream>();
    const track = { enabled: true, stop: vi.fn<() => void>(), onended: null };
    const stream = {
      getTracks: () => [track],
      getAudioTracks: () => [track],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn<() => Promise<MediaStream>>(() => permission.promise);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    const onStart = vi.fn<(input: unknown) => void>();

    render(
      <ThreadDraftView
        project={{ ...project, id: "live-voice-attachment-project" }}
        agentStatuses={[liveVoiceCodexStatus]}
        onStart={onStart}
      />,
    );

    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as {
        submitControl?: ReactElement<{ onStart: () => void }>;
      };
      expect(props.submitControl).toBeDefined();
    });
    const props = composerSpy.mock.lastCall?.[0] as {
      submitControl: ReactElement<{ onStart: () => void }>;
      onAttachFiles?: (paths: string[]) => void;
    };

    act(() => props.submitControl.props.onStart());
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
    act(() => props.onAttachFiles?.(["C:\\draft-note.txt"]));

    permission.resolve(stream);
    await waitFor(() => expect(track.stop).toHaveBeenCalledOnce());
    expect(onStart).not.toHaveBeenCalled();
  });

  it("allows a fresh draft voice attempt after content cancels the first one", async () => {
    const firstPermission = deferred<MediaStream>();
    const secondPermission = deferred<MediaStream>();
    const firstTrack = { enabled: true, stop: vi.fn<() => void>(), onended: null };
    const secondTrack = { enabled: true, stop: vi.fn<() => void>(), onended: null };
    const firstStream = {
      getTracks: () => [firstTrack],
      getAudioTracks: () => [firstTrack],
    } as unknown as MediaStream;
    const secondStream = {
      getTracks: () => [secondTrack],
      getAudioTracks: () => [secondTrack],
    } as unknown as MediaStream;
    const getUserMedia = vi
      .fn<() => Promise<MediaStream>>()
      .mockReturnValueOnce(firstPermission.promise)
      .mockReturnValueOnce(secondPermission.promise);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    render(
      <ThreadDraftView
        project={{ ...project, id: "live-voice-retry-project" }}
        agentStatuses={[liveVoiceCodexStatus]}
        onStart={() => {}}
      />,
    );

    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as {
        submitControl?: ReactElement<{ onStart: () => void }>;
      };
      expect(props.submitControl).toBeDefined();
    });
    let props = composerSpy.mock.lastCall?.[0] as {
      submitControl: ReactElement<{ onStart: () => void }>;
      inputContent: ReactElement<{ onTextChange?: (hasText: boolean) => void }>;
    };
    act(() => props.submitControl.props.onStart());
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());

    act(() => props.inputContent.props.onTextChange?.(true));
    firstPermission.resolve(firstStream);
    await waitFor(() => expect(firstTrack.stop).toHaveBeenCalledOnce());

    await waitFor(() => {
      const nextProps = composerSpy.mock.lastCall?.[0] as {
        inputContent: ReactElement<{ onTextChange?: (hasText: boolean) => void }>;
      };
      props = nextProps as typeof props;
    });
    act(() => props.inputContent.props.onTextChange?.(false));
    await waitFor(() => {
      const nextProps = composerSpy.mock.lastCall?.[0] as {
        submitControl?: ReactElement<{ onStart: () => void }>;
        inputContent: ReactElement<{ onTextChange?: (hasText: boolean) => void }>;
      };
      expect(nextProps.submitControl).toBeDefined();
      props = nextProps as typeof props;
    });
    act(() => props.submitControl.props.onStart());
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));

    act(() => {
      const currentProps = composerSpy.mock.lastCall?.[0] as {
        inputContent: ReactElement<{ onTextChange?: (hasText: boolean) => void }>;
      };
      currentProps.inputContent.props.onTextChange?.(true);
    });
    secondPermission.resolve(secondStream);
    await waitFor(() => expect(secondTrack.stop).toHaveBeenCalledOnce());
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

  it("shows the remote connection's specific error message", () => {
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
        "desktop-1": {
          status: "error",
          message: "This app version is incompatible with that server.",
          projects: [],
          threads: [],
        },
      },
    });

    render(<ThreadDraftView project={remoteProject} agentStatuses={[]} onStart={() => {}} />);

    expect(
      screen.getByText("This app version is incompatible with that server."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/remote server is offline/i)).not.toBeInTheDocument();
  });

  it("starts a draft for an online host-owned environment project (C1 F4)", () => {
    useRemoteServersStore.setState({
      servers: [
        {
          connectionId: "conn-child",
          desktopId: "child-desktop",
          label: "Child",
          endpoint: "http://127.0.0.1:49153/api/environments/x/proxy/",
          accessToken: "child-token",
          scopes: ["session:read"],
          transport: {
            kind: "environment",
            parentConnectionId: "conn-parent",
            environmentId: "11111111-1111-4111-8111-111111111111",
            childDesktopId: "child-desktop",
          },
        },
      ],
      runtime: {
        "conn-child": { status: "online", projects: [], threads: [] },
      },
    });
    const environmentProject: Project = {
      ...project,
      id: "environment-project",
      remoteServerId: "conn-child",
      remoteId: "project-1",
    };

    render(
      <ThreadDraftView
        project={environmentProject}
        agentStatuses={[codexStatus]}
        onStart={() => {}}
      />,
    );

    expect(screen.queryByText("Connection error")).not.toBeInTheDocument();
    expect(composerSpy).toHaveBeenCalled();
  });

  it("shows the remote connecting state instead of the missing-agent message", () => {
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
        "desktop-1": { status: "connecting", projects: [], threads: [] },
      },
    });

    render(<ThreadDraftView project={remoteProject} agentStatuses={[]} onStart={() => {}} />);

    expect(screen.getByText("Connecting…")).toBeInTheDocument();
    expect(screen.queryByText("Connection error")).not.toBeInTheDocument();
    expect(screen.queryByText("No supported agents detected")).not.toBeInTheDocument();
  });

  it("keeps the remote composer visible and disables submit during a host update restart", () => {
    const onStart = vi.fn<(input: unknown) => void>();
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
        "desktop-1": { status: "connecting", projects: [], threads: [] },
      },
      hostUpdateRestarts: { "desktop-1": "1.1.0" },
    });

    render(
      <ThreadDraftView project={remoteProject} agentStatuses={[codexStatus]} onStart={onStart} />,
    );

    expect(screen.queryByText("Connecting…")).not.toBeInTheDocument();
    const composer = composerSpy.mock.lastCall?.[0] as { submitDisabled?: boolean };
    expect(composer.submitDisabled).toBe(true);
    fireEvent.click(screen.getByText("set-prompt"));
    fireEvent.click(screen.getByText("submit"));
    expect(onStart).not.toHaveBeenCalled();
  });

  it("does not use local provider MCP settings for a desktop remote draft", () => {
    useSharedSettings.setState({ agentSettings: { codex: { crossagentMcp: true } } });
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
        "desktop-1": { status: "online", projects: [], threads: [] },
      },
    });

    render(
      <ThreadDraftView
        project={remoteProject}
        agentStatuses={[
          {
            ...codexStatus,
            capabilities: {
              ...codexStatus.capabilities,
              mcpConfigSource: "agentSettings",
              agentSettingsDefaults: { crossagentMcp: true },
            },
          },
        ]}
        onStart={() => {}}
      />,
    );

    const composerProps = composerSpy.mock.lastCall?.[0] as { afterControls?: ReactNode };
    expect(isValidElement(composerProps.afterControls)).toBe(true);
    const menuProps = (composerProps.afterControls as ReactElement).props as {
      mcpServers: Array<{ visible: boolean }>;
      customMcpServers: unknown[];
      readOnlyMcp?: boolean;
    };
    expect(menuProps.mcpServers.some((server) => server.visible)).toBe(false);
    expect(menuProps.customMcpServers).toEqual([]);
    expect(menuProps.readOnlyMcp).not.toBe(true);
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

describe("ThreadDraftView model family drafts", () => {
  // A toy relation with the same shape the provider compiles from its native
  // catalog: model-bound (encoded) coordinates on the Terminal surface, a
  // config-bound pair relation on the GUI override, and two absent pairs that
  // must stay unreachable.
  const familyModels = [
    { id: "solo", label: "Solo" },
    { id: "f-alpha-x-low", label: "Fusion (Alpha Low + X)" },
    { id: "f-alpha-x-high", label: "Fusion (Alpha High + X)" },
    { id: "f-alpha-x-low-fast", label: "Fusion (Alpha Low + X Fast)" },
    { id: "f-alpha-y-low", label: "Fusion (Alpha Low + Y)" },
    { id: "f-beta-x-low", label: "Fusion (Beta Low + X)" },
  ];
  const terminalDescriptor = {
    model: "f-alpha-x-low",
    label: "Fusion",
    selectors: [
      {
        id: "lead",
        labelKey: "modelSelection.lead" as const,
        options: [
          { id: "alpha", label: "Alpha" },
          { id: "beta", label: "Beta" },
        ],
      },
      {
        id: "sidekick",
        labelKey: "modelSelection.sidekick" as const,
        options: [
          { id: "x", label: "X" },
          { id: "y", label: "Y" },
        ],
      },
    ],
    bindings: { effort: "model" as const, fast: "model" as const },
    members: [
      {
        model: "f-alpha-x-low",
        selections: { lead: "alpha", sidekick: "x" },
        effort: "low",
        fast: false,
      },
      {
        model: "f-alpha-x-high",
        selections: { lead: "alpha", sidekick: "x" },
        effort: "high",
        fast: false,
      },
      {
        model: "f-alpha-x-low-fast",
        selections: { lead: "alpha", sidekick: "x" },
        effort: "low",
        fast: true,
      },
      {
        model: "f-alpha-y-low",
        selections: { lead: "alpha", sidekick: "y" },
        effort: "low",
        fast: false,
      },
      {
        model: "f-beta-x-low",
        selections: { lead: "beta", sidekick: "x" },
        effort: "low",
        fast: false,
      },
    ],
  };
  const guiDescriptor = {
    model: "pair-alpha-x",
    label: "Fusion",
    selectors: terminalDescriptor.selectors,
    bindings: { effort: "config" as const, fast: "config" as const },
    members: [
      { model: "pair-alpha-x", selections: { lead: "alpha", sidekick: "x" } },
      { model: "pair-alpha-y", selections: { lead: "alpha", sidekick: "y" } },
    ],
  };
  const familyAgentStatus: AgentStatus = {
    kind: "devin",
    label: "Devin",
    installed: true,
    authState: "authenticated",
    capabilities: {
      models: familyModels,
      efforts: [],
      modelEfforts: {},
      modes: ["agent", "plan"],
      approvalPolicies: [{ id: "normal", label: "Normal" }],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "terminal",
      presentationMode: "terminal",
      presentationModes: ["terminal", "gui"],
      settingDefs: [],
      modelFamilies: [terminalDescriptor],
      presentationCapabilities: {
        gui: {
          models: [
            { id: "solo", label: "Solo" },
            { id: "pair-alpha-x", label: "Fusion (Alpha + X)" },
            { id: "pair-alpha-y", label: "Fusion (Alpha + Y)" },
          ],
          efforts: ["low", "high"],
          modelEfforts: {
            "pair-alpha-x": ["low", "high"],
            "pair-alpha-y": ["low", "high"],
          },
          modelFamilies: [guiDescriptor],
        },
      },
    },
  };

  function renderFamilyDraft() {
    return render(
      <ThreadDraftView project={project} agentStatuses={[familyAgentStatus]} onStart={() => {}} />,
    );
  }

  function composerControls() {
    const props = composerSpy.mock.lastCall?.[0] as
      | { controls: Array<Record<string, unknown>> }
      | undefined;
    return props?.controls ?? [];
  }

  function fastToggle() {
    return composerControls().find(
      (control) => control.kind === "toggle" && control.iconKind === "fast",
    ) as
      | { isSelected: boolean; disabledReason?: string; onChange: (selected: boolean) => void }
      | undefined;
  }

  function pairedSelectorControl() {
    return composerControls().find(
      (control) => control.kind === "effort-context" && control.familySelection !== undefined,
    ) as
      | {
          effortValue?: string;
          onEffortChange: (value: string) => void;
          familySelection: {
            columns: Array<{
              id: string;
              models: {
                options: ReadonlyArray<{ id: string }>;
                value: string;
                onChange: (value: string) => void;
              };
            }>;
          };
        }
      | undefined;
  }

  function persistedDraft() {
    return useSharedSettings.getState().providerConfigs.devin;
  }

  beforeEach(() => {
    composerSpy.mockClear();
    useSharedSettings.setState({
      providerConfigs: {},
      providerModelPreferences: {},
      agentSettings: {},
      hiddenModels: {},
      disabledAgents: [],
      lastPresentationModeByAgent: {},
      sharedSettingsHydrated: true,
    });
  });

  it("restores a raw Fast UID with inert seeds, displaying the UID's Fast state", async () => {
    useSharedSettings.setState({
      providerConfigs: {
        devin: {
          model: "f-alpha-x-low-fast",
          effort: "",
          fast: false,
          mode: "agent",
          approvalPolicy: "normal",
          sandboxMode: "",
        },
      },
    });
    useSharedSettings.setState({
      lastPresentationModeByAgent: { devin: "terminal" },
    });
    renderFamilyDraft();
    await waitFor(() => expect(persistedDraft()?.model).toBe("f-alpha-x-low-fast"));
    const fast = fastToggle();
    expect(fast?.isSelected).toBe(true);
    expect(fast?.disabledReason).toBeUndefined();
    // Nothing was rewritten on restore: the saved config keeps the exact UID
    // and its inert carriers.
    expect(persistedDraft()).toMatchObject({
      model: "f-alpha-x-low-fast",
      effort: "",
      fast: false,
    });
  });

  it("saves the exact plain sibling with inert seeds when the user turns Fast off", async () => {
    useSharedSettings.setState({
      providerConfigs: {
        devin: {
          model: "f-alpha-x-low-fast",
          effort: "",
          fast: false,
          mode: "agent",
          approvalPolicy: "normal",
          sandboxMode: "",
        },
      },
      lastPresentationModeByAgent: { devin: "terminal" },
    });
    renderFamilyDraft();
    await waitFor(() => expect(fastToggle()?.isSelected).toBe(true));
    act(() => fastToggle()?.onChange(false));
    await waitFor(() => expect(persistedDraft()?.model).toBe("f-alpha-x-low"));
    // The atomic edit replaces the whole encoded tuple; the displayed Fast
    // state now follows the new plain UID.
    expect(persistedDraft()).toMatchObject({
      model: "f-alpha-x-low",
      effort: "",
      fast: false,
    });
    expect(fastToggle()?.isSelected).toBe(false);
    // The model preference records the plain member's Fast choice.
    expect(useSharedSettings.getState().providerModelPreferences.devin?.["f-alpha-x-low"]).toEqual({
      fast: false,
    });
  });

  describe("selection binding", () => {
    const boundStatus: AgentStatus = {
      ...familyAgentStatus,
      capabilities: {
        ...familyAgentStatus.capabilities,
        modelFamilies: [
          { ...terminalDescriptor, redundantValues: { effort: ["", "default"], fast: [false] } },
        ],
      },
    };
    const owner = { agentKind: "devin", presentationMode: "terminal" as const };
    const savedTuple = {
      model: "f-alpha-x-low-fast",
      effort: "",
      fast: false,
      mode: "agent" as const,
      approvalPolicy: "normal",
      sandboxMode: "",
    };

    function renderBound(onStart: (input: unknown) => void = () => {}) {
      useSharedSettings.setState({
        providerConfigs: { devin: savedTuple },
        lastPresentationModeByAgent: { devin: "terminal" },
      });
      useAppStore.setState({ projects: [project] });
      return render(
        <ThreadDraftView project={project} agentStatuses={[boundStatus]} onStart={onStart} />,
      );
    }

    it("mints target intent from a deliberate family edit and launches the exact tuple", async () => {
      const onStart = vi.fn<(input: unknown) => void>();
      renderBound(onStart);
      await waitFor(() => expect(fastToggle()?.isSelected).toBe(true));
      act(() => fastToggle()?.onChange(false));
      await waitFor(() => expect(persistedDraft()?.model).toBe("f-alpha-x-low"));
      const binding = {
        version: 1,
        kind: "family-member",
        owner,
        model: "f-alpha-x-low",
        inertValues: { effort: "", fast: false },
      };
      expect(persistedDraft()?.selectionBinding).toEqual(binding);
      expect(
        useAppStore.getState().projects.find((stored) => stored.id === project.id)?.lastDraftConfig
          ?.selectionBinding,
      ).toEqual(binding);

      fireEvent.click(screen.getByText("set-prompt"));
      fireEvent.click(screen.getByText("submit"));
      const launched = (
        onStart.mock.lastCall?.[0] as { config: Record<string, unknown> } | undefined
      )?.config;
      expect(launched).toMatchObject({ model: "f-alpha-x-low", effort: "", fast: false });
      expect(launched?.selectionBinding).toEqual(binding);
    });

    it("restores without minting and drops intent on an exact re-pick", async () => {
      renderBound();
      await waitFor(() => expect(persistedDraft()?.model).toBe("f-alpha-x-low-fast"));
      expect(persistedDraft()?.selectionBinding).toBeUndefined();
      act(() => fastToggle()?.onChange(false));
      await waitFor(() => expect(persistedDraft()?.selectionBinding).toBeDefined());
      const picker = composerControls().find((control) => control.kind === "provider-model") as
        | { onChange: (next: Record<string, unknown>) => void }
        | undefined;
      act(() =>
        picker?.onChange({ agentKind: "devin", model: "f-alpha-x-low", selectionIntent: "exact" }),
      );
      await waitFor(() => expect(persistedDraft()?.selectionBinding).toBeUndefined());
      expect(persistedDraft()).toMatchObject({ model: "f-alpha-x-low", effort: "", fast: false });
    });

    it("keeps a new project's own empty context through a family edit and launch", async () => {
      // No initial project draft and no context edit: deferred context
      // inheritance must not strip the member's own empty carrier after the
      // edit records it in a fresh binding.
      const status: AgentStatus = {
        ...boundStatus,
        capabilities: {
          ...boundStatus.capabilities,
          modelFamilies: [
            {
              ...terminalDescriptor,
              redundantValues: {
                effort: ["", "default"],
                fast: [false],
                thinking: [false],
                contextSize: ["", "default"],
              },
            },
          ],
        },
      };
      useSharedSettings.setState({
        providerConfigs: { devin: { ...savedTuple, thinking: false, contextSize: "" } },
        lastPresentationModeByAgent: { devin: "terminal" },
      });
      useAppStore.setState({ projects: [project] });
      const onStart = vi.fn<(input: unknown) => void>();
      render(<ThreadDraftView project={project} agentStatuses={[status]} onStart={onStart} />);
      await waitFor(() => expect(persistedDraft()?.contextSize).toBe(""));
      act(() => fastToggle()?.onChange(false));
      await waitFor(() => expect(persistedDraft()?.model).toBe("f-alpha-x-low"));

      const tuple = {
        model: "f-alpha-x-low",
        effort: "",
        contextSize: "",
        fast: false,
        thinking: false,
      };
      const binding = {
        version: 1,
        kind: "family-member",
        owner,
        model: "f-alpha-x-low",
        inertValues: { effort: "", fast: false, thinking: false, contextSize: "" },
      };
      expect(persistedDraft()).toMatchObject({ ...tuple, selectionBinding: binding });
      expect(
        useAppStore.getState().projects.find((stored) => stored.id === project.id)?.lastDraftConfig,
      ).toMatchObject({ agentKind: "devin", ...tuple, selectionBinding: binding });

      fireEvent.click(screen.getByText("set-prompt"));
      fireEvent.click(screen.getByText("submit"));
      const [launch] = onStart.mock.lastCall ?? [];
      const launched = (launch as { config: ThreadConfig }).config;
      expect(launched).toMatchObject({ ...tuple, selectionBinding: binding });
      expect(
        selectionBindingMatches(launched.selectionBinding, { owner, selection: launched }),
      ).toBe(true);
    });
  });

  it("rejects a Fast hole visibly without changing the saved draft", async () => {
    useSharedSettings.setState({
      providerConfigs: {
        devin: {
          model: "f-alpha-x-high",
          effort: "",
          fast: false,
          mode: "agent",
          approvalPolicy: "normal",
          sandboxMode: "",
        },
      },
      lastPresentationModeByAgent: { devin: "terminal" },
    });
    const dangerSpy = vi
      .spyOn(toast, "danger")
      .mockImplementation(() => undefined as unknown as ReturnType<typeof toast.danger>);
    renderFamilyDraft();
    await waitFor(() => expect(persistedDraft()?.model).toBe("f-alpha-x-high"));
    // (alpha, x, high, Fast) is a hole: the toggle shows the disabled treatment.
    const fast = fastToggle();
    expect(fast?.isSelected).toBe(false);
    expect(fast?.disabledReason).toBeTruthy();
    act(() => fast?.onChange(true));
    expect(dangerSpy).toHaveBeenCalled();
    expect(persistedDraft()).toMatchObject({
      model: "f-alpha-x-high",
      effort: "",
      fast: false,
    });
    dangerSpy.mockRestore();
  });

  it("keeps GUI independent carriers when a Lead edit picks a sibling pair", async () => {
    const toastDanger = vi
      .spyOn(toast, "danger")
      .mockImplementation(() => undefined as unknown as ReturnType<typeof toast.danger>);
    useSharedSettings.setState({
      providerConfigs: {
        devin: {
          model: "pair-alpha-x",
          effort: "high",
          fast: true,
          mode: "agent",
          approvalPolicy: "",
          sandboxMode: "",
        },
      },
    });
    renderFamilyDraft();
    await waitFor(() => expect(persistedDraft()?.model).toBe("pair-alpha-x"));
    // The draft picker renders the projected family row plus exactly one
    // paired effort-context control carrying the two conditional selector
    // columns from the GUI override; the ordinary effort carrier stays beside
    // it as the shortcut/cycle target.
    await waitFor(() => expect(pairedSelectorControl()).toBeDefined());
    expect(
      composerControls().filter(
        (control) => control.kind === "effort-context" && control.familySelection !== undefined,
      ),
    ).toHaveLength(1);
    const paired = pairedSelectorControl();
    expect(paired?.effortValue).toBe("high");
    const columns = paired?.familySelection.columns ?? [];
    expect(columns).toHaveLength(2);
    const [lead, sidekick] = columns;
    expect(lead?.id).toBe("lead");
    expect(sidekick?.id).toBe("sidekick");
    // The columns carry the exact selected pair (alpha, x).
    expect(lead?.models.value).toBe("alpha");
    expect(sidekick?.models.value).toBe("x");
    expect(sidekick?.models.options.map((option) => option.id)).toEqual(["x", "y"]);
    // The reduced accepted inventory restricts the reachable coordinates: the
    // beta pairs are the absent self-pair analog and never appear, so a Lead
    // edit outside the offered ladder is a guarded no-op.
    expect(lead?.models.options.map((option) => option.id)).toEqual(["alpha"]);
    act(() => lead?.models.onChange("beta"));
    expect(persistedDraft()).toMatchObject({
      model: "pair-alpha-x",
      effort: "high",
      fast: true,
    });

    // A pick of a UID the accepted inventory does not advertise is a visible
    // hole: the draft rejects it without changing the saved draft.
    const providerModel = composerControls().find(
      (control) => control.kind === "provider-model",
    ) as { onChange: (next: { agentKind: string; model: string }) => void };
    act(() => providerModel.onChange({ agentKind: "devin", model: "pair-beta-x" }));
    expect(toastDanger).toHaveBeenCalled();
    expect(persistedDraft()).toMatchObject({
      model: "pair-alpha-x",
      effort: "high",
      fast: true,
    });

    // The explicit model pick of the sibling pair keeps the independent
    // effort/Fast carriers untouched.
    act(() => providerModel.onChange({ agentKind: "devin", model: "pair-alpha-y" }));
    await waitFor(() => expect(persistedDraft()?.model).toBe("pair-alpha-y"));
    expect(persistedDraft()).toMatchObject({ effort: "high", fast: true });

    // The paired Sidekick column callback resolves the exact sibling-pair UID
    // the same way, and the paired effort ladder edits only the effort
    // carrier. This surface has no Fast toggle at all, yet the true carrier
    // survives every edit untouched.
    const sidekickAfter = pairedSelectorControl()?.familySelection.columns[1];
    expect(sidekickAfter?.models.value).toBe("y");
    act(() => sidekickAfter?.models.onChange("x"));
    await waitFor(() => expect(persistedDraft()?.model).toBe("pair-alpha-x"));
    act(() => pairedSelectorControl()?.onEffortChange("low"));
    await waitFor(() => expect(persistedDraft()?.effort).toBe("low"));
    expect(persistedDraft()).toMatchObject({
      model: "pair-alpha-x",
      effort: "low",
      fast: true,
    });
    expect(fastToggle()).toBeUndefined();
    toastDanger.mockRestore();
  });

  it("retains an explicit GUI Fast-off choice through edits, reload and capability refresh", async () => {
    useSharedSettings.setState({
      providerConfigs: {
        devin: {
          model: "pair-alpha-x",
          effort: "low",
          fast: false,
          mode: "agent",
          approvalPolicy: "normal",
          sandboxMode: "",
        },
      },
      lastPresentationModeByAgent: { devin: "gui" },
    });
    const view = renderFamilyDraft();
    await waitFor(() => {
      const paired = pairedSelectorControl();
      expect(paired?.familySelection.columns).toHaveLength(2);
    });
    // The paired control carries the exact current pair (alpha, x).
    expect(
      pairedSelectorControl()?.familySelection.columns.map((column) => column.models.value),
    ).toEqual(["alpha", "x"]);
    const plan = composerControls().find(
      (control) =>
        control.kind === "toggle" && (control.label === "Work" || control.label === "Plan"),
    ) as {
      onChange: (selected: boolean) => void;
    };
    act(() => plan.onChange(true));
    await waitFor(() =>
      expect(persistedDraft()).toMatchObject({
        model: "pair-alpha-x",
        effort: "low",
        fast: false,
        mode: "plan",
      }),
    );
    view.unmount();
    const refreshed: AgentStatus = {
      ...familyAgentStatus,
      capabilities: {
        ...familyAgentStatus.capabilities,
        presentationCapabilities: {
          gui: {
            ...familyAgentStatus.capabilities.presentationCapabilities!.gui!,
            fastModels: ["pair-alpha-x", "pair-alpha-y"],
          },
        },
      },
    };
    render(<ThreadDraftView project={project} agentStatuses={[refreshed]} onStart={() => {}} />);
    await waitFor(() => expect(fastToggle()).toBeDefined());
    // The capability refresh (Fast becomes available) neither flips the
    // retained Fast-off carrier nor disturbs the exact pair.
    expect(fastToggle()?.isSelected).toBe(false);
    expect(
      pairedSelectorControl()?.familySelection.columns.map((column) => column.models.value),
    ).toEqual(["alpha", "x"]);
    expect(persistedDraft()).toMatchObject({ model: "pair-alpha-x", effort: "low", fast: false });
    // The ordinary composer Fast toggle is the only Fast carrier writer here:
    // an explicit flip lands on the config for the same pair, and flipping
    // back restores the retained off choice.
    act(() => fastToggle()?.onChange(true));
    await waitFor(() => expect(persistedDraft()?.fast).toBe(true));
    expect(persistedDraft()).toMatchObject({ model: "pair-alpha-x", effort: "low", fast: true });
    act(() => fastToggle()?.onChange(false));
    await waitFor(() => expect(persistedDraft()?.fast).toBe(false));
    expect(persistedDraft()).toMatchObject({ model: "pair-alpha-x", effort: "low", fast: false });
    expect(fastToggle()?.isSelected).toBe(false);
  });

  it("maps an encoded selection exactly onto the Chat surface before committing the switch", async () => {
    const toastDanger = vi
      .spyOn(toast, "danger")
      .mockImplementation(() => undefined as unknown as ReturnType<typeof toast.danger>);
    useSharedSettings.setState({
      lastPresentationModeByAgent: { devin: "terminal" },
      providerConfigs: {
        devin: {
          model: "f-alpha-x-low-fast",
          effort: "",
          fast: false,
          mode: "agent",
          approvalPolicy: "normal",
          sandboxMode: "",
        },
      },
    });
    // The GUI pair can carry the mapped Fast coordinate on this surface.
    const refreshed: AgentStatus = {
      ...familyAgentStatus,
      capabilities: {
        ...familyAgentStatus.capabilities,
        presentationCapabilities: {
          gui: {
            ...familyAgentStatus.capabilities.presentationCapabilities!.gui!,
            fastModels: ["pair-alpha-x", "pair-alpha-y"],
          },
        },
      },
    };
    render(<ThreadDraftView project={project} agentStatuses={[refreshed]} onStart={() => {}} />);
    await waitFor(() => expect(persistedDraft()?.model).toBe("f-alpha-x-low-fast"));

    fireEvent.click(screen.getByRole("tab", { name: "Chat" }));

    // The encoded (alpha, x, low, fast) tuple maps onto the accepted pair with
    // preserved independent carriers, and the mode commits only with the patch.
    await waitFor(() =>
      expect(persistedDraft()).toMatchObject({
        model: "pair-alpha-x",
        effort: "low",
        fast: true,
      }),
    );
    expect(toastDanger).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: "Chat" })).toHaveAttribute("aria-selected", "true");
    const picker = composerControls().find((control) => control.kind === "provider-model") as
      | { currentModel: string; presentationMode: string }
      | undefined;
    expect(picker?.currentModel).toBe("pair-alpha-x");
    expect(picker?.presentationMode).toBe("gui");
    toastDanger.mockRestore();
  });

  it("retains the surface and draft when the Chat mapping is unprovable", async () => {
    const toastDanger = vi
      .spyOn(toast, "danger")
      .mockImplementation(() => undefined as unknown as ReturnType<typeof toast.danger>);
    useSharedSettings.setState({
      lastPresentationModeByAgent: { devin: "terminal" },
      providerConfigs: {
        devin: {
          model: "f-alpha-x-low-fast",
          effort: "",
          fast: false,
          mode: "agent",
          approvalPolicy: "normal",
          sandboxMode: "",
        },
      },
    });
    renderFamilyDraft();
    await waitFor(() => expect(persistedDraft()?.model).toBe("f-alpha-x-low-fast"));

    // The GUI override's pair cannot carry Fast, so the encoded Fast state has
    // no declared carrier on the target surface.
    fireEvent.click(screen.getByRole("tab", { name: "Chat" }));

    expect(toastDanger).toHaveBeenCalledTimes(1);
    // Mode and config are both retained.
    expect(screen.getByRole("tab", { name: "CLI" })).toHaveAttribute("aria-selected", "true");
    expect(persistedDraft()).toMatchObject({
      model: "f-alpha-x-low-fast",
      effort: "",
      fast: false,
    });
    toastDanger.mockRestore();
  });

  it("maps independent GUI carriers onto the encoded CLI tuple on the way back", async () => {
    const toastDanger = vi
      .spyOn(toast, "danger")
      .mockImplementation(() => undefined as unknown as ReturnType<typeof toast.danger>);
    useSharedSettings.setState({
      lastPresentationModeByAgent: { devin: "gui" },
      providerConfigs: {
        devin: {
          model: "pair-alpha-x",
          effort: "low",
          fast: true,
          mode: "agent",
          approvalPolicy: "normal",
          sandboxMode: "",
        },
      },
    });
    renderFamilyDraft();
    await waitFor(() => expect(persistedDraft()?.model).toBe("pair-alpha-x"));

    fireEvent.click(screen.getByRole("tab", { name: "CLI" }));

    // (alpha, x) with independent low + Fast resolves the exact encoded member
    // and stores the inert seeds.
    await waitFor(() =>
      expect(persistedDraft()).toMatchObject({
        model: "f-alpha-x-low-fast",
        effort: "",
        fast: false,
      }),
    );
    expect(toastDanger).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: "CLI" })).toHaveAttribute("aria-selected", "true");
    toastDanger.mockRestore();
  });

  it("resolves a picker row that carries a different surface through the transition", async () => {
    const toastDanger = vi
      .spyOn(toast, "danger")
      .mockImplementation(() => undefined as unknown as ReturnType<typeof toast.danger>);
    useSharedSettings.setState({
      lastPresentationModeByAgent: { devin: "terminal" },
      providerConfigs: {
        devin: {
          model: "f-alpha-x-low",
          effort: "",
          fast: false,
          mode: "agent",
          approvalPolicy: "normal",
          sandboxMode: "",
        },
      },
    });
    const refreshed: AgentStatus = {
      ...familyAgentStatus,
      capabilities: {
        ...familyAgentStatus.capabilities,
        presentationCapabilities: {
          gui: {
            ...familyAgentStatus.capabilities.presentationCapabilities!.gui!,
            fastModels: ["pair-alpha-x", "pair-alpha-y"],
          },
        },
      },
    };
    render(<ThreadDraftView project={project} agentStatuses={[refreshed]} onStart={() => {}} />);
    await waitFor(() => expect(persistedDraft()?.model).toBe("f-alpha-x-low"));

    const picker = composerControls().find((control) => control.kind === "provider-model") as {
      onChange: (next: Record<string, unknown>) => void;
    };
    act(() => {
      picker.onChange({
        agentKind: "devin",
        model: "pair-alpha-x",
        presentationMode: "gui",
        selectionIntent: "family",
      });
    });

    await waitFor(() =>
      expect(persistedDraft()).toMatchObject({
        model: "pair-alpha-x",
        effort: "low",
        fast: false,
      }),
    );
    expect(toastDanger).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: "Chat" })).toHaveAttribute("aria-selected", "true");
    toastDanger.mockRestore();
  });

  it("selects the exact encoded member for an exact favorite of the representative", async () => {
    useSharedSettings.setState({
      lastPresentationModeByAgent: { devin: "terminal" },
      providerConfigs: {
        devin: {
          model: "f-alpha-x-high",
          effort: "",
          fast: false,
          mode: "agent",
          approvalPolicy: "normal",
          sandboxMode: "",
        },
      },
    });
    renderFamilyDraft();
    await waitFor(() => expect(persistedDraft()?.model).toBe("f-alpha-x-high"));

    const picker = composerControls().find((control) => control.kind === "provider-model") as {
      onChange: (next: Record<string, unknown>) => void;
    };
    // The exact favorite of the representative (the low member) must restore
    // that exact member — never collapse into the family-row no-op.
    act(() => {
      picker.onChange({
        agentKind: "devin",
        model: "f-alpha-x-low",
        selectionIntent: "exact",
      });
    });

    await waitFor(() =>
      expect(persistedDraft()).toMatchObject({
        model: "f-alpha-x-low",
        effort: "",
        fast: false,
      }),
    );
  });

  // A cross-provider target: GUI-only (its picker rows carry a different
  // surface than the terminal draft), with its own encoded relation plus a
  // plain model — the shapes the source-family mapping must never override.
  const crossTargetDescriptor = {
    model: "tf-default",
    label: "Target Fusion",
    selectors: terminalDescriptor.selectors,
    bindings: { effort: "model" as const, fast: "model" as const },
    members: [
      {
        model: "tf-default",
        selections: { lead: "alpha", sidekick: "x" },
        effort: "low",
        fast: false,
      },
      {
        model: "tf-alt",
        selections: { lead: "beta", sidekick: "x" },
        effort: "high",
        fast: false,
      },
    ],
  };
  const crossTargetAgentStatus: AgentStatus = {
    kind: "kimi",
    label: "Kimi",
    installed: true,
    authState: "authenticated",
    capabilities: {
      models: [
        { id: "plain-fast", label: "Plain Fast" },
        { id: "tf-default", label: "Target Fusion" },
        { id: "tf-alt", label: "Target Fusion (Beta)" },
      ],
      efforts: [],
      modelEfforts: {},
      modes: ["agent"],
      approvalPolicies: [{ id: "default", label: "Default" }],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "server",
      presentationMode: "gui",
      presentationModes: ["gui"],
      settingDefs: [],
      modelFamilies: [crossTargetDescriptor],
    },
  };

  function renderCrossTargetDraft() {
    return render(
      <ThreadDraftView
        project={project}
        agentStatuses={[familyAgentStatus, crossTargetAgentStatus]}
        onStart={() => {}}
      />,
    );
  }

  function crossPicker() {
    return composerControls().find((control) => control.kind === "provider-model") as {
      onChange: (next: Record<string, unknown>) => void;
    };
  }

  it("selects the clicked plain row of another provider even when the surface differs", async () => {
    const toastDanger = vi
      .spyOn(toast, "danger")
      .mockImplementation(() => undefined as unknown as ReturnType<typeof toast.danger>);
    useSharedSettings.setState({
      lastPresentationModeByAgent: { devin: "terminal" },
      providerConfigs: {
        devin: {
          model: "f-alpha-x-low",
          effort: "",
          fast: false,
          mode: "agent",
          approvalPolicy: "normal",
          sandboxMode: "",
        },
      },
    });
    renderCrossTargetDraft();
    await waitFor(() => expect(persistedDraft()?.model).toBe("f-alpha-x-low"));

    act(() => {
      crossPicker().onChange({
        agentKind: "kimi",
        model: "plain-fast",
        presentationMode: "gui",
        selectionIntent: "exact",
      });
    });

    // The clicked exact row wins at its own surface: the source family tuple
    // must not be mapped over it, and the pick must not be blocked even though
    // the target relation cannot carry the source coordinates.
    await waitFor(() => {
      const props = composerSpy.mock.lastCall?.[0] as {
        controls: Array<{
          kind?: string;
          currentAgentKind?: string;
          currentModel?: string;
          presentationMode?: string;
        }>;
      };
      const picker = props.controls.find((control) => control.kind === "provider-model");
      expect(picker?.currentAgentKind).toBe("kimi");
      expect(picker?.currentModel).toBe("plain-fast");
      expect(picker?.presentationMode).toBe("gui");
    });
    expect(useSharedSettings.getState().providerConfigs.kimi).toMatchObject({
      model: "plain-fast",
    });
    expect(toastDanger).not.toHaveBeenCalled();
    // The source provider's draft survives the switch as its own snapshot.
    expect(persistedDraft()).toMatchObject({ model: "f-alpha-x-low", effort: "", fast: false });
    toastDanger.mockRestore();
  });

  it("adopts the target family's declared default for an explicit cross-provider family pick", async () => {
    const toastDanger = vi
      .spyOn(toast, "danger")
      .mockImplementation(() => undefined as unknown as ReturnType<typeof toast.danger>);
    // A meaningful stored effort on the encoded source member leaves the
    // source-to-target mapping unprovable — the explicit clicked row must
    // still resolve at the target surface on its own terms.
    useSharedSettings.setState({
      lastPresentationModeByAgent: { devin: "terminal" },
      providerConfigs: {
        devin: {
          model: "f-alpha-x-low",
          effort: "high",
          fast: false,
          mode: "agent",
          approvalPolicy: "normal",
          sandboxMode: "",
        },
      },
    });
    renderCrossTargetDraft();
    await waitFor(() => expect(persistedDraft()?.model).toBe("f-alpha-x-low"));

    act(() => {
      crossPicker().onChange({
        agentKind: "kimi",
        model: "tf-default",
        presentationMode: "gui",
        selectionIntent: "family",
      });
    });

    // The declared default member is adopted atomically with inert seeds —
    // never a no-op that keeps the source selection, and never the mapped
    // source tuple.
    await waitFor(() =>
      expect(useSharedSettings.getState().providerConfigs.kimi).toMatchObject({
        model: "tf-default",
        effort: "",
        fast: false,
      }),
    );
    expect(screen.getByRole("tab", { name: "Chat" })).toHaveAttribute("aria-selected", "true");
    expect(toastDanger).not.toHaveBeenCalled();
    // The source provider's rejected-but-saved carrier snapshot is untouched.
    expect(persistedDraft()).toMatchObject({ model: "f-alpha-x-low", effort: "high", fast: false });
    toastDanger.mockRestore();
  });

  it("adopts a new profile's family default even when profiles share the source member UID", async () => {
    useSharedSettings.setState({
      lastPresentationModeByAgent: { devin: "terminal" },
      providerConfigs: {
        devin: {
          model: "f-alpha-x-high",
          effort: "",
          fast: false,
          mode: "agent",
          approvalPolicy: "normal",
          sandboxMode: "",
        },
      },
    });
    const overlappingTarget: AgentStatus = {
      ...crossTargetAgentStatus,
      capabilities: {
        ...crossTargetAgentStatus.capabilities,
        models: crossTargetAgentStatus.capabilities.models.map((entry) =>
          entry.id === "tf-alt" ? { ...entry, id: "f-alpha-x-high" } : entry,
        ),
        modelFamilies: [
          {
            ...crossTargetDescriptor,
            members: crossTargetDescriptor.members.map((entry) =>
              entry.model === "tf-alt" ? { ...entry, model: "f-alpha-x-high" } : entry,
            ),
          },
        ],
      },
    };
    render(
      <ThreadDraftView
        project={project}
        agentStatuses={[familyAgentStatus, overlappingTarget]}
        onStart={() => {}}
      />,
    );
    await waitFor(() => expect(persistedDraft()?.model).toBe("f-alpha-x-high"));
    act(() =>
      crossPicker().onChange({
        agentKind: "kimi",
        model: "tf-default",
        presentationMode: "gui",
        selectionIntent: "family",
      }),
    );
    await waitFor(() =>
      expect(useSharedSettings.getState().providerConfigs.kimi).toMatchObject({
        model: "tf-default",
        effort: "",
        fast: false,
      }),
    );
    expect(persistedDraft()?.model).toBe("f-alpha-x-high");
  });
});
