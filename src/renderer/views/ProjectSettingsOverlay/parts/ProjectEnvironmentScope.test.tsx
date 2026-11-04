import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitStatusResult, Project } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { useProjectGroupStore } from "@/renderer/state/projectGroups/projectGroupStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { MachineDescriptor } from "@/renderer/state/machines";
import {
  ProjectEnvironmentScopeBar,
  ProjectScopeHeading,
  SharedValueDiff,
  stableJson,
} from "./ProjectEnvironmentScope";

const openProjectSettings = vi.hoisted(() => vi.fn<(id: string, section?: string) => void>());
vi.mock("@/renderer/actions/panelActions", () => ({ openProjectSettings }));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => ({}), isRemoteSession: () => false }));
// The picker itself is the Settings MachineSelect; this suite proves the
// project wiring around it, so it renders one button per machine.
vi.mock("@/renderer/components/machineScope/MachineSelect", () => ({
  MachineSelect: (props: {
    machines: readonly MachineDescriptor[];
    value: string;
    onChange: (machine: MachineDescriptor) => void;
  }) => (
    <div data-testid="machine-select" data-value={props.value}>
      {props.machines.map((machine) => (
        <button key={machine.id} type="button" onClick={() => props.onChange(machine)}>
          {machine.label}
        </button>
      ))}
    </div>
  ),
}));

const local: Project = {
  id: "pc",
  name: "demo",
  location: { kind: "windows", path: "E:\\demo" },
  createdAt: "2026-07-13T10:00:00.000Z",
  searchSettings: { exclude: { a: true, b: false } },
};
const mac: Project = {
  id: "remote:mac:project:p",
  name: "demo",
  remoteServerId: "mac",
  remoteId: "p",
  location: { kind: "posix", path: "/demo", remoteServerId: "mac" },
  createdAt: "2026-07-13T10:00:00.000Z",
  // Same object, different key order: must not read as a difference.
  searchSettings: { exclude: { b: false, a: true } },
};

function linkBoth() {
  const status = {
    remoteInfo: {
      url: "https://github.com/me/demo.git",
      platform: "github",
      owner: "me",
      repo: "demo",
    },
  } as GitStatusResult;
  useGitStore.setState({ statuses: { pc: status, [mac.id]: status } });
}

function setMacStatus(status: "online" | "offline") {
  useRemoteServersStore.setState({
    servers: [{ desktopId: "mac", label: "Poracode on MacBook" }],
    runtime: { mac: { status, projects: [], threads: [] } },
  } as never);
}

describe("ProjectEnvironmentScope", () => {
  beforeEach(() => {
    openProjectSettings.mockReset();
    useProjectGroupStore.setState({ manualGroups: {}, lastUsedAt: {} });
    useGitStore.setState({ statuses: {} });
    useAppStore.setState({ projects: [local, mac] });
    setMacStatus("online");
  });

  it("renders no scope UI for a project on a single machine", () => {
    useAppStore.setState({ projects: [local] });
    render(
      <>
        <ProjectEnvironmentScopeBar projectId="pc" section="general" placement="floating" />
        <ProjectScopeHeading projectId="pc" scope="shared" />
        <ProjectScopeHeading projectId="pc" scope="environment" />
        <SharedValueDiff
          setting="Name"
          projectId="pc"
          read={(row) => row.name}
          onApplyEverywhere={vi.fn<() => void>()}
        />
      </>,
    );
    expect(screen.queryByTestId("machine-select")).not.toBeInTheDocument();
    expect(screen.queryByText("All machines")).not.toBeInTheDocument();
    expect(screen.queryByText(/^On /)).not.toBeInTheDocument();
  });

  it("heads shared and machine rows in the Settings idiom", () => {
    linkBoth();
    render(
      <>
        <ProjectScopeHeading projectId={mac.id} scope="shared" />
        <ProjectScopeHeading projectId={mac.id} scope="environment" />
      </>,
    );
    expect(screen.getByText("All machines")).toBeInTheDocument();
    expect(screen.getByText("On MacBook")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Link as the same project/ })).toBeNull();
  });

  it("offers to link machines that only share the project name", () => {
    render(<ProjectScopeHeading projectId="pc" scope="shared" />);
    expect(screen.getByText(/Not shared with MacBook yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Link as the same project/ }));
    const groups = useProjectGroupStore.getState().manualGroups;
    expect(groups.pc).toBeDefined();
    expect(groups[mac.id]).toBe(groups.pc);
  });

  it("reopens settings on the chosen machine and section", () => {
    render(<ProjectEnvironmentScopeBar projectId="pc" section="worktrees" placement="floating" />);
    expect(screen.getByTestId("machine-select")).toHaveAttribute("data-value", "local");
    fireEvent.click(screen.getByRole("button", { name: "Local" }));
    expect(openProjectSettings).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "MacBook" }));
    expect(openProjectSettings).toHaveBeenCalledWith(mac.id, "worktrees");
  });

  it("names linked machines whose shared value differs and applies on request", () => {
    linkBoth();
    const apply = vi.fn<() => void>();
    const { rerender } = render(
      <SharedValueDiff
        setting="Name"
        projectId="pc"
        read={(row) => row.searchSettings}
        onApplyEverywhere={apply}
      />,
    );
    // Key order alone is not a difference.
    expect(screen.queryByText(/Differs on/)).not.toBeInTheDocument();

    rerender(
      <SharedValueDiff
        setting="Name"
        projectId="pc"
        read={(row) => row.name + row.id}
        onApplyEverywhere={apply}
      />,
    );
    expect(screen.getByText("Differs on MacBook")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use this value everywhere for Name" }));
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("ignores machines that are not linked, and waits for an offline one", () => {
    const read = (row: Project) => row.id;
    const { unmount } = render(
      <SharedValueDiff
        projectId="pc"
        setting="Name"
        read={read}
        onApplyEverywhere={vi.fn<() => void>()}
      />,
    );
    expect(screen.queryByText(/Differs on/)).not.toBeInTheDocument();
    unmount();

    linkBoth();
    setMacStatus("offline");
    render(
      <SharedValueDiff
        projectId="pc"
        setting="Name"
        read={read}
        onApplyEverywhere={vi.fn<() => void>()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Use this value everywhere for Name" }),
    ).toBeDisabled();
    expect(screen.getByText("Available when MacBook is back online.")).toBeInTheDocument();
  });

  it("compares values structurally", () => {
    expect(stableJson({ a: 1, b: [2, { d: 1, c: 0 }] })).toBe(
      stableJson({ b: [2, { c: 0, d: 1 }], a: 1 }),
    );
    expect(stableJson(undefined)).toBe(stableJson(null));
    expect(stableJson(["a", "b"])).not.toBe(stableJson(["b", "a"]));
  });
});
