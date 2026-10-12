import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentInstanceConfig, AgentStatus } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const toastMock = vi.hoisted(() => ({
  danger: vi.fn<(message: string) => void>(),
  success: vi.fn<(message: string) => void>(),
}));

vi.mock("@heroui/react", () => {
  return {
    Button: (props: {
      children?: ReactNode;
      type?: string;
      "aria-label"?: string;
      isDisabled?: boolean;
      isPending?: boolean;
      onPress?: () => void;
    }) => (
      <button
        type={props.type === "submit" ? "submit" : "button"}
        aria-label={props["aria-label"]}
        disabled={props.isDisabled}
        onClick={props.onPress}
      >
        {props.children}
      </button>
    ),
    toast: toastMock,
  };
});

vi.mock("@/renderer/components/common", () => ({
  Input: (props: {
    "aria-label"?: string;
    placeholder?: string;
    value?: string;
    onChange?: (event: { target: { value: string } }) => void;
  }) => (
    <input
      aria-label={props["aria-label"]}
      placeholder={props.placeholder}
      value={props.value}
      onChange={props.onChange}
    />
  ),
  Select: (props: {
    "aria-label"?: string;
    value?: string | null;
    placeholder?: string;
    options: readonly { id: string; label: string }[];
    onChange: (value: string) => void;
  }) => (
    <select
      aria-label={props["aria-label"]}
      value={props.value ?? ""}
      onChange={(event) => props.onChange(event.target.value)}
    >
      {!props.value ? <option value="">{props.placeholder ?? "Select…"}</option> : null}
      {props.options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  ),
  PixelLoader: () => <span data-testid="pixel-loader" />,
  ConfirmDialog: (props: {
    isOpen: boolean;
    title: string;
    confirmLabel: string;
    onConfirm: () => void;
  }) =>
    props.isOpen ? (
      <div role="alertdialog" aria-label={props.title}>
        <button type="button" onClick={props.onConfirm}>
          {props.confirmLabel}
        </button>
      </div>
    ) : null,
}));

const refreshAgentStatusesMock = vi.hoisted(() => vi.fn<() => Promise<void>>());
const getSharedSettingsMock = vi.hoisted(() =>
  vi.fn<() => Promise<{ agentInstances: Record<string, unknown> }>>(),
);
const runAgentLoginCommandMock = vi.hoisted(() => vi.fn<(input: unknown) => boolean>());

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({
    refreshAgentStatuses: refreshAgentStatusesMock,
    getSharedSettings: getSharedSettingsMock,
  }),
}));

vi.mock("@/renderer/actions/agentLoginActions", () => ({
  runAgentLoginCommand: runAgentLoginCommandMock,
}));

vi.mock("@/renderer/utils/acpRegistryAuth", () => ({
  currentWslDistros: () => [],
}));

const settingsState = {
  agentInstances: {} as Record<string, AgentInstanceConfig>,
  setAgentInstance: vi.fn<(instance: AgentInstanceConfig) => void>(),
};
const flushSharedSettingsMock = vi.hoisted(() =>
  vi.fn<(options?: { requireSuccess?: boolean }) => Promise<void>>(),
);
vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: (selector: (state: typeof settingsState) => unknown) =>
    selector(settingsState),
  flushSharedSettings: flushSharedSettingsMock,
}));

import {
  DevinAgentSettingsPanel,
  DevinProfileRemovalWarning,
  devinProfileSupport,
} from "./profileSettings";

function devinProfile(overrides: Partial<AgentInstanceConfig> = {}): AgentInstanceConfig {
  return {
    id: "work",
    driver: "devin",
    displayName: "Work",
    config: { format: 1, auth: { kind: "native-default" } },
    ...overrides,
  };
}

function agentStatus(overrides: Partial<AgentStatus> = {}): AgentStatus {
  return {
    kind: "devin:work",
    label: "Devin Work",
    installed: true,
    authState: "missing",
    capabilities: {
      models: [],
      efforts: [],
      modelEfforts: {},
      modes: [],
      approvalPolicies: [],
      sandboxModes: [],
      settingDefs: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "terminal",
      presentationMode: "terminal",
      presentationModes: ["terminal"],
    },
    ...overrides,
  } as AgentStatus;
}

