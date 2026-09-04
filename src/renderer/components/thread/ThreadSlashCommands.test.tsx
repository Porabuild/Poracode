import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@/renderer/components/providers/bootstrap";
import type {
  AgentStatus,
  Project,
  PromptSegment,
  SkillScanResult,
  Thread,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { AppProvider } from "@/renderer/components/ui/provider";
import { useAppStore } from "@/renderer/state/appStore";
import { useComposerInputInbox } from "@/renderer/state/composerInputInbox";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { seedBuiltInPlugins } from "@/renderer/testUtils/plugins";
import { ThreadDraftComposerArea } from "./ThreadDraftComposerArea";
import type { ComposerControl } from "./ThreadComposer";
import { ThreadView } from "./ThreadView";
import {
  bindLeadingSkillInvocation,
  filterSlashCommands,
  rebindSkillSegments,
  resolveAvailableSlashCommands,
} from "./threadSlashCommands";

const { bridge } = vi.hoisted(() => ({
  bridge: {
    platform: "win32",
    searchProjectFiles: vi
      .fn<() => Promise<{ entries: []; totalIndexed: number }>>()
      .mockResolvedValue({ entries: [], totalIndexed: 0 }),
    dbGetThreadRuntimeItems: vi.fn<() => Promise<[]>>().mockResolvedValue([]),
    dbGetThreadCompletedTurns: vi.fn<() => Promise<[]>>().mockResolvedValue([]),
    dbGetThreadContextUsage: vi.fn<() => Promise<null>>().mockResolvedValue(null),
    pickFiles: vi.fn<() => Promise<string[] | undefined>>().mockResolvedValue(undefined),
    saveClipboardImage: vi
      .fn<(input: { threadId: string; data: Uint8Array; extension: string }) => Promise<string>>()
      .mockResolvedValue("C:\\attachments\\draft-project-1\\image-1.png"),
    writeTerminal: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    scanSkills: vi.fn<() => Promise<SkillScanResult>>().mockResolvedValue({
      skills: [],
      effectiveSkillIds: [],
      invocation: null,
      issues: [],
      canLinkToGlobal: true,
    }),
  },
}));

vi.mock("../../bridge", () => ({
  readBridge: () => bridge,
  isRemoteSession: () => false,
  isDevApp: () => false,
}));

vi.mock("./TerminalPane", () => ({
  TerminalPane: () => <div>terminal pane</div>,
}));

function mockSelection(node: Node, offset: number) {
  const selection = {
    isCollapsed: true,
    anchorNode: node,
    anchorOffset: offset,
    focusNode: node,
    focusOffset: offset,
    rangeCount: 1,
    getRangeAt: () => {
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, offset);
      return range;
    },
    removeAllRanges: vi.fn<() => void>(),
    addRange: vi.fn<(range: Range) => void>(),
  };
  vi.stubGlobal("getSelection", () => selection);
}

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "ACP chat",
    agentKind: "gemini",
    config: { model: "gemini-2.5-pro" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: true,
    archived: false,
    done: false,
    starred: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    presentationMode: "gui",
    ...overrides,
  };
}

