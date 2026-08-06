import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ReadExternalFilePayload,
  ReadExternalFileResult,
  SkillEntry,
  SkillScanResult,
} from "@/shared/contracts";
import { AppProvider } from "@/renderer/components/ui/provider";
import { seedBuiltInPlugins } from "@/renderer/testUtils/plugins";
import { SkillsManager } from "./SkillsManager";

const {
  bridge,
  ensureHomeScopeProjectMock,
  newThreadFromTextMock,
  reload,
  skillImportModalMock,
  useSkillsMock,
} = vi.hoisted(() => ({
  bridge: {
    platform: "win32" as const,
    listWslDistros: vi.fn<() => Promise<string[]>>().mockResolvedValue(["Ubuntu"]),
    setSkillEnabled: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    deleteSkill: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    readExternalFile: vi
      .fn<(payload: ReadExternalFilePayload) => Promise<ReadExternalFileResult>>()
      .mockResolvedValue({
        path: "C:\\Users\\me\\.agents\\skills\\review\\SKILL.md",
        status: "ready",
        modifiedAtMs: 1,
        content: "---\nname: review\ndescription: Review changes\n---\n\n# Review\n",
      }),
  },
  ensureHomeScopeProjectMock: vi.fn<() => Promise<{ id: string }>>(),
  newThreadFromTextMock:
    vi.fn<(projectId: string, text: string, options?: { bindLeadingSkill?: boolean }) => void>(),
  reload: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  skillImportModalMock: vi.fn<(props: { isOpen: boolean }) => void>(),
  useSkillsMock: vi.fn<() => unknown>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
  isRemoteSession: () => false,
  isDevApp: () => false,
}));
vi.mock("./useSkills", () => ({ useSkills: useSkillsMock }));
vi.mock("@/renderer/actions/notesActions", () => ({
  newThreadFromText: newThreadFromTextMock,
}));
vi.mock("@/renderer/actions/projectActions", () => ({
  ensureHomeScopeProject: ensureHomeScopeProjectMock,
}));
vi.mock("./SkillImportModal", () => ({
  SkillImportModal: (props: { isOpen: boolean }) => {
    skillImportModalMock(props);
    return props.isOpen ? <div>Import modal open</div> : null;
  },
}));
vi.mock("./SkillMarketplaceModal", () => ({
  SkillMarketplaceModal: () => null,
}));

function skill(overrides: Partial<SkillEntry> = {}): SkillEntry {
  return {
    id: "global:agents:review:on",
    name: "review",
    description: "Review changes",
    folderName: "review",
    absolutePath: "C:\\Users\\me\\.agents\\skills\\review",
    skillFilePath: "C:\\Users\\me\\.agents\\skills\\review\\SKILL.md",
    rootPath: "C:\\Users\\me\\.agents\\skills",
    providerId: "agents",
    providerLabel: "Shared agents",
    scope: "global",
    scopeLabel: "Global",
    origin: "managed",
    enabled: true,
    mutable: true,
    valid: true,
    linked: false,
    ...overrides,
  };
}

function scan(skills: SkillEntry[]): SkillScanResult {
  return {
    skills,
    effectiveSkillIds: [],
    invocation: null,
    issues: [],
    canLinkToGlobal: true,
  };
}

function renderManager(
  projects: Parameters<typeof SkillsManager>[0]["projects"] = [],
  defaultDestinationId?: string,
) {
  render(
    <AppProvider>
      <SkillsManager
        projects={projects}
        {...(defaultDestinationId ? { defaultDestinationId } : {})}
      />
    </AppProvider>,
  );
}

