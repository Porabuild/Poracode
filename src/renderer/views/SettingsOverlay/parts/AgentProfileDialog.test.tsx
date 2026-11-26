import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { msg } from "@lingui/core/macro";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AgentInstanceConfig,
  AgentStatus,
  CreateProfilePayload,
  Project,
} from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { AgentSettingsHost } from "@/renderer/components/providers/settings/AgentSettingsHostContext";
import { opencodeProfileSupport } from "@/renderer/components/providers/opencode/profileSettings";
import { claudeLocalProfileCreatePayload } from "@/renderer/components/providers/settings/ClaudeProfileSettingsModel";
import { claudeProfileSupport } from "@/renderer/components/providers/settings/ClaudeProfileSettings";
import { codexProfileSupport } from "@/renderer/components/providers/codex/profileSettings";
import { AgentProfileDialog, type AgentProfileHarnessOption } from "./AgentProfileDialog";
import type { startOllamaModelPull } from "./ollamaModelPull";

const ollamaPullMock = vi.hoisted(() => ({
  start: vi.fn<typeof startOllamaModelPull>(),
  cancel: vi.fn<() => Promise<void>>(),
}));
const prepareContextMock = vi.hoisted(() =>
  vi.fn<(input: unknown) => Promise<string>>(async () => "poracode-ctx-65536-prepared"),
);
const openExternalMock = vi.hoisted(() => vi.fn<(url: string) => void>());
const toastMock = vi.hoisted(() => ({
  danger: vi.fn<(message: string) => void>(),
  success: vi.fn<(message: string) => void>(),
}));
const createProfileMock = vi.hoisted(() =>
  vi.fn<(payload: CreateProfilePayload) => Promise<AgentInstanceConfig>>(),
);
const flushSharedSettingsMock = vi.hoisted(() => vi.fn<() => Promise<void>>());

vi.mock("@heroui/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@heroui/react")>()),
  toast: toastMock,
}));
vi.mock("@/renderer/utils/openExternal", () => ({
  openExternalWithFeedback: openExternalMock,
}));
vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  flushSharedSettings: flushSharedSettingsMock,
}));
vi.mock("./ollamaModelPull", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ollamaModelPull")>()),
  startOllamaModelPull: ollamaPullMock.start,
}));
vi.mock("./ollamaModelContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ollamaModelContext")>()),
  prepareOllamaContextModel: prepareContextMock,
}));

const opencodeHarness: AgentProfileHarnessOption = {
  driver: "opencode",
  label: msg`OpenCode`,
  support: opencodeProfileSupport,
};
const claudeHarness: AgentProfileHarnessOption = {
  driver: "claude",
  label: msg`Claude Code`,
  support: claudeProfileSupport,
};
const codexHarness: AgentProfileHarnessOption = {
  driver: "codex",
  label: msg`Codex`,
  support: codexProfileSupport,
};

function settingsHost(overrides: Partial<AgentSettingsHost> = {}): AgentSettingsHost {
  return {
    key: "local",
    connectionKey: undefined,
    isRemote: false,
    isOnline: true,
    canWrite: true,
    machineProject: undefined,
    canManageProfiles: true,
    canEditSecrets: true,
    callProcedure: vi.fn<AgentSettingsHost["callProcedure"]>(),
    rediscoverAgents: vi.fn<AgentSettingsHost["rediscoverAgents"]>(async () => ({
      windows: [],
      wsl: [],
    })),
    setAgentSetting: vi.fn<AgentSettingsHost["setAgentSetting"]>(),
    saveAgentSettings: vi.fn<AgentSettingsHost["saveAgentSettings"]>(async () => undefined),
    setAgentDisabled: vi.fn<AgentSettingsHost["setAgentDisabled"]>(),
    setHiddenModels: vi.fn<AgentSettingsHost["setHiddenModels"]>(),
    createProfile: createProfileMock,
    updateProfile: vi.fn<AgentSettingsHost["updateProfile"]>(),
    setProfileEnvironment: vi.fn<AgentSettingsHost["setProfileEnvironment"]>(),
    removeProfile: vi.fn<AgentSettingsHost["removeProfile"]>(),
    ...overrides,
  } as AgentSettingsHost;
}

function machineProjectFixture(): Project {
  return {
    id: "__machine__:posix",
    name: "Mac mini",
    disabled: false,
    createdAt: new Date(0).toISOString(),
    location: { kind: "posix", path: "~" },
  };
}

