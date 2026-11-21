import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import "@/renderer/tailwind.css";
import { i18n } from "@/renderer/i18n/i18n";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { Project } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { useProjectGroupStore } from "@/renderer/state/projectGroups/projectGroupStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useWorkspaceStore } from "@/renderer/state/workspaceStore";
import { PresentationModeTabs } from "./PresentationModeTabs";
import { ProjectSwitchMenu } from "./ProjectSwitchMenu";

const stamp = "2026-11-01T10:00:00.000Z";

function makeProject(id: string, name: string, remoteServerId?: string): Project {
  return {
    id,
    name,
    ...(remoteServerId ? { remoteServerId, remoteId: "repo" } : {}),
    location: {
      kind: "posix",
      path: `/${id}`,
      ...(remoteServerId ? { remoteServerId } : {}),
    },
    createdAt: stamp,
  } as Project;
}

beforeEach(() => {
  i18n.loadAndActivate({ locale: "en", messages: {} });
  useGitStore.setState({ statuses: {} });
  useProjectGroupStore.setState({ manualGroups: {}, lastUsedAt: {} });
  useSharedSettings.setState({ workspaces: [], homeScopeEnabled: false });
  useWorkspaceStore.setState({ activeWorkspaceId: null, lastProjectIdByWorkspace: {} });
});

afterEach(cleanup);

it.each(["light", "dark"] as const)(
  "keeps project name and environment foreground-colored and undimmed when single-choice disabled in %s mode",
  (mode) => {
    const html = document.documentElement;
    const previousTheme = html.getAttribute("data-theme");
    html.setAttribute("data-theme", mode);
    try {
      const localProject = makeProject("p1", "Pora.code");
      const offlineMirror = makeProject("remote:mac:p1", "Pora.code", "mac");
      useAppStore.setState({
        projects: [localProject, offlineMirror],
        view: { kind: "draft", projectId: localProject.id },
      });
      useRemoteServersStore.setState({
        servers: [{ desktopId: "mac", label: "MacBook" }],
        runtime: { mac: { status: "offline", projects: [], threads: [] } },
      } as never);

      const view = render(
        <>
          <div style={{ color: "var(--foreground)" }}>Foreground reference</div>
          <ProjectSwitchMenu currentProjectId={localProject.id} variant="compact" />
        </>,
      );

      const fgColor = getComputedStyle(view.getByText("Foreground reference")).color;
      const projectTrigger = view.getByRole("button", { name: "Switch project" });
      const envTrigger = view.getByRole("button", { name: "Machine: Local" });

      expect(projectTrigger).toBeDisabled();
      expect(envTrigger).toBeDisabled();

      const projectStyle = getComputedStyle(projectTrigger);
      const envStyle = getComputedStyle(envTrigger);
      expect(projectStyle.color).toBe(fgColor);
      expect(projectStyle.opacity).toBe("1");
      expect(envStyle.color).toBe(fgColor);
      expect(envStyle.opacity).toBe("1");

      // Single paired-machine static label also uses foreground color.
      cleanup();
      useAppStore.setState({
        projects: [offlineMirror],
        view: { kind: "draft", projectId: offlineMirror.id },
      });
      useRemoteServersStore.setState({
        servers: [{ desktopId: "mac", label: "MacBook" }],
        runtime: { mac: { status: "online", projects: [], threads: [] } },
      } as never);

      const remoteOnlyView = render(
        <>
          <div style={{ color: "var(--foreground)" }}>Foreground reference</div>
          <ProjectSwitchMenu currentProjectId={offlineMirror.id} variant="compact" />
        </>,
      );
      const remoteOnlyFg = getComputedStyle(remoteOnlyView.getByText("Foreground reference")).color;
      const remoteEnvLabel = remoteOnlyView.container.querySelector("[data-project-environment]")!;
      expect(getComputedStyle(remoteEnvLabel).color).toBe(remoteOnlyFg);
      expect(getComputedStyle(remoteEnvLabel).opacity).toBe("1");
    } finally {
      if (previousTheme === null) html.removeAttribute("data-theme");
      else html.setAttribute("data-theme", previousTheme);
    }
  },
);

it("matches PresentationModeTabs typography, height, and icon scale for project and environment selectors", () => {
  const localProject = makeProject("p1", "Pora.code");
  const remoteMirror = makeProject("remote:mac:p1", "Pora.code", "mac");
  const secondProject = makeProject("p2", "Other");
  useAppStore.setState({
    projects: [localProject, remoteMirror, secondProject],
    view: { kind: "draft", projectId: localProject.id },
  });
  useRemoteServersStore.setState({
    servers: [{ desktopId: "mac", label: "MacBook" }],
    runtime: { mac: { status: "online", projects: [], threads: [] } },
  } as never);

  const view = render(
    <div className="flex items-center justify-between gap-2">
      <ProjectSwitchMenu currentProjectId={localProject.id} variant="compact" />
      <PresentationModeTabs
        presentationMode="gui"
        supportsGui
        supportsTerminal
        onChange={() => undefined}
      />
    </div>,
  );

  const chatTab = view.getByRole("tab", { name: "Chat" });
  const projectTrigger = view.getByRole("button", { name: "Switch project" });
  const envTrigger = view.getByRole("button", { name: "Machine: Local" });

  const chatStyle = getComputedStyle(chatTab);
  const projectStyle = getComputedStyle(projectTrigger);
  const envStyle = getComputedStyle(envTrigger);

  expect(projectStyle.fontSize).toBe(chatStyle.fontSize);
  expect(projectStyle.fontWeight).toBe(chatStyle.fontWeight);
  expect(envStyle.fontSize).toBe(chatStyle.fontSize);
  expect(envStyle.fontWeight).toBe(chatStyle.fontWeight);

  expect(projectTrigger.getBoundingClientRect().height).toBeCloseTo(
    chatTab.getBoundingClientRect().height,
    1,
  );
  expect(envTrigger.getBoundingClientRect().height).toBeCloseTo(
    chatTab.getBoundingClientRect().height,
    1,
  );

  const chatIconRect = chatTab.querySelector("svg")!.getBoundingClientRect();
  const projectIconRect = projectTrigger.querySelector("svg")!.getBoundingClientRect();
  const envIconRect = envTrigger.querySelector("svg")!.getBoundingClientRect();

  expect(projectIconRect.width).toBeCloseTo(chatIconRect.width, 1);
  expect(projectIconRect.height).toBeCloseTo(chatIconRect.height, 1);
  expect(envIconRect.width).toBeCloseTo(chatIconRect.width, 1);
  expect(envIconRect.height).toBeCloseTo(chatIconRect.height, 1);
});
