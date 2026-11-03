// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoadedPlugin, Project } from "@/shared/contracts";
import { AGENT_PLUGINS_MANIFEST_SCHEMA_URL } from "@/shared/plugins/spec";
import { useAppStore } from "@/renderer/state/appStore";
import { pluginScopeKey, usePlugins } from "@/renderer/state/pluginsStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ platform: "linux" }),
  isRemoteSession: () => false,
  isMac: () => false,
  isWindows: () => false,
}));

import { PluginsSection } from "./PluginsSection";

const project: Project = {
  id: "project-1",
  name: "Repo",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2026-06-10T00:00:00.000Z",
};

function plugin(name: string, overrides: Partial<LoadedPlugin["poracode"]> = {}): LoadedPlugin {
  return {
    name,
    source: "user",
    root: `/plugins/${name}`,
    manifest: { $schema: AGENT_PLUGINS_MANIFEST_SCHEMA_URL, name, version: "1.0.0" },
    poracode: {
      title: name,
      category: "developer-tools",
      featured: false,
      communityMaintained: false,
      defaultEnabled: true,
      alwaysEnabled: false,
      nativePluginNames: [],
      builtInMcpServerIds: [],
      skills: {},
      ...overrides,
    },
    skills: [],
    mcpServers: [],
    diagnostics: [],
  };
}

function seed(overrides: Partial<Project> = {}) {
  useAppStore.setState({ projects: [{ ...project, ...overrides }] });
  const scope = pluginScopeKey(project.location);
  usePlugins.setState({
    pluginsByScope: {
      [scope]: [
        plugin("sentry"),
        plugin("linear"),
        // Not installed: never offered as a project switch.
        plugin("figma"),
        // Built-in tool plugins keep their per-thread composer toggles.
        { ...plugin("browser-tools", { builtInMcpServerIds: ["browser"] }), source: "bundled" },
      ],
    },
    loadedScopes: { [scope]: true },
  });
  useSharedSettings.setState({
    installedPlugins: {
      sentry: { version: "1.0.0", enabled: true, disabledSkillIds: [], disabledMcpServerNames: [] },
      linear: {
        version: "1.0.0",
        enabled: false,
        disabledSkillIds: [],
        disabledMcpServerNames: [],
      },
    },
  });
}

describe("PluginsSection", () => {
  beforeEach(() => seed());

  it("lists only installed, switchable plugins with their inherited global state", () => {
    render(<PluginsSection projectId={project.id} />);

    expect(screen.getByRole("button", { name: /sentry in this project/ })).toHaveTextContent(
      "Use global (on)",
    );
    expect(screen.getByRole("button", { name: /linear in this project/ })).toHaveTextContent(
      "Use global (off)",
    );
    expect(screen.queryByRole("button", { name: /figma in this project/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /browser-tools in this project/ })).toBeNull();
  });

  it("switches a plugin for the project and restores the global state", () => {
    render(<PluginsSection projectId={project.id} />);

    fireEvent.click(screen.getByRole("button", { name: /linear in this project/ }));
    fireEvent.click(screen.getByRole("option", { name: "On" }));
    expect(useAppStore.getState().projects[0]?.pluginOverrides).toEqual({ linear: true });

    fireEvent.click(screen.getByRole("button", { name: /linear in this project/ }));
    fireEvent.click(screen.getByRole("option", { name: "Use global (off)" }));
    expect(useAppStore.getState().projects[0]).not.toHaveProperty("pluginOverrides");
  });

  it("does not offer local plugin state for a paired host's project", () => {
    seed({ remoteServerId: "desktop-2", remoteId: "remote-project" });
    render(<PluginsSection projectId={project.id} />);

    expect(screen.getByText(/from a Poracode client on its host/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /in this project/ })).toBeNull();
  });
});