function statusWithModels(models: string[]): AgentStatus {
  return {
    kind: "opencode",
    label: "OpenCode",
    installed: true,
    authState: "authenticated",
    capabilities: {
      models: models.map((id) => ({ id, label: id })),
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
  };
}

function renderDialog(
  input: {
    harnesses?: readonly AgentProfileHarnessOption[];
    initialDriver?: string;
    agentInstances?: Readonly<Record<string, AgentInstanceConfig>>;
    statuses?: readonly AgentStatus[];
    host?: AgentSettingsHost;
    workspaceIsClientDevice?: boolean;
    hostLabel?: string;
  } = {},
) {
  const onDismiss = vi.fn<() => void>();
  const onCreated = vi.fn<(kind: string) => void>();
  render(
    <AgentProfileDialog
      harnesses={input.harnesses ?? [opencodeHarness]}
      initialDriver={input.initialDriver ?? "opencode"}
      settingsHost={input.host ?? settingsHost()}
      agentInstances={input.agentInstances ?? {}}
      statuses={input.statuses ?? []}
      workspaceIsClientDevice={input.workspaceIsClientDevice}
      {...(input.hostLabel ? { hostLabel: input.hostLabel } : {})}
      onDismiss={onDismiss}
      onCreated={onCreated}
    />,
  );
  return { onDismiss, onCreated };
}

describe("AgentProfileDialog", () => {
  beforeEach(() => {
    createProfileMock.mockReset().mockImplementation(async (payload) => ({
      id: payload.id,
      driver: payload.driver,
      displayName: payload.displayName,
    }));
    flushSharedSettingsMock.mockReset().mockResolvedValue();
    toastMock.success.mockReset();
    toastMock.danger.mockReset();
    openExternalMock.mockReset();
    ollamaPullMock.cancel.mockReset().mockResolvedValue(undefined);
    ollamaPullMock.start.mockReset().mockImplementation(() => ({
      shellId: "ollama-pull:test",
      cancel: ollamaPullMock.cancel,
    }));
    prepareContextMock
      .mockReset()
      .mockResolvedValue("poracode-ctx-65536-0123456789ab-0123456789abcdef");
  });

  it("creates an OpenCode local profile with the exact model id and route factory payload", async () => {
    const { onCreated, onDismiss } = renderDialog();
    fireEvent.change(screen.getByLabelText("New profile name"), { target: { value: "Work" } });
    fireEvent.change(screen.getByLabelText("Model"), {
      target: { value: "qwen3-coder:30b" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(createProfileMock).toHaveBeenCalledWith({
        driver: "opencode",
        id: "work",
        displayName: "Work",
        config: {
          connection: "local",
          endpoint: "http://127.0.0.1:11434/v1",
          model: "qwen3-coder:30b",
        },
      }),
    );
    expect(flushSharedSettingsMock).toHaveBeenCalled();
    expect(toastMock.success).toHaveBeenCalledWith("Profile Work added.");
    expect(onCreated).toHaveBeenCalledWith("opencode:work");
    expect(onDismiss).toHaveBeenCalled();
  });

  it("prepares a selected Ollama context on the selected host before sealing the profile", async () => {
    renderDialog({
      host: settingsHost({
        machineProject: machineProjectFixture(),
        canOperateTerminal: true,
        canReadTerminal: true,
      }),
    });
    fireEvent.change(screen.getByLabelText("New profile name"), { target: { value: "Work" } });
    fireEvent.change(screen.getByLabelText("Model"), {
      target: { value: "qwen3-coder:30b" },
    });
    prepareContextMock.mockResolvedValueOnce("poracode-ctx-88000-0123456789ab-0123456789abcdef");
    fireEvent.change(screen.getByLabelText("Context length"), { target: { value: "88000" } });
    expect(screen.getByLabelText("Context length")).toHaveValue(88000);
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(prepareContextMock).toHaveBeenCalledWith(
        expect.objectContaining({
          project: expect.objectContaining({ id: "__machine__:posix" }),
          baseModel: "qwen3-coder:30b",
          contextLength: 88000,
          alias: expect.stringMatching(/^poracode-ctx-88000-/u),
        }),
      ),
    );
    await waitFor(() =>
      expect(createProfileMock).toHaveBeenCalledWith({
        driver: "opencode",
        id: "work",
        displayName: "Work",
        config: {
          connection: "local",
          endpoint: "http://127.0.0.1:11434/v1",
          model: "poracode-ctx-88000-0123456789ab-0123456789abcdef",
          baseModel: "qwen3-coder:30b",
          contextLength: 88000,
        },
      }),
    );
  });

  it("uses the current typed value when Create is clicked after editing or clearing", async () => {
    renderDialog({
      host: settingsHost({
        machineProject: machineProjectFixture(),
        canOperateTerminal: true,
        canReadTerminal: true,
      }),
    });
    fireEvent.change(screen.getByLabelText("New profile name"), { target: { value: "Work" } });
    fireEvent.change(screen.getByLabelText("Model"), {
      target: { value: "qwen3-coder:30b" },
    });
    const context = screen.getByLabelText("Context length");
    fireEvent.change(context, { target: { value: "88000" } });
    fireEvent.change(context, { target: { value: "" } });
    expect(context).toHaveValue(null);
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(createProfileMock).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ model: "qwen3-coder:30b" }),
        }),
      ),
    );
    expect(prepareContextMock).not.toHaveBeenCalled();
    expect(createProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.not.objectContaining({ contextLength: expect.anything() }),
      }),
    );
  });

  it("blocks Create on malformed, decimal, zero, or out-of-range counts", () => {
    renderDialog({
      host: settingsHost({
        machineProject: machineProjectFixture(),
        canOperateTerminal: true,
        canReadTerminal: true,
      }),
    });
    fireEvent.change(screen.getByLabelText("New profile name"), { target: { value: "Work" } });
    fireEvent.change(screen.getByLabelText("Model"), {
      target: { value: "qwen3-coder:30b" },
    });
    const context = screen.getByLabelText("Context length");
    for (const value of ["1.5", "0", "999", "10000001"]) {
      fireEvent.change(context, { target: { value } });
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Enter a whole number from 1000 to 10000000.",
      );
      expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
    }
  });

  it("disables context without host terminal/project access and never prepares on default", async () => {
    renderDialog({
      host: settingsHost({ canOperateTerminal: false, canReadTerminal: false }),
    });
    expect(screen.getByLabelText("Context length")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("New profile name"), { target: { value: "Work" } });
    fireEvent.change(screen.getByLabelText("Model"), {
      target: { value: "qwen3-coder:30b" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(createProfileMock).toHaveBeenCalled());
    expect(prepareContextMock).not.toHaveBeenCalled();
    expect(createProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.not.objectContaining({ contextLength: expect.anything() }),
      }),
    );
  });

  it("does not create a profile when context preparation fails", async () => {
    prepareContextMock.mockRejectedValueOnce(new Error("Ollama is not reachable."));
    renderDialog({
      host: settingsHost({
        machineProject: machineProjectFixture(),
        canOperateTerminal: true,
        canReadTerminal: true,
      }),
    });
    fireEvent.change(screen.getByLabelText("New profile name"), { target: { value: "Work" } });
    fireEvent.change(screen.getByLabelText("Model"), {
      target: { value: "qwen3-coder:30b" },
    });
    fireEvent.change(screen.getByLabelText("Context length"), { target: { value: "88000" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(toastMock.danger).toHaveBeenCalledWith("Ollama is not reachable."));
    expect(createProfileMock).not.toHaveBeenCalled();
  });

  it("keeps the existing agent-default payload and derived field default", async () => {
    const { onCreated } = renderDialog({ harnesses: [codexHarness], initialDriver: "codex" });
    fireEvent.click(screen.getByRole("tab", { name: "Agent default" }));
    expect(screen.getByRole("tab", { name: "Agent default" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.change(screen.getByLabelText("New profile name"), { target: { value: "Work" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(createProfileMock).toHaveBeenCalledWith({
        driver: "codex",
        id: "work",
        displayName: "Work",
        config: { homeDir: "~/.poracode/codex-profiles/work" },
      }),
    );
    expect(onCreated).toHaveBeenCalledWith("codex:work");
  });

  it("builds the Claude local payload through the provider resolver", () => {
    const payload = claudeLocalProfileCreatePayload({
      id: "work",
      displayName: "Work",
      endpoint: "http://127.0.0.1:11434",
      model: "qwen3-coder:30b",
    });
    expect(payload).toMatchObject({
      driver: "claude",
      id: "work",
      displayName: "Work",
      config: {
        configDir: "~/.poracode/claude-profiles/work",
        models: [{ id: "qwen3-coder:30b" }],
        local: { endpoint: "http://127.0.0.1:11434", model: "qwen3-coder:30b" },
      },
    });
    // Shadows are supplied by the runtime; persistence drops empty values.
    expect(payload.environment).toBeUndefined();
  });

  it("creates a Claude local profile from the dialog with its config dir and scoped auth", async () => {
    renderDialog({ harnesses: [claudeHarness], initialDriver: "claude" });
    fireEvent.change(screen.getByLabelText("New profile name"), { target: { value: "Work" } });
    fireEvent.change(screen.getByLabelText("Model"), {
      target: { value: "qwen3-coder:30b" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(createProfileMock).toHaveBeenCalledWith(
        expect.objectContaining({
          driver: "claude",
          id: "work",
          config: {
            configDir: "~/.poracode/claude-profiles/work",
            models: [{ id: "qwen3-coder:30b" }],
            local: { endpoint: "http://127.0.0.1:11434", model: "qwen3-coder:30b" },
          },
        }),
      ),
    );
  });

  it("switches servers by binding the Ollama URL and clearing the model for a custom endpoint", () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText("New profile name"), { target: { value: "Work" } });
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "keep-me" } });

    fireEvent.click(screen.getByRole("tab", { name: "Other server" }));
    expect(screen.getByLabelText("Model")).toHaveValue("");
    expect(screen.getByLabelText("Server address")).toHaveValue("");
    expect(screen.getByLabelText("Server address")).not.toHaveAttribute("readonly");

    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
    expect(createProfileMock).not.toHaveBeenCalled();
  });

  it("offers exact model ids detected on the host and excludes cloud aliases", async () => {
    renderDialog({
      statuses: [
        statusWithModels([
          "ollama/qwen3-coder:30b",
          "ollama/llama3.2:3b",
          "ollama/kimi:cloud",
          "openai/gpt-5",
        ]),
      ],
    });
    const model = screen.getByLabelText("Model");
    fireEvent.click(screen.getByRole("button", { name: "Show model suggestions" }));
    fireEvent.change(model, { target: { value: "qwen" } });
    expect(await screen.findByRole("option", { name: "qwen3-coder:30b" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "kimi:cloud" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "qwen3-coder:30b" }));
    expect(screen.getByLabelText("Model")).toHaveValue("qwen3-coder:30b");
  });

  it.each([
    ["Claude Code", claudeHarness],
    ["Codex", codexHarness],
  ])("shares the same host Ollama inventory with %s", async (_label, harness) => {
    renderDialog({
      harnesses: [harness],
      initialDriver: harness.driver,
      statuses: [statusWithModels(["ollama/qwen3-coder:30b"])],
    });
    fireEvent.click(screen.getByRole("button", { name: "Show model suggestions" }));
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "qwen" } });
    expect(await screen.findByRole("option", { name: "qwen3-coder:30b" })).toBeInTheDocument();
  });

  it("blocks duplicate names for the selected harness", () => {
    renderDialog({
      agentInstances: { work: { id: "work", driver: "opencode", displayName: "Work" } },
    });
    fireEvent.change(screen.getByLabelText("New profile name"), { target: { value: "Work" } });

    expect(screen.getByRole("alert")).toHaveTextContent("already exists for this harness");
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(createProfileMock).not.toHaveBeenCalled();
  });

  it("allocates a unique id when another harness already owns the slug", async () => {
    renderDialog({
      agentInstances: { work: { id: "work", driver: "codex", displayName: "Other" } },
    });
    fireEvent.change(screen.getByLabelText("New profile name"), { target: { value: "Work" } });
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "qwen3-coder:30b" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(createProfileMock).toHaveBeenCalledWith(
        expect.objectContaining({ driver: "opencode", id: "work-2", displayName: "Work" }),
      ),
    );
  });

  it("cancels without creating or flushing", () => {
    const { onDismiss } = renderDialog();
    fireEvent.change(screen.getByLabelText("New profile name"), { target: { value: "Work" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onDismiss).toHaveBeenCalled();
    expect(createProfileMock).not.toHaveBeenCalled();
    expect(flushSharedSettingsMock).not.toHaveBeenCalled();
  });

  it("disables creation when the host cannot manage profiles or write", () => {
    renderDialog({ host: settingsHost({ canWrite: false }) });
    fireEvent.change(screen.getByLabelText("New profile name"), { target: { value: "Work" } });
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "m" } });
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("renders the three connection tabs with panel association and no inline model list", () => {
    renderDialog();
    expect(screen.getByText("Profile name")).toBeInTheDocument();
    expect(screen.getByLabelText("Model")).toHaveAttribute(
      "placeholder",
      "Choose or enter a model ID",
    );
    const tablist = screen.getByRole("tablist", { name: "Connection" });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Agent default",
      "Local Ollama",
      "Other server",
    ]);
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("aria-controls", screen.getByRole("tabpanel").id);
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", tabs[1]?.id);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Detected on this host")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "About the server address" }));
    expect(screen.getByText(/Ollama on this host: http:\/\/127\.0\.0\.1:11434\/v1/)).toBeVisible();
  });

  it("changes tabs by mouse and keyboard without stuck aria-selected", () => {
    renderDialog();
    const tablist = screen.getByRole("tablist", { name: "Connection" });
    const other = within(tablist).getByRole("tab", { name: "Other server" });
    fireEvent.click(other);
    expect(other).toHaveAttribute("aria-selected", "true");
    expect(within(tablist).getByRole("tab", { name: "Local Ollama" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    fireEvent.keyDown(other, { key: "ArrowLeft" });
    expect(within(tablist).getByRole("tab", { name: "Local Ollama" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(other).toHaveAttribute("aria-selected", "false");
  });

  it("opens Add model as a nested modal and returns only the served ID", async () => {
    renderDialog({ workspaceIsClientDevice: true, hostLabel: "This Mac" });
    const addButton = screen.getByRole("button", { name: "Add model…" });
    const parent = screen.getByRole("dialog", { name: "Add profile" });
    const parentContent = parent.textContent;
    addButton.focus();
    fireEvent.click(addButton);
    const child = screen.getByRole("dialog", { name: "Add model" });
    expect(parent.textContent).toBe(parentContent);
    expect(within(child).getByText("Ollama on This Mac")).toBeInTheDocument();
    expect(within(parent).queryByText("Hugging Face")).not.toBeInTheDocument();
    expect(within(child).getByRole("tablist", { name: "Source" }).closest(".w-fit")).not.toBeNull();
    expect(within(child).queryByLabelText("Served model ID")).not.toBeInTheDocument();
    fireEvent.click(within(child).getByRole("tab", { name: "Hugging Face" }));
    fireEvent.click(within(child).getByRole("button", { name: "About model sources" }));
    expect(within(child).getByText(/Nothing is uploaded here/)).toBeVisible();
    expect(within(child).queryByText(/not readable by a remote server/)).not.toBeInTheDocument();
    expect(within(child).getByLabelText("Hugging Face revision")).toHaveValue("main");
    fireEvent.click(within(child).getByRole("tab", { name: "File" }));
    expect(within(child).queryByRole("tablist", { name: "File location" })).not.toBeInTheDocument();
    expect(within(child).getByText("Model file")).toBeInTheDocument();
    const fileInput = within(child).getByLabelText("Choose a model file");
    expect(fileInput).toHaveAttribute("tabindex", "-1");
    expect(fileInput).toHaveAttribute("aria-hidden", "true");
    fireEvent.change(fileInput, {
      target: { files: [new File(["weights"], "weights.gguf")] },
    });
    expect(within(child).getByText("weights.gguf")).toBeInTheDocument();
    fireEvent.change(within(child).getByLabelText("Served model ID"), {
      target: { value: "qwen3-coder:30b" },
    });
    within(child).getByLabelText("Served model ID").focus();
    fireEvent.click(within(child).getByRole("button", { name: "About the served model ID" }));
    expect(within(child).getByText(/Nothing is uploaded or imported here/)).toBeVisible();
    fireEvent.click(within(child).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(document.activeElement).toBe(addButton));
    expect(screen.queryByRole("dialog", { name: "Add model" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Add profile" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add model…" }));
    const reopened = screen.getByRole("dialog", { name: "Add model" });
    fireEvent.click(within(reopened).getByRole("tab", { name: "Hugging Face" }));
    fireEvent.change(within(reopened).getByLabelText("Served model ID"), {
      target: { value: "" },
    });
    fireEvent.click(within(reopened).getByRole("button", { name: "Use model" }));
    // Empty served ID must not fabricate one; panel stays open.
    expect(screen.getByRole("dialog", { name: "Add model" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Served model ID"), {
      target: { value: "qwen3-coder:30b" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Use model" }));
    expect(screen.getByLabelText("Model")).toHaveValue("qwen3-coder:30b");
    expect(screen.getByLabelText("Model")).not.toHaveValue("weights.gguf");
  });

  it("searches the curated local-model shortlist without starting a pull", async () => {
    renderDialog({
      host: settingsHost({ machineProject: machineProjectFixture(), machineLabel: "Mac mini" }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Add model…" }));
    const child = screen.getByRole("dialog", { name: "Add model" });
    const model = within(child).getByLabelText("Model");

    expect(model).toHaveAttribute("placeholder", "Search or enter a model tag");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    fireEvent.click(within(child).getByRole("button", { name: "Browse full library" }));
    expect(openExternalMock).toHaveBeenCalledWith("https://ollama.com/search?c=local");

    fireEvent.click(within(child).getByRole("button", { name: "Show model suggestions" }));
    expect(await screen.findByRole("option", { name: /Llama 3\.2/ })).toBeInTheDocument();
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      expect.stringContaining("llama3.2:3b"),
      expect.stringContaining("gemma3:4b"),
      expect.stringContaining("qwen3:8b"),
      expect.stringContaining("gpt-oss:20b"),
      expect.stringContaining("qwen3-coder:30b"),
      expect.stringContaining("inkling-2-mini:latest"),
    ]);
    expect(screen.getByRole("option", { name: /llama3\.2:3b/ })).toHaveTextContent("~2 GB");
    expect(screen.getByRole("option", { name: /gpt-oss/ })).toHaveTextContent("~14 GB");
    expect(screen.getByRole("option", { name: /Inkling 2 Mini/ })).toHaveTextContent("~20 GB");

    fireEvent.change(model, { target: { value: "coder" } });
    expect(await screen.findByRole("option", { name: /Qwen3 Coder/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Llama 3\.2/ })).not.toBeInTheDocument();
    expect(ollamaPullMock.start).not.toHaveBeenCalled();
  });

  it("selects a suggestion by keyboard, keeps arbitrary tags, and dismisses only the list", async () => {
    renderDialog({
      host: settingsHost({ machineProject: machineProjectFixture(), machineLabel: "Mac mini" }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Add model…" }));
    const child = screen.getByRole("dialog", { name: "Add model" });
    const model = within(child).getByLabelText("Model");

    fireEvent.click(within(child).getByRole("button", { name: "Show model suggestions" }));
    fireEvent.change(model, { target: { value: "qwen" } });
    expect((await screen.findAllByRole("option", { name: /Qwen3/ })).length).toBeGreaterThan(0);
    fireEvent.keyDown(model, { key: "ArrowDown" });
    fireEvent.keyDown(model, { key: "Enter" });
    await waitFor(() => expect(model).toHaveValue("qwen3:8b"));
    expect(ollamaPullMock.start).not.toHaveBeenCalled();

    fireEvent.click(within(child).getByRole("button", { name: "Show model suggestions" }));
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    fireEvent.keyDown(model, { key: "Escape", code: "Escape", keyCode: 27 });
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    expect(screen.getByRole("dialog", { name: "Add model" })).toBeInTheDocument();

    fireEvent.change(model, { target: { value: "acme/custom:q4" } });
    expect(model).toHaveValue("acme/custom:q4");
    expect(within(child).getByRole("button", { name: "Download" })).toBeEnabled();
  });

  it("downloads an Ollama tag with visible progress and uses only the completed exact tag", async () => {
    const host = settingsHost({
      machineProject: machineProjectFixture(),
      machineLabel: "Mac mini",
    });
    renderDialog({ host, hostLabel: "Mac mini" });
    fireEvent.click(screen.getByRole("button", { name: "Add model…" }));
    const child = screen.getByRole("dialog", { name: "Add model" });

    expect(within(child).queryByLabelText("Served model ID")).not.toBeInTheDocument();
    expect(within(child).getByRole("button", { name: "Use model" })).toBeDisabled();
    fireEvent.change(within(child).getByLabelText("Model"), {
      target: { value: "fixture-model:smoke" },
    });
    fireEvent.click(within(child).getByRole("button", { name: "Download" }));

    expect(within(child).getByText("Ollama on Mac mini")).toBeInTheDocument();
    expect(ollamaPullMock.start).toHaveBeenCalledOnce();
    const pullInput = ollamaPullMock.start.mock.calls[0]?.[0];
    expect(pullInput?.project).toEqual(machineProjectFixture());
    expect(pullInput?.tag).toBe("fixture-model:smoke");
    act(() => {
      pullInput?.onOutput("pulling manifest\n");
      pullInput?.onOutput("50%");
    });
    expect(
      within(child).getByRole("progressbar", { name: "Ollama model download progress" }),
    ).toHaveAttribute("aria-valuenow", "50");
    expect(within(child).getByRole("button", { name: "Use model" })).toBeDisabled();

    act(() => pullInput?.onComplete({ status: "success" }));
    expect(within(child).getByText("Downloaded fixture-model:smoke.")).toBeInTheDocument();
    expect(within(child).getByLabelText("Model")).toHaveValue("fixture-model:smoke");
    expect(within(child).queryByRole("button", { name: "Download" })).not.toBeInTheDocument();
    expect(within(child).queryByRole("button", { name: "Retry download" })).not.toBeInTheDocument();
    expect(host.rediscoverAgents).toHaveBeenCalled();
    fireEvent.click(within(child).getByRole("button", { name: "Use model" }));

    expect(screen.getByLabelText("Model")).toHaveValue("fixture-model:smoke");
    expect(screen.queryByRole("dialog", { name: "Add model" })).not.toBeInTheDocument();
  });

  it("shows pull failure without enabling Use model", async () => {
    renderDialog({
      host: settingsHost({ machineProject: machineProjectFixture(), machineLabel: "Mac mini" }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Add model…" }));
    const child = screen.getByRole("dialog", { name: "Add model" });
    fireEvent.change(within(child).getByLabelText("Model"), {
      target: { value: "fixture-model:smoke" },
    });
    fireEvent.click(within(child).getByRole("button", { name: "Download" }));
    const pullInput = ollamaPullMock.start.mock.calls[0]?.[0];

    act(() => pullInput?.onOutput("pulling manifest\nerror: no such model\n"));
    act(() => pullInput?.onComplete({ status: "failed", exitCode: 1 }));

    expect(within(child).getByText("Download failed.")).toBeInTheDocument();
    const detailsSummary = within(child).getByText("Details");
    const details = detailsSummary.closest("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    fireEvent.click(detailsSummary);
    expect(details).toHaveAttribute("open");
    expect(details).toHaveTextContent("error: no such model");
    expect(within(child).getByRole("button", { name: "Use model" })).toBeDisabled();
    expect(within(child).getByRole("button", { name: "Retry download" })).toBeEnabled();
  });

  it("keeps cancellation unconfirmed without allowing a second download", async () => {
    let confirmCancel!: () => void;
    ollamaPullMock.cancel.mockReturnValue(
      new Promise<void>((resolve) => {
        confirmCancel = resolve;
      }),
    );
    renderDialog({
      host: settingsHost({ machineProject: machineProjectFixture(), machineLabel: "Mac mini" }),
      hostLabel: "Mac mini",
    });
    fireEvent.click(screen.getByRole("button", { name: "Add model…" }));
    const child = screen.getByRole("dialog", { name: "Add model" });
    fireEvent.change(within(child).getByLabelText("Model"), {
      target: { value: "fixture-model:smoke" },
    });
    fireEvent.click(within(child).getByRole("button", { name: "Download" }));
    const huggingFaceTab = within(child).getByRole("tab", { name: "Hugging Face" });
    const fileTab = within(child).getByRole("tab", { name: "File" });
    expect(huggingFaceTab).toHaveAttribute("aria-disabled", "true");
    expect(fileTab).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(huggingFaceTab);
    fireEvent.click(fileTab);

    expect(ollamaPullMock.cancel).not.toHaveBeenCalled();
    expect(within(child).getByText("Downloading")).toBeInTheDocument();
    expect(within(child).getByRole("button", { name: "Cancel download" })).toBeVisible();
    expect(within(child).queryByLabelText("Hugging Face repository")).not.toBeInTheDocument();
    fireEvent.click(within(child).getByRole("button", { name: "Cancel download" }));
    expect(ollamaPullMock.cancel).toHaveBeenCalledOnce();
    expect(within(child).getByText("Cancelling download…")).toBeInTheDocument();
    expect(within(child).queryByText("Download cancelled.")).not.toBeInTheDocument();
    expect(within(child).queryByRole("button", { name: "Download" })).not.toBeInTheDocument();
    expect(within(child).getByRole("button", { name: "Use model" })).toBeDisabled();
    expect(within(child).getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.keyDown(child, { key: "Escape", code: "Escape", keyCode: 27 });
    expect(screen.getByRole("dialog", { name: "Add model" })).toBeInTheDocument();
    expect(ollamaPullMock.start).toHaveBeenCalledOnce();

    await act(async () => confirmCancel());
    expect(await within(child).findByText("Download cancelled.")).toBeInTheDocument();
    expect(within(child).getByRole("button", { name: "Retry download" })).toBeEnabled();
    expect(huggingFaceTab).not.toHaveAttribute("aria-disabled", "true");
    fireEvent.click(huggingFaceTab);
    expect(within(child).getByLabelText("Hugging Face repository")).toBeInTheDocument();
  });

  it("rejects cloud aliases and missing terminal scope before starting a pull", () => {
    renderDialog({
      host: settingsHost({
        machineProject: machineProjectFixture(),
        machineLabel: "Mac mini",
        canOperateTerminal: false,
      }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Add model…" }));
    const child = screen.getByRole("dialog", { name: "Add model" });
    expect(within(child).getByText(/does not allow terminal access/)).toBeInTheDocument();
    fireEvent.change(within(child).getByLabelText("Model"), {
      target: { value: "kimi:cloud" },
    });
    expect(within(child).getByText(/Cloud models are not supported/)).toBeInTheDocument();
    expect(within(child).getByRole("button", { name: "Download" })).toBeDisabled();
    fireEvent.click(within(child).getByRole("button", { name: "Download" }));
    expect(ollamaPullMock.start).not.toHaveBeenCalled();
    expect(within(child).getByRole("button", { name: "Use model" })).toBeDisabled();
  });

  it("shows explicit file locations only when the serving host is not this client", () => {
    renderDialog({ workspaceIsClientDevice: false });
    fireEvent.click(screen.getByRole("tab", { name: "Other server" }));
    fireEvent.change(screen.getByLabelText("Server address"), {
      target: { value: "http://192.168.1.20:8000/v1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add model…" }));
    const child = screen.getByRole("dialog", { name: "Add model" });
    fireEvent.click(within(child).getByRole("tab", { name: "File" }));
    fireEvent.click(within(child).getByRole("button", { name: "About model sources" }));
    expect(within(child).getByText(/not readable by a remote server/)).toBeVisible();
    const locations = within(child).getByRole("tablist", { name: "File location" });
    expect(within(locations).getByRole("tab", { name: "This computer" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(within(locations).getByRole("tab", { name: "On the server" }));
    expect(within(child).getByLabelText("File path on the server")).toHaveAttribute(
      "placeholder",
      "/srv/models/org-model",
    );
    expect(within(child).getByText("http://192.168.1.20:8000/v1")).toBeInTheDocument();
  });

  it("renders exactly one help trigger and one matching region per active server panel", () => {
    renderDialog();
    expect(screen.getAllByRole("button", { name: "About the server address" })).toHaveLength(1);
    const modelTrigger = screen.getByRole("button", { name: "About the server address" });
    const modelRegionId = modelTrigger.getAttribute("aria-controls");
    expect(modelRegionId).toMatch(/-model-help$/);
    expect(document.getElementById(modelRegionId!)).not.toBeNull();
    expect(document.querySelector('[id$="-address-help"]')).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Other server" }));
    expect(screen.getAllByRole("button", { name: "About the server address" })).toHaveLength(1);
    const addressTrigger = screen.getByRole("button", { name: "About the server address" });
    const addressRegionId = addressTrigger.getAttribute("aria-controls");
    expect(addressRegionId).toMatch(/-address-help$/);
    expect(document.getElementById(addressRegionId!)).not.toBeNull();
    expect(document.querySelector('[id$="-model-help"]')).toBeNull();
  });

  it("resets the nested model draft when the serving endpoint changes", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Add model…" }));
    const firstChild = screen.getByRole("dialog", { name: "Add model" });
    fireEvent.click(within(firstChild).getByRole("tab", { name: "Hugging Face" }));
    fireEvent.change(within(firstChild).getByLabelText("Served model ID"), {
      target: { value: "old-server-model" },
    });
    fireEvent.click(within(firstChild).getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("tab", { name: "Other server" }));
    fireEvent.change(screen.getByLabelText("Server address"), {
      target: { value: "http://192.168.1.30:8000/v1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add model…" }));
    expect(screen.getByLabelText("Served model ID")).toHaveValue("");
  });

  it("closes the nested Add model dialog on Escape and leaves the parent open", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Add model…" }));
    expect(screen.getByRole("dialog", { name: "Add model" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Add model" }), {
      key: "Escape",
      code: "Escape",
      keyCode: 27,
    });
    expect(screen.queryByRole("dialog", { name: "Add model" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Add profile" })).toBeInTheDocument();
  });

  it("renders the existing provider icon for the selected harness", () => {
    renderDialog({ harnesses: [opencodeHarness, claudeHarness, codexHarness] });
    expect(document.querySelector(".poracode-provider-icon")).not.toBeNull();
  });

  it("renders provider icons in the two-harness radio branch", () => {
    renderDialog({ harnesses: [opencodeHarness, claudeHarness] });
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(document.querySelectorAll(".poracode-provider-icon").length).toBeGreaterThanOrEqual(2);
  });

  it("filters 100+ suggestions and keeps an arbitrary model ID", async () => {
    renderDialog({
      statuses: [
        statusWithModels(Array.from({ length: 120 }, (_, index) => `ollama/model-${index}`)),
      ],
    });
    const model = screen.getByLabelText("Model");
    fireEvent.click(screen.getByRole("button", { name: "Show model suggestions" }));
    fireEvent.change(model, { target: { value: "model-119" } });
    expect(await screen.findByRole("option", { name: "model-119" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "model-5" })).not.toBeInTheDocument();
    fireEvent.change(model, { target: { value: "acme/custom:q4" } });
    fireEvent.blur(model);
    fireEvent.change(screen.getByLabelText("New profile name"), { target: { value: "Work" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(createProfileMock).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ model: "acme/custom:q4" }),
        }),
      ),
    );
  });

  it("closes after a committed profile even when the settings flush fails", async () => {
    flushSharedSettingsMock.mockRejectedValueOnce(new Error("flush failed"));
    const { onDismiss, onCreated } = renderDialog();
    fireEvent.change(screen.getByLabelText("New profile name"), { target: { value: "Work" } });
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "m" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("opencode:work"));
    expect(onDismiss).toHaveBeenCalled();
    expect(createProfileMock).toHaveBeenCalledOnce();
    expect(toastMock.danger).toHaveBeenCalledWith(
      expect.stringContaining("was created, but its settings could not be saved"),
    );
  });
});