describe("devinProfileSupport.createPayload", () => {
  it("creates a latest-format native-default config, keeping an optional config file", () => {
    expect(
      devinProfileSupport.createPayload({ id: "work", displayName: "Work", field: "" }),
    ).toEqual({
      driver: "devin",
      id: "work",
      displayName: "Work",
      config: { format: 2, auth: { kind: "native-default" } },
    });
    expect(
      devinProfileSupport.createPayload({
        id: "review",
        displayName: "Review",
        field: "~/.config/devin/review.json",
      }).config,
    ).toEqual({
      format: 2,
      auth: { kind: "native-default" },
      configPath: "~/.config/devin/review.json",
    });
  });
});

describe("DevinProfileProviderSettings", () => {
  // Stands in for the host's settings file: `setSharedSettings` writes land
  // here and `getSharedSettings` reads back from it, so the save flow's
  // read-back confirmation sees the same truth the real host holds.
  let persisted: Record<string, AgentInstanceConfig>;

  beforeEach(() => {
    persisted = {};
    settingsState.agentInstances = {};
    settingsState.setAgentInstance.mockReset().mockImplementation((instance) => {
      persisted[instance.id] = instance;
    });
    flushSharedSettingsMock.mockReset().mockResolvedValue(undefined);
    refreshAgentStatusesMock.mockReset().mockResolvedValue();
    getSharedSettingsMock
      .mockReset()
      .mockImplementation(async () => ({ agentInstances: persisted }));
    runAgentLoginCommandMock.mockReset().mockReturnValue(true);
    toastMock.success.mockReset();
    toastMock.danger.mockReset();
  });

  it("renders the stored configuration for editing", () => {
    settingsState.agentInstances = {
      work: devinProfile({
        config: {
          format: 1,
          auth: { kind: "isolated-owner" },
          configPath: "~/.config/devin/work.json",
          orgId: "org-abc",
          runtimeTarget: "cloud",
        },
      }),
    };
    render(<DevinAgentSettingsPanel agentKind="devin:work" statuses={[]} wslDistros={[]} />);
    expect(screen.getByLabelText("Devin profile name")).toHaveValue("Work");
    expect(screen.getByLabelText("Login source")).toHaveValue("isolated-owner");
    expect(screen.getByLabelText("Devin profile config file")).toHaveValue(
      "~/.config/devin/work.json",
    );
    expect(screen.getByLabelText("Devin organization id")).toHaveValue("org-abc");
    expect(screen.getByLabelText("Runtime target")).toHaveValue("cloud");
    // Cloud ignores the root agent type: no select, and no removal note either.
    expect(screen.queryByLabelText("Agent type")).not.toBeInTheDocument();
    expect(screen.queryByText(/root agent type/i)).not.toBeInTheDocument();
    // The workspace note is an ordinary helper, not a warning.
    const workspaceNote = screen.getByText(/Cloud sessions use their own workspace/i);
    expect(workspaceNote.className).not.toContain("text-warning");
    expect(workspaceNote.className).toContain("text-muted");
    // The cloud chat setup section mounts with the product copy.
    expect(screen.getByText("Cloud chat setup")).toBeInTheDocument();
    expect(screen.getByText(/Choose the workspace for new cloud chats/i)).toBeInTheDocument();
    expect(
      screen.getByText(/In CLI mode, configure the workspace from the terminal/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Cloud repositories")).toHaveValue("keep");
    expect(screen.getByLabelText("Cloud persona")).toHaveValue("keep");
    expect(screen.getByLabelText("Cloud platform")).toHaveValue("keep");
  });

  it("saves edits into the latest-format config while preserving unknown keys", async () => {
    settingsState.agentInstances = {
      work: devinProfile({
        config: {
          format: 1,
          auth: { kind: "native-default" },
          orgId: "org-old",
          futureHint: "keep-me",
        },
      }),
    };
    render(<DevinAgentSettingsPanel agentKind="devin:work" statuses={[]} wslDistros={[]} />);
    fireEvent.change(screen.getByLabelText("Devin organization id"), {
      target: { value: "org-new" },
    });
    fireEvent.change(screen.getByLabelText("Devin profile config file"), {
      target: { value: " /tmp/work.json " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Devin profile" }));
    await waitFor(() =>
      expect(settingsState.setAgentInstance).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: "Work",
          config: {
            format: 2,
            auth: { kind: "native-default" },
            configPath: "/tmp/work.json",
            orgId: "org-new",
            futureHint: "keep-me",
          },
        }),
      ),
    );
    // The flush must demand success: a host-rejected write has to reject
    // instead of resolving into fake saved state.
    await waitFor(() =>
      expect(flushSharedSettingsMock).toHaveBeenCalledWith({ requireSuccess: true }),
    );
    // Success is reported only after the host confirmed the write and the
    // status refresh ran.
    await waitFor(() => expect(refreshAgentStatusesMock).toHaveBeenCalled());
    expect(refreshAgentStatusesMock).toHaveBeenCalledWith([], { agentKinds: ["devin:work"] });
    expect(toastMock.success).toHaveBeenCalled();
  });

  it("rolls the candidate back and reports failure when the host never took the write", async () => {
    const stored = devinProfile({
      config: { format: 1, auth: { kind: "native-default" }, orgId: "org-old" },
    });
    settingsState.agentInstances = { work: stored };
    // The host never persists the candidate: the read-back still shows the
    // stored config (what the shared-settings dependency guard produces).
    getSharedSettingsMock.mockResolvedValue({
      agentInstances: {
        work: { id: "work", driver: "devin", displayName: "Work", config: stored.config },
      },
    });
    render(<DevinAgentSettingsPanel agentKind="devin:work" statuses={[]} wslDistros={[]} />);
    fireEvent.change(screen.getByLabelText("Devin organization id"), {
      target: { value: "org-new" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Devin profile" }));
    await waitFor(() => expect(toastMock.danger).toHaveBeenCalled());
    expect(toastMock.success).not.toHaveBeenCalled();
    // The optimistic candidate was rolled back to the stored instance.
    expect(settingsState.setAgentInstance).toHaveBeenLastCalledWith(
      expect.objectContaining({
        config: { format: 1, auth: { kind: "native-default" }, orgId: "org-old" },
      }),
    );
  });

  it("rolls the candidate back when the required flush rejects with a host refusal", async () => {
    const stored = devinProfile({
      config: { format: 1, auth: { kind: "native-default" }, orgId: "org-old" },
    });
    settingsState.agentInstances = { work: stored };
    flushSharedSettingsMock.mockRejectedValueOnce(new Error("profile.dependencyUnavailable"));
    render(<DevinAgentSettingsPanel agentKind="devin:work" statuses={[]} wslDistros={[]} />);
    fireEvent.change(screen.getByLabelText("Devin organization id"), {
      target: { value: "org-new" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Devin profile" }));
    await waitFor(() => expect(toastMock.danger).toHaveBeenCalled());
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(refreshAgentStatusesMock).not.toHaveBeenCalled();
    // The rollback write re-queues the stored instance best-effort.
    expect(settingsState.setAgentInstance).toHaveBeenLastCalledWith(
      expect.objectContaining({
        config: { format: 1, auth: { kind: "native-default" }, orgId: "org-old" },
      }),
    );
  });

  it("blocks a login change that would strand profiles sharing this isolated login", () => {
    settingsState.agentInstances = {
      owner: devinProfile({
        id: "owner",
        displayName: "Owner",
        config: { format: 1, auth: { kind: "isolated-owner" } },
      }),
      shared: devinProfile({
        id: "shared",
        displayName: "Shared",
        config: { format: 1, auth: { kind: "owner-reference", ownerId: "owner" } },
      }),
    };
    render(<DevinAgentSettingsPanel agentKind="devin:owner" statuses={[]} wslDistros={[]} />);
    fireEvent.change(screen.getByLabelText("Login source"), {
      target: { value: "native-default" },
    });
    expect(screen.getByText(/Shared share this profile's isolated login/i)).toBeInTheDocument();
    expect(screen.getByText(/host refuses changes/i)).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Save Devin profile" });
    expect(save).toBeDisabled();
    expect(settingsState.setAgentInstance).not.toHaveBeenCalled();
  });

  it("blocks sharing a login until a usable owner exists, without touching stored data", () => {
    const stored = devinProfile({
      config: { format: 1, auth: { kind: "native-default" }, orgId: "org-keep" },
    });
    settingsState.agentInstances = { work: stored };
    render(<DevinAgentSettingsPanel agentKind="devin:work" statuses={[]} wslDistros={[]} />);
    fireEvent.change(screen.getByLabelText("Login source"), {
      target: { value: "owner-reference" },
    });
    expect(
      screen.getByText(/No profile with its own isolated login exists yet/i),
    ).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Save Devin profile" });
    expect(save).toBeDisabled();
    // Nothing was persisted by exploring the form.
    expect(settingsState.setAgentInstance).not.toHaveBeenCalled();
    expect(stored.config).toEqual({
      format: 1,
      auth: { kind: "native-default" },
      orgId: "org-keep",
    });
  });

  it("flags a missing shared-login owner and blocks Save until another owner is picked", () => {
    settingsState.agentInstances = {
      work: devinProfile({
        config: { format: 1, auth: { kind: "owner-reference", ownerId: "gone" } },
      }),
      owner: devinProfile({
        id: "owner",
        displayName: "Owner",
        config: { format: 1, auth: { kind: "isolated-owner" } },
      }),
    };
    render(<DevinAgentSettingsPanel agentKind="devin:work" statuses={[]} wslDistros={[]} />);
    expect(screen.getByText(/no longer exists or is not usable/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Devin profile" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Shared login owner"), {
      target: { value: "owner" },
    });
    expect(screen.getByRole("button", { name: "Save Devin profile" })).toBeEnabled();
  });

  it("shows a newer-format config read-only with no Save, keeping the data", () => {
    const stored = { format: 3, auth: { kind: "native-default" }, newThing: true };
    const instance = devinProfile({ config: stored });
    settingsState.agentInstances = { work: instance };
    render(<DevinAgentSettingsPanel agentKind="devin:work" statuses={[]} wslDistros={[]} />);
    expect(screen.getByText("Configuration from a newer Poracode")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save Devin profile" })).not.toBeInTheDocument();
    expect(instance.config).toBe(stored);
  });

  it("offers the fallback sign-in for an uninstalled isolated owner with missing auth", () => {
    settingsState.agentInstances = {
      work: devinProfile({ config: { format: 1, auth: { kind: "isolated-owner" } } }),
    };
    const status = agentStatus({
      installed: false,
      loginCommand: "devin auth login",
      authState: "missing",
    });
    render(<DevinAgentSettingsPanel agentKind="devin:work" statuses={[status]} wslDistros={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /Sign in to Devin Work/i }));
    expect(runAgentLoginCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({ command: "devin auth login" }),
    );
  });

  it("leaves sign-in to the generic env rows while the profile is installed", () => {
    settingsState.agentInstances = {
      work: devinProfile({ config: { format: 1, auth: { kind: "isolated-owner" } } }),
    };
    const status = agentStatus({
      loginCommand: "devin auth login",
      authState: "missing",
    });
    render(<DevinAgentSettingsPanel agentKind="devin:work" statuses={[status]} wslDistros={[]} />);
    // The generic page renders one AgentEnvironmentRow login per env above
    // this panel; the custom slot must not duplicate it.
    expect(
      screen.queryByRole("button", { name: /Sign in to Devin Work/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Sign in")).not.toBeInTheDocument();
    expect(runAgentLoginCommandMock).not.toHaveBeenCalled();
  });

  it("points same-login profiles at the base page instead of offering a login", () => {
    settingsState.agentInstances = { work: devinProfile() };
    render(<DevinAgentSettingsPanel agentKind="devin:work" statuses={[]} wslDistros={[]} />);
    expect(screen.getByText(/Sign in or out from the base Devin page/i)).toBeInTheDocument();
    expect(runAgentLoginCommandMock).not.toHaveBeenCalled();
  });

  it("shows stored cloud chat defaults, including the explicit Agent persona", () => {
    settingsState.agentInstances = {
      work: devinProfile({
        config: {
          format: 2,
          auth: { kind: "native-default" },
          runtimeTarget: "cloud",
          cloudDefaults: {
            repositories: ["SDSLeon/zed"],
            persona: "",
            platform: "linux",
          },
        },
      }),
    };
    render(<DevinAgentSettingsPanel agentKind="devin:work" statuses={[]} wslDistros={[]} />);
    expect(screen.getByLabelText("Cloud repositories")).toHaveValue("list");
    expect(screen.getByLabelText("Cloud repository list")).toHaveValue("SDSLeon/zed");
    // persona "" is the explicit Agent choice, seeded as such — not dropped.
    expect(screen.getByLabelText("Cloud persona")).toHaveValue("agent");
    expect(screen.queryByLabelText("Persona ID")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Cloud platform")).toHaveValue("linux");
  });

  it("saving a cloud profile writes explicit choices and removes a stored agent type", async () => {
    settingsState.agentInstances = {
      work: devinProfile({
        config: {
          format: 1,
          auth: { kind: "isolated-owner" },
          runtimeTarget: "cloud",
          agentType: "review",
        },
      }),
    };
    render(<DevinAgentSettingsPanel agentKind="devin:work" statuses={[]} wslDistros={[]} />);
    fireEvent.change(screen.getByLabelText("Cloud repositories"), {
      target: { value: "list" },
    });
    fireEvent.change(screen.getByLabelText("Cloud repository list"), {
      target: { value: "SDSLeon/zed, SDSLeon/lightcode" },
    });
    fireEvent.change(screen.getByLabelText("Cloud persona"), { target: { value: "agent" } });
    fireEvent.change(screen.getByLabelText("Cloud platform"), { target: { value: "windows" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Devin profile" }));
    await waitFor(() =>
      expect(settingsState.setAgentInstance).toHaveBeenCalledWith(
        expect.objectContaining({
          config: {
            format: 2,
            auth: { kind: "isolated-owner" },
            runtimeTarget: "cloud",
            cloudDefaults: {
              repositories: ["SDSLeon/zed", "SDSLeon/lightcode"],
              persona: "",
              platform: "windows",
            },
          },
        }),
      ),
    );
    // The stored root agent type must not survive a cloud save pretending to apply.
    expect(toastMock.success).toHaveBeenCalled();
  });

  it("switching local hides the cloud section and saves the dormant choices untouched", async () => {
    const stored = { repositories: ["acme/web"], futureKnob: { deep: true } };
    settingsState.agentInstances = {
      work: devinProfile({
        config: {
          format: 2,
          auth: { kind: "native-default" },
          runtimeTarget: "cloud",
          cloudDefaults: stored,
        },
      }),
    };
    render(<DevinAgentSettingsPanel agentKind="devin:work" statuses={[]} wslDistros={[]} />);
    expect(screen.getByText("Cloud chat setup")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Runtime target"), {
      target: { value: "local" },
    });
    expect(screen.queryByText("Cloud chat setup")).not.toBeInTheDocument();
    // The local root agent type selector returns for a local profile.
    expect(screen.getByLabelText("Agent type")).toHaveValue("default");
    fireEvent.click(screen.getByRole("button", { name: "Save Devin profile" }));
    await waitFor(() =>
      expect(settingsState.setAgentInstance).toHaveBeenCalledWith(
        expect.objectContaining({
          config: {
            format: 2,
            auth: { kind: "native-default" },
            runtimeTarget: "local",
            cloudDefaults: stored,
          },
        }),
      ),
    );
  });

  it("blocks saving invalid cloud choices and shows the reason until resolved", () => {
    settingsState.agentInstances = {
      work: devinProfile({
        config: {
          format: 2,
          auth: { kind: "native-default" },
          runtimeTarget: "cloud",
        },
      }),
    };
    render(<DevinAgentSettingsPanel agentKind="devin:work" statuses={[]} wslDistros={[]} />);
    fireEvent.change(screen.getByLabelText("Cloud repositories"), {
      target: { value: "list" },
    });
    fireEvent.change(screen.getByLabelText("Cloud repository list"), {
      target: { value: "acme/web, acme/web" },
    });
    expect(screen.getByText(/Repository entries must be unique/i)).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Save Devin profile" });
    expect(save).toBeDisabled();
    expect(settingsState.setAgentInstance).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Cloud persona"), { target: { value: "custom" } });
    expect(screen.getByText(/Enter a persona ID or keep the current choice/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Persona ID"), { target: { value: "ops" } });
    // The duplicate repositories still block Save.
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Cloud repository list"), {
      target: { value: "acme/web, acme/api" },
    });
    expect(save).toBeEnabled();
  });

  it("refuses cloudDefaults under an explicit legacy format and upgrades the record on save", async () => {
    settingsState.agentInstances = {
      work: devinProfile({
        config: {
          format: 1,
          auth: { kind: "native-default" },
          cloudDefaults: { repositories: [] },
        },
      }),
    };
    render(<DevinAgentSettingsPanel agentKind="devin:work" statuses={[]} wslDistros={[]} />);
    // The combination is visibly invalid, not silently accepted.
    expect(screen.getByText(/stored configuration is invalid/i)).toBeInTheDocument();
    // No cloud section: the unusable view cannot seed honest choices.
    expect(screen.queryByText("Cloud chat setup")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save Devin profile" }));
    await waitFor(() =>
      expect(settingsState.setAgentInstance).toHaveBeenCalledWith(
        expect.objectContaining({
          config: {
            format: 2,
            auth: { kind: "native-default" },
            cloudDefaults: { repositories: [] },
          },
        }),
      ),
    );
    // The upgrade rewrote the record as format 2, where the choices apply.
    expect(toastMock.success).toHaveBeenCalled();
  });
});

describe("DevinProfileRowSubtitle via the profile list", () => {
  it("labels each login source, cloud target, and unusable configs", () => {
    settingsState.agentInstances = {
      native: devinProfile({ id: "native", displayName: "Native" }),
      owner: devinProfile({
        id: "owner",
        displayName: "Owner",
        config: { format: 1, auth: { kind: "isolated-owner" } },
      }),
      shared: devinProfile({
        id: "shared",
        displayName: "Shared",
        config: {
          format: 1,
          auth: { kind: "owner-reference", ownerId: "owner" },
          runtimeTarget: "cloud",
        },
      }),
      future: devinProfile({
        id: "future",
        displayName: "Future",
        config: { format: 9, auth: { kind: "native-default" } },
      }),
    };
    render(<DevinAgentSettingsPanel agentKind="devin" statuses={[]} wslDistros={[]} />);
    expect(screen.getByText("Same login as Devin")).toBeInTheDocument();
    expect(screen.getByText("Own isolated login")).toBeInTheDocument();
    expect(screen.getByText(/Shares Owner/)).toBeInTheDocument();
    expect(screen.getByText(/newer Poracode format/i)).toBeInTheDocument();
  });
});

describe("DevinProfileRemovalWarning", () => {
  it("lists dependent profiles and renders nothing without them", () => {
    const dependents = [
      devinProfile({ id: "a", displayName: "Alpha" }),
      devinProfile({ id: "b", displayName: "Beta" }),
    ];
    const { container } = render(<DevinProfileRemovalWarning dependents={dependents} />);
    expect(
      screen.getByText(/Alpha, Beta share this profile's isolated login/i),
    ).toBeInTheDocument();
    expect(container.firstChild).not.toBeNull();

    const { container: empty } = render(<DevinProfileRemovalWarning dependents={[]} />);
    expect(empty.firstChild).toBeNull();
  });
});