function makeAgentStatus(overrides: Partial<AgentStatus> = {}): AgentStatus {
  return {
    kind: "gemini",
    label: "Gemini",
    installed: true,
    authState: "authenticated",
    capabilities: {
      models: [{ id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" }],
      efforts: [],
      modelEfforts: {},
      modes: ["agent"],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "server",
      presentationMode: "gui",
      presentationModes: ["gui"],
      settingDefs: [],
      slashCommands: [{ id: "help", label: "help — Show help", description: "Show help" }],
    },
    ...overrides,
  };
}

const draftProject: Project = {
  id: "project-1",
  name: "Poracode",
  location: { kind: "posix", path: "/tmp/poracode" },
  createdAt: new Date().toISOString(),
};

async function renderThread(thread: Thread, agentStatus: AgentStatus) {
  await act(async () => {
    render(
      <AppProvider>
        <ThreadView
          thread={thread}
          agentStatus={agentStatus}
          projectLocation={{ kind: "posix", path: "/tmp/poracode" }}
        />
      </AppProvider>,
    );
  });
}

async function renderDraftComposer(
  selectedAgent: AgentStatus,
  onStart = vi.fn<(input: unknown) => void>(),
  presentationMode: ThreadPresentationMode = "terminal",
  onConfigChange = vi.fn<(patch: Partial<Thread["config"]>) => void>(),
  controls: ComposerControl[] = [],
  config: Thread["config"] = {
    model: selectedAgent.capabilities.models[0]?.id ?? "gemini-2.5-pro",
  },
  paneId?: string,
) {
  await act(async () => {
    render(
      <AppProvider>
        <ThreadDraftComposerArea
          project={draftProject}
          {...(paneId ? { paneId } : {})}
          selectedAgent={selectedAgent}
          controls={controls}
          config={config}
          compact={false}
          paneCount={1}
          gitBranch={undefined}
          worktreeMode={false}
          supportsModePicker={false}
          presentationMode={presentationMode}
          onConfigChange={onConfigChange}
          onWorktreeModeChange={() => {}}
          onSwitchBranch={() => {}}
          onRememberPresentationMode={() => {}}
          onStart={onStart}
        />
      </AppProvider>,
    );
  });
  return onStart;
}

function typeSlashQuery(editor: HTMLElement, query: string) {
  const textNode = document.createTextNode(query);
  editor.innerHTML = "";
  editor.appendChild(textNode);
  mockSelection(textNode, query.length);
  fireEvent.input(editor);
}

describe("ThreadSlashCommands", () => {
  const scrollIntoView = vi.fn<(options?: ScrollIntoViewOptions) => void>();

  beforeEach(() => {
    vi.clearAllMocks();
    bridge.scanSkills.mockResolvedValue({
      skills: [],
      effectiveSkillIds: [],
      invocation: null,
      issues: [],
      canLinkToGlobal: true,
    });
    vi.unstubAllGlobals();
    useAppStore.getState().clearDraftContent(draftProject.id);
    useAppStore.setState({ draftContentDiscardRequests: {}, pendingComposerSeeds: {} });
    useComposerInputInbox.setState({ itemsByComposer: {} });
    useSharedSettings.setState({
      collapseTerminalComposer: false,
      disabledBuiltInMcpServers: {},
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
  });

  it("renders thread-scoped ACP slash commands in the composer panel", async () => {
    await renderThread(
      makeThread({
        slashCommands: [
          {
            id: "review",
            label: "review — Review the diff",
            description: "Review the diff",
          },
          {
            id: "plan",
            label: "plan — Draft a plan",
            description: "Draft a plan",
          },
        ],
      }),
      makeAgentStatus(),
    );

    const editor = screen.getByRole("textbox");
    typeSlashQuery(editor, "/re");

    expect(screen.getByText("Commands")).toBeInTheDocument();
    expect(screen.getByText("/review")).toBeInTheDocument();
    expect(screen.queryByText("/help")).not.toBeInTheDocument();
  });

  it("renders localized skill copy while filtering by its stable invocation id", async () => {
    await renderThread(
      makeThread({
        slashCommands: [
          {
            id: "browser-control",
            label:
              "Control del navegador — Navega, inspecciona y prueba páginas con el MCP del navegador integrado.",
            description: "Navega, inspecciona y prueba páginas con el MCP del navegador integrado.",
            section: "skills",
            skillName: "browser-control",
            skillPath: "/plugins/browser-tools/browser-control/SKILL.md",
            skillInvocation: "$browser-control",
            skillProvider: "Herramientas del navegador",
            skillScope: "global",
          },
        ],
      }),
      makeAgentStatus(),
    );

    const editor = screen.getByRole("textbox");
    typeSlashQuery(editor, "/browser");

    expect(screen.getByText("browser-control")).toBeInTheDocument();
    expect(
      screen.getByText("Navega, inspecciona y prueba páginas con el MCP del navegador integrado."),
    ).toBeInTheDocument();
    expect(screen.getByText(/Herramientas del navegador/iu)).toBeInTheDocument();
  });

  it("supports keyboard navigation, scrolling, and insertion", async () => {
    await renderThread(
      makeThread({
        slashCommands: [
          {
            id: "plan",
            label: "plan — Draft a plan",
            description: "Draft a plan",
          },
          {
            id: "review",
            label: "review — Review the diff",
            description: "Review the diff",
          },
        ],
      }),
      makeAgentStatus(),
    );

    const editor = screen.getByRole("textbox");
    typeSlashQuery(editor, "/");

    scrollIntoView.mockClear();
    fireEvent.keyDown(editor, { key: "ArrowDown" });

    const options = screen.getAllByRole("option");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(scrollIntoView).toHaveBeenCalled();

    fireEvent.keyDown(editor, { key: "Enter" });

    expect(screen.queryByText("Commands")).not.toBeInTheDocument();
    expect(editor.textContent).toBe("/review ");
  });

  it("renders thread-scoped slash commands in the terminal composer", async () => {
    const baseCapabilities = makeAgentStatus().capabilities;
    await renderThread(
      makeThread({
        presentationMode: "terminal",
        slashCommands: [
          {
            id: "review",
            label: "review — Review the diff",
            description: "Review the diff",
          },
        ],
      }),
      makeAgentStatus({
        capabilities: {
          ...baseCapabilities,
          liveInputMode: "terminal",
          presentationMode: "terminal",
          presentationModes: ["terminal"],
          slashCommands: [{ id: "help", label: "help — Show help", description: "Show help" }],
        },
      }),
    );

    const editor = screen.getByRole("textbox");
    typeSlashQuery(editor, "/re");

    expect(screen.getByText("Commands")).toBeInTheDocument();
    expect(screen.getByText("/review")).toBeInTheDocument();
    expect(screen.queryByText("/help")).not.toBeInTheDocument();
  });

  it("falls back to capability slash commands in the terminal composer", async () => {
    const baseCapabilities = makeAgentStatus().capabilities;
    await renderThread(
      makeThread({ presentationMode: "terminal" }),
      makeAgentStatus({
        capabilities: {
          ...baseCapabilities,
          liveInputMode: "terminal",
          presentationMode: "terminal",
          presentationModes: ["terminal"],
          slashCommands: [{ id: "help", label: "help — Show help", description: "Show help" }],
        },
      }),
    );

    const editor = screen.getByRole("textbox");
    typeSlashQuery(editor, "/he");

    expect(screen.getByText("Commands")).toBeInTheDocument();
    expect(screen.getByText("/help")).toBeInTheDocument();
  });

  it("shows Poracode Codex server commands instead of CLI commands in GUI chat composer", async () => {
    const baseCapabilities = makeAgentStatus().capabilities;
    await renderThread(
      makeThread({
        agentKind: "codex",
        presentationMode: "gui",
      }),
      makeAgentStatus({
        kind: "codex",
        label: "Codex",
        capabilities: {
          ...baseCapabilities,
          liveInputMode: "server",
          presentationMode: "terminal",
          presentationModes: ["terminal", "gui"],
          slashCommands: [
            {
              id: "status",
              label: "status - Display session configuration and token usage",
              description: "Display session configuration and token usage",
            },
          ],
        },
      }),
    );

    const editor = screen.getByRole("textbox");
    typeSlashQuery(editor, "/");

    expect(screen.getByText("Commands")).toBeInTheDocument();
    expect(screen.getByText("/model")).toBeInTheDocument();
    expect(screen.getByText("/plan")).toBeInTheDocument();
    expect(screen.getByText("/agent")).toBeInTheDocument();
    expect(screen.getByText("/goal")).toBeInTheDocument();
    expect(screen.queryByText("/status")).not.toBeInTheDocument();
  });

  it("shows Poracode Codex server commands instead of CLI commands in GUI draft composer", async () => {
    const baseCapabilities = makeAgentStatus().capabilities;
    await renderDraftComposer(
      makeAgentStatus({
        kind: "codex",
        label: "Codex",
        capabilities: {
          ...baseCapabilities,
          liveInputMode: "server",
          presentationMode: "terminal",
          presentationModes: ["terminal", "gui"],
          slashCommands: [
            {
              id: "status",
              label: "status - Display session configuration and token usage",
              description: "Display session configuration and token usage",
            },
          ],
        },
      }),
      undefined,
      "gui",
    );

    const editor = screen.getByRole("textbox");
    typeSlashQuery(editor, "/");

    expect(screen.getByText("Commands")).toBeInTheDocument();
    expect(screen.getByText("/model")).toBeInTheDocument();
    expect(screen.getByText("/plan")).toBeInTheDocument();
    expect(screen.getByText("/agent")).toBeInTheDocument();
    expect(screen.getByText("/goal")).toBeInTheDocument();
    expect(screen.queryByText("/status")).not.toBeInTheDocument();
  });

  it("shows effective skills in a separate group and submits structured metadata", async () => {
    bridge.scanSkills.mockResolvedValue({
      skills: [
        {
          id: "global:review-code",
          name: "review-code",
          description: "Review a patch",
          folderName: "review-code",
          absolutePath: "C:\\Users\\me\\.agents\\skills\\review-code",
          skillFilePath: "C:\\Users\\me\\.agents\\skills\\review-code\\SKILL.md",
          rootPath: "C:\\Users\\me\\.agents\\skills",
          providerId: "agents",
          providerLabel: "Shared",
          scope: "global",
          scopeLabel: "Global",
          origin: "managed",
          enabled: true,
          mutable: true,
          valid: true,
          linked: false,
        },
      ],
      effectiveSkillIds: ["global:review-code"],
      invocation: "dollar",
      issues: [],
      canLinkToGlobal: true,
    });
    const onStart = vi.fn<(input: unknown) => void>();
    const status = makeAgentStatus({ kind: "codex", label: "Codex" });
    await renderDraftComposer(status, onStart, "gui");

    const editor = screen.getByRole("textbox");
    typeSlashQuery(editor, "/");

    expect(await screen.findByText("Skills")).toBeInTheDocument();
    expect(screen.getByText("review-code")).toBeInTheDocument();
    fireEvent.click(screen.getByText("review-code"));
    fireEvent.keyDown(editor, { key: "Enter" });

    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "$review-code",
        segments: [
          {
            kind: "skill",
            name: "review-code",
            path: "C:\\Users\\me\\.agents\\skills\\review-code\\SKILL.md",
            invocation: "$review-code",
            provider: "Shared",
            scope: "global",
          },
          { kind: "text", content: " " },
        ],
      }),
    );
  });

  it("rebinds a saved skill chip to the currently selected provider", () => {
    expect(
      rebindSkillSegments(
        [
          {
            kind: "skill",
            name: "review-code",
            path: "/old/SKILL.md",
            invocation: "$review-code",
            provider: "Codex",
            scope: "global",
          },
        ],
        [
          {
            id: "review-code",
            label: "review-code",
            section: "skills",
            skillName: "review-code",
            skillPath: "/project/.gemini/skills/review-code/SKILL.md",
            skillInvocation: "/review-code",
            skillProvider: "Gemini",
            skillScope: "project",
          },
        ],
        (name) => `Use the ${name} skill.`,
      ),
    ).toEqual([
      {
        kind: "skill",
        name: "review-code",
        path: "/project/.gemini/skills/review-code/SKILL.md",
        invocation: "/review-code",
        provider: "Gemini",
        scope: "project",
      },
    ]);
  });

  it("binds typed leading skill text to a skill segment with the provider invocation", () => {
    expect(
      bindLeadingSkillInvocation(
        [{ kind: "text", content: "/skill-creator Create a new managed skill." }],
        [
          {
            id: "skill-creator",
            label: "skill-creator",
            section: "skills",
            skillName: "skill-creator",
            skillPath: "/bundled/skill-creator/SKILL.md",
            skillInvocation: "Use the skill-creator skill.",
            skillProvider: "Poracode built-ins",
            skillScope: "global",
          },
        ],
      ),
    ).toEqual([
      {
        kind: "skill",
        name: "skill-creator",
        path: "/bundled/skill-creator/SKILL.md",
        invocation: "Use the skill-creator skill.",
        provider: "Poracode built-ins",
        scope: "global",
      },
      { kind: "text", content: " Create a new managed skill." },
    ]);
  });

  it("leaves segments alone when no skill matches or a skill chip is already present", () => {
    const noMatch: PromptSegment[] = [{ kind: "text", content: "/unknown do something" }];
    expect(bindLeadingSkillInvocation(noMatch, [])).toEqual(noMatch);

    const withChip: PromptSegment[] = [
      {
        kind: "skill",
        name: "review-code",
        path: "/skills/review-code/SKILL.md",
        invocation: "/review-code",
        provider: "Shared",
        scope: "global",
      },
      { kind: "text", content: "/skill-creator too" },
    ];
    expect(
      bindLeadingSkillInvocation(withChip, [
        {
          id: "skill-creator",
          label: "skill-creator",
          section: "skills",
          skillName: "skill-creator",
          skillPath: "/bundled/skill-creator/SKILL.md",
          skillInvocation: "/skill-creator",
          skillProvider: "Poracode built-ins",
          skillScope: "global",
        },
      ]),
    ).toEqual(withChip);
  });

  it("filters provider-native disabled skills from local discovery", () => {
    expect(
      resolveAvailableSlashCommands(undefined, undefined, {
        skillCommands: [
          {
            id: "review-code",
            label: "review-code",
            section: "skills",
            skillName: "review-code",
            skillPath: "/skills/review-code/SKILL.md",
            skillInvocation: "$review-code",
            skillProvider: "Codex",
            skillScope: "global",
          },
        ],
        disabledSkillNames: ["review-code"],
      }),
    ).toEqual([]);
  });

  it("dedupes same-named provider commands and lets the skill entry win the name", () => {
    const commands = resolveAvailableSlashCommands(
      [
        {
          id: "simplify",
          label: "simplify — Review changed code",
          description: "Review changed code",
        },
        {
          id: "simplify",
          label: "simplify — Review changed code (user)",
          description: "Review changed code (user)",
        },
        { id: "security-review", label: "security-review" },
      ],
      undefined,
      {
        skillCommands: [
          {
            id: "simplify",
            label: "simplify",
            section: "skills",
            skillName: "simplify",
            skillPath: "/skills/simplify/SKILL.md",
            skillInvocation: "/simplify",
            skillProvider: "Claude Code",
            skillScope: "global",
          },
        ],
      },
    );
    expect(commands.map((command) => `${command.id}:${command.section ?? "commands"}`)).toEqual([
      "security-review:commands",
      "simplify:skills",
    ]);
  });

  it("prefers an ACP-provided skill command over the same locally scanned skill", () => {
    const commands = resolveAvailableSlashCommands(
      [
        {
          id: "skill:simplify",
          label: "skill:simplify — Review changed code",
          description: "Review changed code",
          section: "skills",
          skillName: "simplify",
        },
      ],
      undefined,
      {
        skillCommands: [
          {
            id: "simplify",
            label: "simplify — Local skill",
            description: "Local skill",
            section: "skills",
            skillName: "simplify",
            skillPath: "/skills/simplify/SKILL.md",
            skillInvocation: "/simplify",
            skillProvider: "Shared agents",
            skillScope: "project",
          },
        ],
      },
    );

    expect(commands).toEqual([
      {
        id: "skill:simplify",
        label: "skill:simplify — Review changed code",
        description: "Review changed code",
        section: "skills",
        skillName: "simplify",
      },
    ]);
  });

  it("keeps the SKILL.md path when a provider reports a locally scanned skill", () => {
    const local = {
      id: "browser-control",
      label: "browser-control — Drive the browser",
      description: "Drive the browser",
      section: "skills" as const,
      skillName: "browser-control",
      skillPath: "/plugins/browser-tools/skills/browser-control/SKILL.md",
      skillInvocation: "Use the browser-control skill.",
      skillProvider: "Browser",
      skillScope: "global" as const,
      pluginId: "browser-tools",
      pluginName: "Browser",
    };

    const commands = resolveAvailableSlashCommands(
      [
        {
          // Provider-native entry for the same skill: no SKILL.md path.
          id: "browser-control",
          label: "browser-control — Drive the browser",
          description: "Drive the browser",
          section: "skills",
          skillName: "browser-control",
          skillInvocation: "Use the browser-control skill.",
          skillProvider: "Claude",
          skillScope: "global",
        },
      ],
      undefined,
      { skillCommands: [local] },
    );

    expect(commands).toEqual([local]);
  });

  it("finds ACP skill commands by their short display name", () => {
    const command = {
      id: "skill:simplify",
      label: "skill:simplify — Review changed code",
      description: "Review changed code",
      section: "skills" as const,
      skillName: "simplify",
    };

    expect(filterSlashCommands([command], "sim")).toEqual([command]);
    expect(filterSlashCommands([command], "skill:sim")).toEqual([command]);
  });

  it("shows the short skill name but submits the ACP-native command", async () => {
    const baseCapabilities = makeAgentStatus().capabilities;
    const onStart = await renderDraftComposer(
      makeAgentStatus({
        kind: "kimi",
        label: "Kimi Code",
        capabilities: {
          ...baseCapabilities,
          liveInputMode: "server",
          presentationMode: "gui",
          presentationModes: ["terminal", "gui"],
          slashCommands: [
            {
              id: "skill:simplify",
              label: "skill:simplify — Review changed code",
              description: "Review changed code",
              section: "skills",
              skillName: "simplify",
            },
          ],
        },
      }),
      undefined,
      "gui",
    );

    const editor = screen.getByRole("textbox");
    typeSlashQuery(editor, "/sim");

    const option = screen.getByRole("option", { name: "Skill: simplify" });
    expect(option).toBeInTheDocument();
    expect(option.querySelector("svg.lucide-sparkles")).not.toBeNull();
    expect(screen.getByText("simplify")).toBeInTheDocument();
    expect(screen.queryByText("/skill:simplify")).not.toBeInTheDocument();

    fireEvent.keyDown(editor, { key: "Enter" });
    expect(editor.textContent).toBe("simplify ");
    expect(editor.querySelector("svg")).not.toBeNull();

    fireEvent.keyDown(editor, { key: "Enter" });
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        agentKind: "kimi",
        prompt: "/skill:simplify",
        presentationMode: "gui",
      }),
    );
  });

  it("does not reintroduce locally discovered skills when the provider catalog is authoritative", async () => {
    bridge.scanSkills.mockResolvedValue({
      skills: [
        {
          id: "global:disabled-native",
          name: "disabled-native",
          description: "Disabled by Codex",
          folderName: "disabled-native",
          absolutePath: "C:\\skills\\disabled-native",
          skillFilePath: "C:\\skills\\disabled-native\\SKILL.md",
          rootPath: "C:\\skills",
          providerId: "codex",
          providerLabel: "Codex",
          scope: "global",
          scopeLabel: "Global",
          origin: "external",
          enabled: true,
          mutable: true,
          valid: true,
          linked: false,
        },
      ],
      effectiveSkillIds: ["global:disabled-native"],
      invocation: "dollar",
      issues: [],
      canLinkToGlobal: true,
    });
    await renderThread(
      makeThread({
        agentKind: "codex",
        presentationMode: "gui",
        slashCommands: [{ id: "help", label: "help" }],
      }),
      makeAgentStatus({
        kind: "codex",
        label: "Codex",
        capabilities: { ...makeAgentStatus().capabilities, reportsSkillCatalog: true },
      }),
    );

    const editor = screen.getByRole("textbox");
    typeSlashQuery(editor, "/");
    await waitFor(() => expect(bridge.scanSkills).toHaveBeenCalled());
    expect(screen.queryByText("/disabled-native")).not.toBeInTheDocument();
  });

  it("runs Codex GUI draft commands locally without launching a thread", async () => {
    const baseCapabilities = makeAgentStatus().capabilities;
    const onStart = vi.fn<(input: unknown) => void>();
    const onConfigChange = vi.fn<(patch: Partial<Thread["config"]>) => void>();
    await renderDraftComposer(
      makeAgentStatus({
        kind: "codex",
        label: "Codex",
        capabilities: {
          ...baseCapabilities,
          liveInputMode: "server",
          presentationMode: "terminal",
          presentationModes: ["terminal", "gui"],
          slashCommands: [
            {
              id: "status",
              label: "status - Display session configuration and token usage",
              description: "Display session configuration and token usage",
            },
          ],
        },
      }),
      onStart,
      "gui",
      onConfigChange,
    );

    const editor = screen.getByRole("textbox");
    typeSlashQuery(editor, "/plan");

    fireEvent.keyDown(editor, { key: "Enter" });
    expect(editor.textContent).toBe("/plan ");

    fireEvent.keyDown(editor, { key: "Enter" });

    expect(onConfigChange).toHaveBeenCalledWith({ mode: "plan" });
    expect(onStart).not.toHaveBeenCalled();
    expect(editor.textContent).toBe("");
  });

  it("submits Codex GUI /goal as provider input instead of handling it locally", async () => {
    const baseCapabilities = makeAgentStatus().capabilities;
    const onStart = vi.fn<(input: unknown) => void>();
    const onConfigChange = vi.fn<(patch: Partial<Thread["config"]>) => void>();
    await renderDraftComposer(
      makeAgentStatus({
        kind: "codex",
        label: "Codex",
        capabilities: {
          ...baseCapabilities,
          liveInputMode: "server",
          presentationMode: "terminal",
          presentationModes: ["terminal", "gui"],
        },
      }),
      onStart,
      "gui",
      onConfigChange,
    );

    const editor = screen.getByRole("textbox");
    typeSlashQuery(editor, "/goal ship unified GUI goal support");

    fireEvent.keyDown(editor, { key: "Enter" });

    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        agentKind: "codex",
        prompt: "/goal ship unified GUI goal support",
        presentationMode: "gui",
      }),
    );
    expect(onConfigChange).not.toHaveBeenCalled();
  });

  it("toggles Fast locally for Codex GUI draft commands", async () => {
    const baseCapabilities = makeAgentStatus().capabilities;
    const onStart = vi.fn<(input: unknown) => void>();
    const onConfigChange = vi.fn<(patch: Partial<Thread["config"]>) => void>();
    await renderDraftComposer(
      makeAgentStatus({
        kind: "codex",
        label: "Codex",
        capabilities: {
          ...baseCapabilities,
          liveInputMode: "server",
          presentationMode: "terminal",
          presentationModes: ["terminal", "gui"],
          fastModels: ["gemini-2.5-pro"],
        },
      }),
      onStart,
      "gui",
      onConfigChange,
      [],
      { model: "gemini-2.5-pro", fast: false },
    );

    const editor = screen.getByRole("textbox");
    typeSlashQuery(editor, "/fast");

    fireEvent.keyDown(editor, { key: "Enter" });
    expect(editor.textContent).toBe("/fast ");

    fireEvent.keyDown(editor, { key: "Enter" });

    expect(onConfigChange).toHaveBeenCalledWith({ fast: true });
    expect(onStart).not.toHaveBeenCalled();
  });

  it("opens the model picker for Codex GUI draft commands", async () => {
    const baseCapabilities = makeAgentStatus().capabilities;
    const onConfigChange = vi.fn<(patch: Partial<Thread["config"]>) => void>();
    await renderDraftComposer(
      makeAgentStatus({
        kind: "codex",
        label: "Codex",
        capabilities: {
          ...baseCapabilities,
          liveInputMode: "server",
          presentationMode: "terminal",
          presentationModes: ["terminal", "gui"],
        },
      }),
      undefined,
      "gui",
      onConfigChange,
      [
        {
          kind: "provider-model",
          providers: [
            {
              kind: "codex",
              label: "Codex",
              capabilities: baseCapabilities,
            },
          ],
          currentAgentKind: "codex",
          currentModel: "gemini-2.5-pro",
          onChange: () => undefined,
        },
      ],
    );

    const editor = screen.getByRole("textbox");
    typeSlashQuery(editor, "/model");

    fireEvent.keyDown(editor, { key: "Enter" });
    fireEvent.keyDown(editor, { key: "Enter" });

    expect(await screen.findByPlaceholderText("Search models...")).toBeInTheDocument();
    expect(onConfigChange).not.toHaveBeenCalled();
  });

  it("selects draft slash commands without submitting the draft", async () => {
    const baseCapabilities = makeAgentStatus().capabilities;
    const onStart = await renderDraftComposer(
      makeAgentStatus({
        capabilities: {
          ...baseCapabilities,
          liveInputMode: "terminal",
          presentationMode: "terminal",
          presentationModes: ["terminal"],
          slashCommands: [
            {
              id: "plan",
              label: "plan — Draft a plan",
              description: "Draft a plan",
            },
            {
              id: "review",
              label: "review — Review the diff",
              description: "Review the diff",
            },
          ],
        },
      }),
    );

    const editor = screen.getByRole("textbox");
    typeSlashQuery(editor, "/");

    expect(screen.getByText("Commands")).toBeInTheDocument();

    scrollIntoView.mockClear();
    fireEvent.keyDown(editor, { key: "ArrowDown" });

    const options = screen.getAllByRole("option");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(scrollIntoView).toHaveBeenCalled();

    fireEvent.keyDown(editor, { key: "Enter" });

    expect(onStart).not.toHaveBeenCalled();
    expect(screen.queryByText("Commands")).not.toBeInTheDocument();
    expect(editor.textContent).toBe("/review ");
  });

  it("does not offer plugin-backed MCPs as @ mentions in drafts", async () => {
    const baseCapabilities = makeAgentStatus().capabilities;
    await renderDraftComposer(
      makeAgentStatus({
        capabilities: {
          ...baseCapabilities,
          mcpConfigSource: "agentSettings",
        },
      }),
      vi.fn(),
      "gui",
    );

    const editor = screen.getByRole("textbox");
    typeSlashQuery(editor, "@ter");

    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("binds a seeded plugin and enables its built-in MCP servers", async () => {
    const onConfigChange = vi.fn<(patch: Partial<Thread["config"]>) => void>((patch) => {
      if (patch.computerUse !== true) return;
      expect(screen.getByLabelText("Computer Use")).toBeInTheDocument();
      expect(screen.getByRole("textbox")).toHaveTextContent("Computer Use Inspect the desktop");
    });
    seedBuiltInPlugins();
    useSharedSettings.setState({
      installedPlugins: {
        "computer-use": {
          version: "seed-test",
          enabled: true,
          disabledSkillIds: [],
          disabledMcpServerNames: [],
        },
      },
    });
    bridge.scanSkills.mockResolvedValue({
      skills: [
        {
          id: "global:computer-use",
          name: "computer-use",
          description: "A colliding standalone skill",
          folderName: "computer-use",
          absolutePath: "/skills/computer-use",
          skillFilePath: "/skills/computer-use/SKILL.md",
          rootPath: "/skills",
          providerId: "global",
          providerLabel: "Personal skills",
          scope: "global",
          scopeLabel: "Global",
          origin: "managed",
          enabled: true,
          mutable: true,
          valid: true,
          linked: false,
        },
        {
          id: "plugin:computer-use:computer-use",
          name: "operate-desktop",
          description: "Operate desktop apps",
          folderName: "computer-use",
          absolutePath: "/plugins/computer-use/skills/computer-use",
          skillFilePath: "/plugins/computer-use/skills/computer-use/SKILL.md",
          rootPath: "/plugins/computer-use/skills",
          providerId: "plugins",
          providerLabel: "Computer Use",
          scope: "global",
          scopeLabel: "Global",
          origin: "plugin",
          pluginId: "computer-use",
          pluginName: "Computer Use",
          enabled: true,
          mutable: false,
          valid: true,
          linked: false,
        },
      ],
      effectiveSkillIds: ["global:computer-use", "plugin:computer-use:computer-use"],
      invocation: "dollar",
      issues: [],
      canLinkToGlobal: true,
    });
    useAppStore.getState().setComposerSeed(draftProject.id, "/computer-use Inspect the desktop", {
      bindLeadingSkill: true,
      leadingSkillPluginId: "computer-use",
      enableMcpServerIds: ["computer-use"],
    });

    await renderDraftComposer(makeAgentStatus(), vi.fn(), "gui", onConfigChange);

    await waitFor(() => expect(onConfigChange).toHaveBeenCalledWith({ computerUse: true }));
    const pluginChip = screen.getByLabelText("Computer Use");
    expect(pluginChip).toHaveAttribute("data-plugin-id", "computer-use");
    expect(pluginChip.querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("textbox")).toHaveTextContent("Computer Use Inspect the desktop");
    expect(useAppStore.getState().pendingComposerSeeds[draftProject.id]).toBeUndefined();
  });

  it("saves draft composer content on ordinary unmount", () => {
    const { unmount } = render(
      <AppProvider>
        <ThreadDraftComposerArea
          project={draftProject}
          selectedAgent={makeAgentStatus()}
          controls={[]}
          config={{ model: "gemini-2.5-pro" }}
          compact={false}
          paneCount={1}
          gitBranch={undefined}
          worktreeMode={false}
          supportsModePicker={false}
          presentationMode="terminal"
          onConfigChange={() => {}}
          onWorktreeModeChange={() => {}}
          onSwitchBranch={() => {}}
          onRememberPresentationMode={() => {}}
          onStart={() => {}}
        />
      </AppProvider>,
    );

    typeSlashQuery(screen.getByRole("textbox"), "ordinary draft");
    unmount();

    expect(useAppStore.getState().draftContents[draftProject.id]).toMatchObject({
      segments: [{ kind: "text", content: "ordinary draft" }],
    });
  });

  it("saves a pasted draft image without its ephemeral preview URL", async () => {
    // jsdom does not implement object URLs.
    const createObjectURL = vi.fn<(source: File) => string>(() => "blob:app/draft-pasted-1");
    const revokeObjectURL = vi.fn<(url: string) => void>();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    try {
      const renderDraft = () =>
        render(
          <AppProvider>
            <ThreadDraftComposerArea
              project={draftProject}
              selectedAgent={makeAgentStatus()}
              controls={[]}
              config={{ model: "gemini-2.5-pro" }}
              compact={false}
              paneCount={1}
              gitBranch={undefined}
              worktreeMode={false}
              supportsModePicker={false}
              presentationMode="terminal"
              onConfigChange={() => {}}
              onWorktreeModeChange={() => {}}
              onSwitchBranch={() => {}}
              onRememberPresentationMode={() => {}}
              onStart={() => {}}
            />
          </AppProvider>,
        );
      const { unmount } = renderDraft();

      const file = new File([new Uint8Array([1])], "clipboard.png", { type: "image/png" });
      const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(pasteEvent, "clipboardData", {
        value: {
          files: [file],
          items: [{ type: file.type, getAsFile: () => file }],
          getData: () => "",
        },
      });
      fireEvent(screen.getByRole("textbox"), pasteEvent);

      // The live composer previews the paste from its local object URL.
      const thumb = await screen.findByAltText("Image 1.png");
      expect(thumb).toHaveAttribute("src", "blob:app/draft-pasted-1");

      unmount();

      // The saved draft renders the image from the durable file path instead —
      // the object URL was revoked when the composer unmounted.
      const saved = useAppStore.getState().draftContents[draftProject.id];
      expect(saved?.attachments).toHaveLength(1);
      expect(saved?.attachments[0]).not.toHaveProperty("previewUrl");
      expect(saved?.attachments[0]?.path).toBe("C:\\attachments\\draft-project-1\\image-1.png");
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:app/draft-pasted-1");

      const { unmount: unmountRestored } = renderDraft();
      const restoredThumb = await screen.findByAltText("Image 1.png");
      expect(restoredThumb).toHaveAttribute(
        "src",
        "poracode-local://local/C:/attachments/draft-project-1/image-1.png",
      );
      expect(useAppStore.getState().draftContents[draftProject.id]).toBeUndefined();
      unmountRestored();
    } finally {
      Reflect.deleteProperty(URL, "createObjectURL");
      Reflect.deleteProperty(URL, "revokeObjectURL");
    }
  });

  it("appends queued input after restored draft content", async () => {
    useAppStore.setState({
      draftContents: {
        [draftProject.id]: {
          segments: [{ kind: "text", content: "existing draft" }],
          attachments: [],
        },
      },
    });
    useComposerInputInbox
      .getState()
      .enqueue(`draft:${draftProject.id}`, [{ kind: "text", content: "review note" }]);

    const onStart = await renderDraftComposer(makeAgentStatus(), vi.fn(), "gui");
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "existing draft\n\nreview note",
        segments: [{ kind: "text", content: "existing draft\n\nreview note" }],
      }),
    );
  });

  it("consumes the project fallback inbox from a unique draft pane", async () => {
    useComposerInputInbox
      .getState()
      .enqueue(`draft:${draftProject.id}`, [{ kind: "text", content: "fallback note" }]);
    const onStart = vi.fn<(input: unknown) => void>();

    await renderDraftComposer(
      makeAgentStatus(),
      onStart,
      "gui",
      vi.fn(),
      [],
      { model: "gemini-2.5-pro" },
      "unique-draft-pane",
    );
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "fallback note",
        segments: [{ kind: "text", content: "fallback note" }],
      }),
    );
    expect(
      useComposerInputInbox.getState().itemsByComposer[`draft:${draftProject.id}`],
    ).toBeUndefined();
  });

  it("discards draft composer content when project switching requests it", () => {
    const { unmount } = render(
      <AppProvider>
        <ThreadDraftComposerArea
          project={draftProject}
          selectedAgent={makeAgentStatus()}
          controls={[]}
          config={{ model: "gemini-2.5-pro" }}
          compact={false}
          paneCount={1}
          gitBranch={undefined}
          worktreeMode={false}
          supportsModePicker={false}
          presentationMode="terminal"
          onConfigChange={() => {}}
          onWorktreeModeChange={() => {}}
          onSwitchBranch={() => {}}
          onRememberPresentationMode={() => {}}
          onStart={() => {}}
        />
      </AppProvider>,
    );

    typeSlashQuery(screen.getByRole("textbox"), "discarded draft");
    useAppStore.getState().discardDraftContent(draftProject.id);
    unmount();

    expect(useAppStore.getState().draftContents[draftProject.id]).toBeUndefined();
  });
});
