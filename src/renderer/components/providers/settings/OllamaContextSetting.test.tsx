import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { AgentSettingsHost } from "@/renderer/components/providers/settings/AgentSettingsHostContext";

const hostState = vi.hoisted(() => ({ host: {} as AgentSettingsHost }));
const toastMock = vi.hoisted(() => ({
  danger: vi.fn<(message: string) => void>(),
  success: vi.fn<(message: string) => void>(),
}));
const prepareMock = vi.hoisted(() =>
  vi.fn<(input: unknown) => Promise<string>>(async () => "poracode-ctx-65536-prepared"),
);

vi.mock("@heroui/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@heroui/react")>()),
  Button: (props: {
    children?: ReactNode;
    isDisabled?: boolean;
    isPending?: boolean;
    onPress?: () => void;
  }) => (
    <button type="button" disabled={props.isDisabled || props.isPending} onClick={props.onPress}>
      {props.children}
    </button>
  ),
  toast: toastMock,
}));

vi.mock("@/renderer/components/common", () => ({
  Input: (props: {
    "aria-label"?: string;
    "aria-invalid"?: boolean;
    type?: "number";
    inputMode?: "numeric";
    value?: string;
    placeholder?: string;
    disabled?: boolean;
    onChange?: (event: {
      currentTarget: { value: string; validity: { badInput: boolean } };
    }) => void;
    onInput?: (event: {
      currentTarget: { value: string; validity: { badInput: boolean } };
    }) => void;
  }) => {
    const handle = (event: { currentTarget: HTMLInputElement }) => {
      const currentTarget = {
        value: event.currentTarget.value,
        validity: { badInput: event.currentTarget.validity.badInput },
      };
      props.onInput?.({ currentTarget });
      props.onChange?.({ currentTarget });
    };
    return (
      <input
        aria-label={props["aria-label"]}
        aria-invalid={props["aria-invalid"]}
        type={props.type}
        inputMode={props.inputMode}
        value={props.value}
        placeholder={props.placeholder}
        disabled={props.disabled}
        onChange={handle}
        onInput={handle}
      />
    );
  },
}));

vi.mock("@/renderer/components/providers/settings/AgentSettingsHostContext", () => ({
  useAgentSettingsHost: () => hostState.host,
  rediscoverHostAgents: async () => ({ windows: [], wsl: [] }),
}));

vi.mock("@/renderer/views/SettingsOverlay/parts/ollamaModelContext", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/renderer/views/SettingsOverlay/parts/ollamaModelContext")
  >()),
  prepareOllamaContextModel: prepareMock,
}));

import { OllamaContextSetting } from "./OllamaContextSetting";

function machineProject(): Project {
  return {
    id: "__machine__:posix",
    name: "Mac mini",
    disabled: false,
    createdAt: new Date(0).toISOString(),
    location: { kind: "posix", path: "~" },
  };
}

function host(overrides: Partial<AgentSettingsHost> = {}): AgentSettingsHost {
  return {
    key: "local",
    connectionKey: undefined,
    isRemote: false,
    isOnline: true,
    canWrite: true,
    canOperateTerminal: true,
    canReadTerminal: true,
    machineProject: machineProject(),
    canManageProfiles: true,
    canEditSecrets: true,
    callProcedure: vi.fn<AgentSettingsHost["callProcedure"]>(),
    rediscoverAgents: vi.fn<AgentSettingsHost["rediscoverAgents"]>(),
    setAgentSetting: vi.fn<AgentSettingsHost["setAgentSetting"]>(),
    saveAgentSettings: vi.fn<AgentSettingsHost["saveAgentSettings"]>(),
    setAgentDisabled: vi.fn<AgentSettingsHost["setAgentDisabled"]>(),
    setHiddenModels: vi.fn<AgentSettingsHost["setHiddenModels"]>(),
    createProfile: vi.fn<AgentSettingsHost["createProfile"]>(),
    updateProfile: vi.fn<AgentSettingsHost["updateProfile"]>(),
    setProfileEnvironment: vi.fn<AgentSettingsHost["setProfileEnvironment"]>(),
    removeProfile: vi.fn<AgentSettingsHost["removeProfile"]>(),
    ...overrides,
  } as AgentSettingsHost;
}

