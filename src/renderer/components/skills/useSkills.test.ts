import { createElement, type PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { I18nProvider } from "@lingui/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillScanResult } from "@/shared/contracts";
import { dynamicActivate, i18n } from "@/renderer/i18n/i18n";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { usePlugins } from "@/renderer/state/pluginsStore";
import { pluginFixture, seedBuiltInPlugins } from "@/renderer/testUtils/plugins";
import {
  buildSkillSlashCommands,
  usePluginMentionItems,
  useSkills,
  useSkillSlashCommandState,
} from "./useSkills";

const { scanSkillsMock } = vi.hoisted(() => ({
  scanSkillsMock: vi.fn<() => Promise<SkillScanResult>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ platform: "win32", scanSkills: scanSkillsMock }),
}));

const invocationByProvider = {
  claude: "slash",
  codex: "dollar",
  gemini: "prompt",
  opencode: "prompt",
  copilot: "slash",
  commandcode: "slash",
  cursor: "slash",
  grok: "slash",
  antigravity: "prompt",
  pi: "skill",
} as const;

function emptyScan(): SkillScanResult {
  return {
    skills: [],
    effectiveSkillIds: [],
    invocation: null,
    issues: [],
    canLinkToGlobal: true,
  };
}

function pluginSkillScan(): SkillScanResult {
  const id = "project:plugin:browser-tools:browser-control";
  return {
    skills: [
      {
        id,
        name: "browser-control",
        description: "Navigate, inspect, and test pages with the in-app Browser MCP.",
        folderName: "browser-control",
        absolutePath: "C:\\project\\.poracode\\skills\\browser-control",
        skillFilePath: "C:\\project\\.poracode\\skills\\browser-control\\SKILL.md",
        rootPath: "C:\\project\\.poracode\\skills",
        providerId: "plugin:browser-tools",
        providerLabel: "Browser",
        scope: "project",
        scopeLabel: "Project",
        origin: "plugin",
        pluginId: "browser-tools",
        pluginName: "Browser",
        enabled: true,
        mutable: false,
        valid: true,
        linked: false,
      },
    ],
    effectiveSkillIds: [id],
    invocation: "dollar",
    issues: [],
    canLinkToGlobal: true,
  };
}

function I18nWrapper(props: PropsWithChildren) {
  return createElement(I18nProvider, { i18n }, props.children);
}