describe("SkillsManager", () => {
  beforeEach(() => {
    seedBuiltInPlugins();
    vi.clearAllMocks();
    bridge.listWslDistros.mockReturnValue(new Promise(() => undefined));
    ensureHomeScopeProjectMock.mockResolvedValue({ id: "home" });
    useSkillsMock.mockReturnValue({
      scan: scan([
        skill(),
        skill({
          id: "global:poracode:private-review:on",
          name: "private-review",
          absolutePath: "C:\\Users\\me\\.poracode\\skills\\private-review",
          rootPath: "C:\\Users\\me\\.poracode\\skills",
          providerId: "poracode",
          providerLabel: "Poracode only",
          providerGroupId: "poracode",
          providerGroupLabel: "Poracode",
          providerGroupOrder: -1,
          availability: "poracode",
        }),
        skill({
          id: "global:claude:testing:off",
          name: "testing",
          absolutePath: "C:\\Users\\me\\.claude\\skills.poracode-disabled\\testing",
          rootPath: "C:\\Users\\me\\.claude\\skills",
          providerId: "claude",
          providerLabel: "Claude Code",
          origin: "external",
          enabled: false,
          importState: "available",
        }),
        skill({
          id: "global:codex:codex-review:on",
          name: "codex-review",
          absolutePath: "C:\\Users\\me\\.codex\\skills\\codex-review",
          rootPath: "C:\\Users\\me\\.codex\\skills",
          providerId: "codex",
          providerLabel: "Codex",
          origin: "external",
        }),
        skill({
          id: "global:codex-built-in:skill-creator:on",
          name: "skill-creator",
          providerId: "codex-built-in",
          providerLabel: "Codex built-ins",
          providerGroupId: "codex",
          providerGroupLabel: "Codex",
          origin: "built-in",
          mutable: false,
        }),
        skill({
          id: "global:poracode-built-in:create-skill:on",
          name: "create-skill",
          providerId: "poracode-built-in",
          providerLabel: "Poracode built-ins",
          providerGroupId: "poracode",
          providerGroupLabel: "Poracode",
          providerGroupOrder: -1,
          origin: "built-in",
          mutable: false,
        }),
        skill({
          id: "global:opencode:opencode-review:on",
          name: "opencode-review",
          absolutePath: "C:\\Users\\me\\.config\\opencode\\skills\\opencode-review",
          rootPath: "C:\\Users\\me\\.config\\opencode\\skills",
          providerId: "opencode",
          providerLabel: "OpenCode",
          providerGroupId: "opencode",
          providerGroupLabel: "OpenCode",
          origin: "external",
        }),
        skill({
          id: "global:opencode-singular:legacy-review:on",
          name: "legacy-review",
          absolutePath: "C:\\Users\\me\\.config\\opencode\\skill\\legacy-review",
          rootPath: "C:\\Users\\me\\.config\\opencode\\skill",
          providerId: "opencode-singular",
          providerLabel: "OpenCode legacy",
          providerGroupId: "opencode",
          providerGroupLabel: "OpenCode",
          origin: "external",
        }),
      ]),
      loading: false,
      error: undefined,
      reload,
    });
  });

  it("groups managed, external, and provider-owned skills", () => {
    renderManager();

    expect(screen.getByRole("button", { name: "Marketplace" })).toHaveClass("button--tertiary");
    expect(screen.getByRole("button", { name: "Add skill" })).toHaveClass("button--tertiary");
    expect(screen.getByText("Poracode only")).toBeInTheDocument();
    expect(screen.queryByText("Global")).not.toBeInTheDocument();
    expect(screen.queryByText("Managed")).not.toBeInTheDocument();
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Poracode",
      "Shared",
      "Claude Code",
      "Codex",
      "OpenCode",
    ]);
    const poracodeSection = screen.getByRole("heading", { name: "Poracode" }).closest("section")!;
    expect(within(poracodeSection).getByText("private-review")).toBeInTheDocument();
    expect(within(poracodeSection).getByText("create-skill")).toBeInTheDocument();
    const codexSection = screen.getByRole("heading", { name: "Codex" }).closest("section")!;
    expect(within(codexSection).getByText("codex-review")).toBeInTheDocument();
    expect(within(codexSection).getByText("skill-creator")).toBeInTheDocument();
    const opencodeSection = screen.getByRole("heading", { name: "OpenCode" }).closest("section")!;
    expect(within(opencodeSection).getByText("opencode-review")).toBeInTheDocument();
    expect(within(opencodeSection).getByText("legacy-review")).toBeInTheDocument();
    expect(screen.queryByText("Codex built-ins")).not.toBeInTheDocument();
    expect(screen.queryByText("Poracode built-ins")).not.toBeInTheDocument();
    expect(screen.queryByText("Built-in and plugin skills")).not.toBeInTheDocument();
    expect(screen.getByText("skill-creator")).toBeInTheDocument();
    expect(screen.getAllByText("Built-in")).toHaveLength(2);
    expect(screen.getAllByText("Managed by provider")).toHaveLength(2);
    expect(skillImportModalMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("switch", { name: "Disable review" }).parentElement,
    ).not.toHaveTextContent("Enabled");
  });

  it("identifies plugin-managed skills without exposing lifecycle controls", async () => {
    useSkillsMock.mockReturnValue({
      scan: scan([
        skill({
          id: "global:plugin:browser-control:on",
          name: "browser-control",
          description: "Navigate, inspect, and test pages",
          folderName: "browser-control",
          absolutePath: "C:\\Users\\me\\.poracode\\plugins\\browser-tools\\browser-control",
          skillFilePath:
            "C:\\Users\\me\\.poracode\\plugins\\browser-tools\\browser-control\\SKILL.md",
          rootPath: "C:\\Users\\me\\.poracode\\plugins\\browser-tools",
          providerId: "plugin:browser-tools",
          providerLabel: "Browser Tools",
          providerGroupId: "plugin:browser-tools",
          pluginId: "browser-tools",
          pluginName: "Browser Tools",
          origin: "plugin",
          mutable: false,
          enabled: false,
        }),
      ]),
      loading: false,
      error: undefined,
      reload,
    });

    renderManager();

    expect(screen.getByRole("heading", { name: "Browser Tools" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View Browser Control" })).toBeInTheDocument();
    expect(
      screen.getByText("Navigate, inspect, and test pages with the in-app Browser MCP."),
    ).toBeInTheDocument();
    expect(screen.getByText("Plugin")).toBeInTheDocument();
    expect(screen.getByText("Managed by Browser Tools")).toBeInTheDocument();
    expect(screen.getByText("Disabled", { selector: "span" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete browser-control" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: /browser-control/iu })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Search skills" }), {
      target: { value: "in-app Browser MCP" },
    });
    expect(screen.getByRole("button", { name: "View Browser Control" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View Browser Control" }));
    expect(screen.getByRole("heading", { name: "Browser Control" })).toBeInTheDocument();
    await waitFor(() => expect(bridge.readExternalFile).toHaveBeenCalled());
  });

  it("does not label linked skills as already imported", () => {
    useSkillsMock.mockReturnValue({
      scan: scan([
        skill({
          id: "global:claude:linked-review:on",
          name: "linked-review",
          providerId: "claude",
          providerLabel: "Claude Code",
          origin: "external",
          linked: true,
          importState: "already-imported",
        }),
      ]),
      loading: false,
      error: undefined,
      reload,
    });

    renderManager();

    expect(screen.getByText("Linked")).toBeInTheDocument();
    expect(screen.queryByText("Already imported")).not.toBeInTheDocument();
  });

  it("allows an enabled invalid skill to be disabled", async () => {
    useSkillsMock.mockReturnValue({
      scan: scan([
        skill({
          valid: false,
          invalidReason: "missing-description",
        }),
      ]),
      loading: false,
      error: undefined,
      reload,
    });

    renderManager();

    const toggle = screen.getByRole("switch", { name: "Disable review" });
    expect(toggle).toBeEnabled();
    fireEvent.click(toggle);

    await waitFor(() =>
      expect(bridge.setSkillEnabled).toHaveBeenCalledWith({
        absolutePath: "C:\\Users\\me\\.agents\\skills\\review",
        enabled: false,
      }),
    );
  });

  it("shows the complete skill file", async () => {
    renderManager();

    fireEvent.click(screen.getByRole("button", { name: "View review" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Review" })).toBeInTheDocument();
    expect(within(dialog).queryByText(/name: review/u)).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "View raw" }));
    expect(within(dialog).getByText(/name: review/u)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "View rendered" }));
    expect(within(dialog).queryByText(/name: review/u)).not.toBeInTheDocument();
    expect(within(dialog).getByText("Close").closest("button")).toHaveClass("button--ghost");
    expect(bridge.readExternalFile).toHaveBeenCalledWith({
      projectLocation: {
        kind: "windows",
        path: "C:\\Users\\me\\.agents\\skills\\review",
      },
      absolutePath: "C:\\Users\\me\\.agents\\skills\\review\\SKILL.md",
    });
  });

  it("reads a WSL skill through its Linux path", async () => {
    useSkillsMock.mockReturnValue({
      scan: scan([
        skill({
          name: "agent-browser",
          absolutePath: "\\\\wsl.localhost\\Ubuntu\\home\\alice\\.agents\\skills\\agent-browser",
          skillFilePath: "/home/alice/.agents/skills/agent-browser/SKILL.md",
        }),
      ]),
      loading: false,
      error: undefined,
      reload,
    });

    renderManager([], "wsl:Ubuntu");
    fireEvent.click(screen.getByRole("button", { name: "View agent-browser" }));

    await waitFor(() =>
      expect(bridge.readExternalFile).toHaveBeenCalledWith({
        projectLocation: {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\",
        },
        absolutePath: "/home/alice/.agents/skills/agent-browser/SKILL.md",
      }),
    );
  });

  it("creates a skill for the destination selected from Add skill", async () => {
    renderManager([
      {
        id: "demo",
        name: "Demo project",
        location: { kind: "windows", path: "C:\\Demo" },
      },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Add skill" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Demo project/u }));

    expect(newThreadFromTextMock).toHaveBeenCalledWith(
      "demo",
      "/skill-creator Create a new managed skill for this project.",
      { bindLeadingSkill: true },
    );
  });

  it("shows a WSL destination from project data before distro discovery completes", async () => {
    renderManager([
      {
        id: "wsl-demo",
        name: "WSL Demo",
        location: {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/home/me/demo",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\me\\demo",
        },
      },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Skills location" }));

    expect(await screen.findByText("Ubuntu")).toBeInTheDocument();
  });

  it("creates global skills in the shared .agents folder", async () => {
    renderManager([
      {
        id: "demo",
        name: "Demo project",
        location: { kind: "windows", path: "C:\\Demo" },
      },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Add skill" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Global (Windows)" }));

    await waitFor(() =>
      expect(newThreadFromTextMock).toHaveBeenCalledWith(
        "home",
        "/skill-creator Create a new managed skill for the Windows user.",
        { bindLeadingSkill: true },
      ),
    );
  });

  it("creates global WSL skills from the Home scope", async () => {
    renderManager([
      {
        id: "wsl-demo",
        name: "WSL Demo",
        location: {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/home/me/demo",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\me\\demo",
        },
      },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Add skill" }));
    fireEvent.click((await screen.findByText("Ubuntu")).closest('[role="menuitemradio"]')!);

    await waitFor(() =>
      expect(newThreadFromTextMock).toHaveBeenCalledWith(
        "home",
        "/skill-creator Create a new managed skill for the global Ubuntu WSL scope.",
        { bindLeadingSkill: true },
      ),
    );
  });

  it("opens import and toggles a managed skill", async () => {
    renderManager();

    fireEvent.click(screen.getByRole("button", { name: "Import external skills" }));
    expect(screen.getByText("Import modal open")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "Disable review" }));
    await waitFor(() =>
      expect(bridge.setSkillEnabled).toHaveBeenCalledWith({
        absolutePath: "C:\\Users\\me\\.agents\\skills\\review",
        enabled: false,
      }),
    );
    expect(reload).toHaveBeenCalled();
  });
});