function renderSetting(
  input: {
    contextLength?: number;
    applyContext?: (next: unknown) => Promise<unknown>;
    endpoint?: string;
    declaredEndpoint?: string;
  } = {},
) {
  const applyContext =
    input.applyContext ?? vi.fn<(next: unknown) => Promise<unknown>>(async () => undefined);
  render(
    <OllamaContextSetting
      instanceId="work"
      profileKind="opencode:work"
      endpoint={input.endpoint ?? "http://127.0.0.1:11434/v1"}
      declaredEndpoint={input.declaredEndpoint ?? "http://127.0.0.1:11434/v1"}
      baseModel="inkling-2-mini:latest"
      contextLength={input.contextLength}
      applyContext={applyContext}
    />,
  );
  return { applyContext };
}

describe("OllamaContextSetting", () => {
  beforeEach(() => {
    hostState.host = host();
    prepareMock.mockReset().mockResolvedValue("poracode-ctx-65536-prepared");
    toastMock.success.mockReset();
    toastMock.danger.mockReset();
  });

  it("prepares an exact custom alias on the selected host, then persists it", async () => {
    prepareMock.mockResolvedValueOnce("poracode-ctx-88000-prepared");
    const { applyContext } = renderSetting();
    fireEvent.change(screen.getByLabelText("Context length"), { target: { value: "88000" } });
    expect(screen.getByLabelText("Context length")).toHaveValue(88000);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(applyContext).toHaveBeenCalledWith({
        model: "poracode-ctx-88000-prepared",
        baseModel: "inkling-2-mini:latest",
        contextLength: 88000,
      }),
    );
    expect(prepareMock).toHaveBeenCalledWith(
      expect.objectContaining({
        project: expect.objectContaining({ id: "__machine__:posix" }),
        baseModel: "inkling-2-mini:latest",
        contextLength: 88000,
        alias: expect.stringMatching(/^poracode-ctx-88000-/u),
      }),
    );
    expect(toastMock.success).toHaveBeenCalledWith(
      "Context length updated. It applies to new sessions.",
    );
  });

  it("restores the original base model for Server default without preparing an alias", async () => {
    const { applyContext } = renderSetting({ contextLength: 88000 });
    fireEvent.change(screen.getByLabelText("Context length"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(applyContext).toHaveBeenCalledWith({ model: "inkling-2-mini:latest" }),
    );
    expect(prepareMock).not.toHaveBeenCalled();
  });

  it("reads an old persisted count unchanged", () => {
    renderSetting({ contextLength: 65536 });
    expect(screen.getByLabelText("Context length")).toHaveValue(65536);
    expect(screen.getByLabelText("Context length")).toHaveAttribute(
      "placeholder",
      "Server default",
    );
  });

  it("shows a field error and disables Apply for malformed or out-of-range counts", () => {
    const { applyContext } = renderSetting();
    const input = screen.getByLabelText("Context length");
    for (const value of ["1.5", "0", "999", "10000001"]) {
      fireEvent.change(input, { target: { value } });
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Enter a whole number from 1000 to 10000000.",
      );
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    }
    expect(applyContext).not.toHaveBeenCalled();
  });

  it("denies offline and read-only hosts", () => {
    hostState.host = host({ isOnline: false });
    renderSetting();
    expect(screen.getByLabelText("Context length")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();

    cleanup();
    hostState.host = host({ canWrite: false });
    renderSetting();
    expect(screen.getByLabelText("Context length")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  it("blocks explicit values without terminal access but allows clearing the override", () => {
    hostState.host = host({ canOperateTerminal: false, canReadTerminal: false });
    const { applyContext } = renderSetting({ contextLength: 65536 });
    const input = screen.getByLabelText("Context length");
    fireEvent.change(input, { target: { value: "88000" } });
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    expect(screen.getByText(/Server default can still be restored/)).toBeVisible();

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(applyContext).toHaveBeenCalledWith({ model: "inkling-2-mini:latest" });
  });

  it("stays absent for a non-Ollama local endpoint", () => {
    const { container } = render(
      <OllamaContextSetting
        instanceId="work"
        profileKind="opencode:work"
        endpoint="http://192.168.1.20:8000/v1"
        declaredEndpoint="http://127.0.0.1:11434/v1"
        baseModel="inkling-2-mini:latest"
        applyContext={async () => undefined}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