describe("useSkills", () => {
  beforeEach(() => {
    scanSkillsMock.mockReset();
    seedBuiltInPlugins();
    useSharedSettings.setState({ installedPlugins: {} });
  });

  it("shows the cached result immediately while refreshing a remounted scope", async () => {
    const initial = emptyScan();
    scanSkillsMock.mockResolvedValueOnce(initial);
    const first = renderHook(() => useSkills(undefined, undefined, "CacheTest"));
    await waitFor(() => expect(first.result.current.scan).toBe(initial));
    first.unmount();

    const refreshed = { ...emptyScan(), canLinkToGlobal: false };
    let resolveRefresh!: (result: SkillScanResult) => void;
    scanSkillsMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    const second = renderHook(() => useSkills(undefined, undefined, "CacheTest"));

    expect(second.result.current.scan).toBe(initial);
    await waitFor(() => expect(scanSkillsMock).toHaveBeenCalledTimes(2));
    act(() => resolveRefresh(refreshed));
    await waitFor(() => expect(second.result.current.scan).toBe(refreshed));
  });

  it("invalidates mounted composer skills immediately when plugin state changes", async () => {
    useSharedSettings.getState().installPlugin(pluginFixture("browser-tools"));
    const initial = pluginSkillScan();
    scanSkillsMock.mockResolvedValueOnce(initial);
    const hook = renderHook(
      () =>
        useSkillSlashCommandState({ kind: "windows", path: "C:\\PluginStateCacheTest" }, "codex"),
      { wrapper: I18nWrapper },
    );
    await waitFor(() => expect(hook.result.current.commands).toHaveLength(1));

    let resolveRefresh!: (result: SkillScanResult) => void;
    scanSkillsMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    act(() => useSharedSettings.getState().setPluginEnabled(pluginFixture("browser-tools"), false));

    expect(hook.result.current.commands).toEqual([]);
    await waitFor(() => expect(scanSkillsMock).toHaveBeenCalledTimes(2));
    act(() => resolveRefresh(emptyScan()));
    await waitFor(() => expect(hook.result.current.resolved).toBe(true));
  });

  it("rescans mounted composer skills when the plugin catalog refreshes", async () => {
    scanSkillsMock.mockResolvedValueOnce(emptyScan()).mockResolvedValueOnce(emptyScan());
    const hook = renderHook(() => useSkills(undefined, "codex", "CatalogRefreshTest"));
    await waitFor(() => expect(scanSkillsMock).toHaveBeenCalledTimes(1));

    act(() => usePlugins.setState((state) => ({ revision: state.revision + 1 })));
    await waitFor(() => expect(scanSkillsMock).toHaveBeenCalledTimes(2));
    hook.unmount();
  });

  it("represents an installed plugin as one mention backed by its core skill", async () => {
    useSharedSettings.getState().installPlugin(pluginFixture("browser-tools"));
    scanSkillsMock.mockResolvedValueOnce(pluginSkillScan());
    const hook = renderHook(
      () => usePluginMentionItems({ kind: "windows", path: "C:\\PluginMentionTest" }, "codex"),
      { wrapper: I18nWrapper },
    );

    await waitFor(() => expect(hook.result.current).toHaveLength(1));
    expect(hook.result.current[0]).toMatchObject({
      id: "browser-tools",
      name: "Browser",
      command: {
        skillName: "browser-control",
        skillInvocation: "$browser-control",
        pluginId: "browser-tools",
        pluginName: "Browser",
      },
    });
  });

  it("offers Terminal as an always-on plugin mention", async () => {
    const id = "global:plugin:terminal:terminal-inspection";
    scanSkillsMock.mockResolvedValueOnce({
      skills: [
        {
          id,
          name: "terminal-inspection",
          description: "Read the Terminal panel attached to this worktree and report the evidence.",
          folderName: "terminal-inspection",
          absolutePath: "C:\\resources\\plugins\\terminal\\skills\\terminal-inspection",
          skillFilePath: "C:\\resources\\plugins\\terminal\\skills\\terminal-inspection\\SKILL.md",
          rootPath: "C:\\resources\\plugins\\terminal\\skills",
          providerId: "plugin:terminal",
          providerLabel: "Terminal",
          scope: "global",
          scopeLabel: "Global",
          origin: "plugin",
          pluginId: "terminal",
          pluginName: "Terminal",
          enabled: true,
          mutable: false,
          valid: true,
          linked: false,
        },
      ],
      effectiveSkillIds: [id],
      invocation: "dollar",
      issues: [],
      canLinkToGlobal: true,
    });
    const hook = renderHook(
      () => usePluginMentionItems({ kind: "windows", path: "C:\\TerminalMentionTest" }, "codex"),
      { wrapper: I18nWrapper },
    );

    await waitFor(() =>
      expect(hook.result.current.some((item) => item.id === "terminal")).toBe(true),
    );
    expect(hook.result.current.find((item) => item.id === "terminal")).toMatchObject({
      name: "Terminal",
      enablesMcpServerIds: ["app-controls"],
      command: {
        skillName: "terminal-inspection",
        pluginId: "terminal",
        pluginName: "Terminal",
      },
    });
  });

  it("scopes composer scans to the active presentation", async () => {
    scanSkillsMock.mockResolvedValueOnce(emptyScan());
    const projectLocation = { kind: "windows" as const, path: "C:\\PresentationSkillTest" };
    const hook = renderHook(
      () => useSkillSlashCommandState(projectLocation, "claude", "terminal"),
      { wrapper: I18nWrapper },
    );

    await waitFor(() => expect(hook.result.current.resolved).toBe(true));
    expect(scanSkillsMock).toHaveBeenCalledWith({
      projectLocation,
      agentKind: "claude",
      presentationMode: "terminal",
    });
  });

  it("localizes plugin command display metadata without changing its invocation identity", async () => {
    await dynamicActivate("es");
    useSharedSettings.getState().installPlugin(pluginFixture("browser-tools"));
    scanSkillsMock.mockResolvedValueOnce(pluginSkillScan());
    const hook = renderHook(
      () =>
        useSkillSlashCommandState(
          { kind: "windows", path: "C:\\LocalizedPluginCommandTest" },
          "codex",
        ),
      { wrapper: I18nWrapper },
    );

    try {
      await waitFor(() => expect(hook.result.current.commands).toHaveLength(1));
      expect(hook.result.current.commands[0]).toMatchObject({
        id: "browser-control",
        label:
          "Control del navegador — Navega, inspecciona y prueba páginas con el MCP del navegador integrado.",
        description: "Navega, inspecciona y prueba páginas con el MCP del navegador integrado.",
        skillName: "browser-control",
        skillInvocation: "$browser-control",
        skillProvider: "Navegador",
      });
    } finally {
      hook.unmount();
      await dynamicActivate("en");
    }
  });
});

describe("buildSkillSlashCommands", () => {
  it.each(Object.entries(invocationByProvider))(
    "adds the unified managed skill to the %s composer menu",
    (provider, invocation) => {
      const id = `project:agents:unique-managed-skill:on`;
      const scan: SkillScanResult = {
        skills: [
          {
            id,
            name: "unique-managed-skill",
            description: "Unique managed test skill",
            folderName: "unique-managed-skill",
            absolutePath: "/project/.agents/skills/unique-managed-skill",
            skillFilePath: "/project/.agents/skills/unique-managed-skill/SKILL.md",
            rootPath: "/project/.agents/skills",
            providerId: "agents",
            providerLabel: "Shared agents",
            scope: "project",
            scopeLabel: "Project",
            origin: "managed",
            enabled: true,
            mutable: true,
            valid: true,
            linked: false,
          },
        ],
        effectiveSkillIds: [id],
        invocation,
        issues: [],
        canLinkToGlobal: true,
      };

      expect(buildSkillSlashCommands(scan)).toEqual([
        expect.objectContaining({
          id: "unique-managed-skill",
          section: "skills",
          skillName: "unique-managed-skill",
          skillInvocation:
            invocation === "dollar"
              ? "$unique-managed-skill"
              : invocation === "skill"
                ? "/skill:unique-managed-skill"
                : invocation === "prompt"
                  ? "Use the unique-managed-skill skill."
                  : "/unique-managed-skill",
        }),
      ]);
      expect(provider).toBeTruthy();
    },
  );
});
