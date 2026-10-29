import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ChangeEvent, KeyboardEvent, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { SelectOption } from "@/renderer/components/common/Select";

const toastMock = vi.hoisted(() => ({
  danger: vi.fn<(message: string) => void>(),
  warning: vi.fn<(message: string) => void>(),
}));

vi.mock("@heroui/react", () => ({
  Button: (props: {
    children?: ReactNode;
    "aria-label"?: string;
    isDisabled?: boolean;
    onPress?: () => void;
  }) => (
    <button
      type="button"
      aria-label={props["aria-label"]}
      disabled={props.isDisabled}
      onClick={props.onPress}
    >
      {props.children}
    </button>
  ),
  Disclosure: Object.assign((props: { children?: ReactNode }) => <div>{props.children}</div>, {
    Heading: (props: { children?: ReactNode }) => <div>{props.children}</div>,
    Trigger: (props: { children?: ReactNode }) => <button type="button">{props.children}</button>,
    Indicator: () => null,
    Content: (props: { children?: ReactNode }) => <div>{props.children}</div>,
    Body: (props: { children?: ReactNode }) => <div>{props.children}</div>,
  }),
  toast: toastMock,
}));

vi.mock("@/renderer/components/common", () => ({
  Input: (props: {
    "aria-label"?: string;
    value: string;
    placeholder?: string;
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
    onBlur?: () => void;
    onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  }) => (
    <input
      aria-label={props["aria-label"]}
      value={props.value}
      placeholder={props.placeholder}
      onChange={props.onChange}
      onBlur={props.onBlur}
      onKeyDown={props.onKeyDown}
    />
  ),
}));

vi.mock("@/renderer/components/common/Select", () => ({
  Select: (props: {
    "aria-label"?: string;
    options: readonly SelectOption[];
    value?: string | null;
    onChange: (value: string) => void;
  }) => (
    <select
      aria-label={props["aria-label"]}
      value={props.value ?? ""}
      onChange={(event) => props.onChange(event.currentTarget.value)}
    >
      {props.options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

const bridgeMock = vi.hoisted(() => ({
  getAgentConfigDefaults:
    vi.fn<(payload: { agentKind: string }) => Promise<{ defaults: Record<string, string> }>>(),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridgeMock }));

const flushSharedSettingsMock = vi.hoisted(() => vi.fn<() => Promise<void>>());
vi.mock("@/renderer/state/sharedSettingsStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/renderer/state/sharedSettingsStore")>();
  return { ...actual, flushSharedSettings: flushSharedSettingsMock };
});

const statusState = vi.hoisted(() => ({
  agentStatuses: [] as Array<{
    kind: string;
    version?: string;
    capabilities: Record<string, unknown>;
  }>,
}));
vi.mock("@/renderer/state/agentStatusesStore", () => ({
  useAgentStatusesStore: (selector: (state: typeof statusState) => unknown) =>
    selector(statusState),
}));

import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { CodexAdvancedSettings } from "./CodexAdvancedSettings";

const storedCodex = () => useSharedSettings.getState().agentSettings.codex ?? {};

async function renderSection(configDefaults: Record<string, string> = {}) {
  bridgeMock.getAgentConfigDefaults.mockResolvedValue({ defaults: configDefaults });
  render(<CodexAdvancedSettings agentKind="codex" />);
  await act(async () => {});
}

beforeEach(() => {
  bridgeMock.getAgentConfigDefaults.mockReset();
  flushSharedSettingsMock.mockReset().mockResolvedValue(undefined);
  toastMock.danger.mockReset();
  toastMock.warning.mockReset();
  statusState.agentStatuses = [
    {
      kind: "codex",
      capabilities: {
        models: [
          { id: "gpt-6.1-sol", label: "GPT-6.1 Sol" },
          { id: "gpt-6-luna", label: "GPT-6 Luna" },
        ],
        efforts: ["low", "medium", "high"],
        modelEfforts: {
          "gpt-6.1-sol": ["low", "medium", "high"],
          "gpt-6-luna": ["low", "medium", "high", "max"],
        },
      },
    },
  ];
  useSharedSettings.setState({ agentSettings: {} });
});

describe("CodexAdvancedSettings", () => {
  it("shows config.toml values as hints while a field is unset", async () => {
    await renderSection({
      subagentModel: "gpt-6-luna",
      maxSubagents: "10",
      parentReasoningEffort: "high",
    });

    expect(screen.getByText("From config.toml: gpt-6-luna")).toBeInTheDocument();
    expect(screen.getByText("From config.toml: 10")).toBeInTheDocument();
    expect(screen.getByText("Inherits the parent effort: high")).toBeInTheDocument();
    expect(screen.getByLabelText("Max concurrent sub-agents")).toHaveAttribute("placeholder", "10");
  });

  it("falls back to inheritance text when config.toml has nothing", async () => {
    await renderSection();

    expect(screen.getByText("Inherits the parent model")).toBeInTheDocument();
    expect(screen.getAllByText("Codex default")).toHaveLength(2);
  });

  it("saves a chosen sub-agent model and offers that model's efforts", async () => {
    await renderSection({ subagentModel: "gpt-6.1-sol" });

    fireEvent.change(screen.getByLabelText("Sub-agent model"), {
      target: { value: "gpt-6-luna" },
    });

    await waitFor(() => expect(storedCodex().subagentModel).toBe("gpt-6-luna"));
    expect(flushSharedSettingsMock).toHaveBeenCalledWith({ requireSuccess: true });
    expect(screen.getByText("Overrides config.toml: gpt-6.1-sol")).toBeInTheDocument();
    const effort = screen.getByLabelText("Sub-agent reasoning effort");
    expect(effort).toHaveTextContent("max");
  });

  it("drops a stored effort the newly chosen sub-agent model does not offer", async () => {
    useSharedSettings.setState({
      agentSettings: { codex: { subagentModel: "gpt-6-luna", subagentReasoningEffort: "max" } },
    });
    await renderSection();

    fireEvent.change(screen.getByLabelText("Sub-agent model"), {
      target: { value: "gpt-6.1-sol" },
    });

    await waitFor(() => expect(storedCodex().subagentModel).toBe("gpt-6.1-sol"));
    expect(storedCodex().subagentReasoningEffort).toBe("");
  });

  it("keeps a stored effort the newly chosen sub-agent model still offers", async () => {
    useSharedSettings.setState({
      agentSettings: { codex: { subagentModel: "gpt-6.1-sol", subagentReasoningEffort: "high" } },
    });
    await renderSection();

    fireEvent.change(screen.getByLabelText("Sub-agent model"), {
      target: { value: "gpt-6-luna" },
    });

    await waitFor(() => expect(storedCodex().subagentModel).toBe("gpt-6-luna"));
    expect(storedCodex().subagentReasoningEffort).toBe("high");
  });

  it("does not undo a newer save of the same key when an older save fails", async () => {
    let failFirst: (error: Error) => void = () => {};
    flushSharedSettingsMock
      .mockReset()
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            failFirst = reject;
          }),
      )
      .mockResolvedValue(undefined);
    await renderSection();
    const effort = screen.getByLabelText("Plan mode reasoning effort");

    fireEvent.change(effort, { target: { value: "low" } });
    fireEvent.change(effort, { target: { value: "high" } });
    await waitFor(() => expect(storedCodex().planModeReasoningEffort).toBe("high"));

    await act(async () => failFirst(new Error("disk full")));

    await waitFor(() => expect(toastMock.danger).toHaveBeenCalledTimes(1));
    expect(storedCodex().planModeReasoningEffort).toBe("high");
  });

  it("warns when the detected Codex is too old for the sub-agent settings", async () => {
    statusState.agentStatuses[0]!.version = "codex-cli 0.144.0";
    await renderSection();

    expect(screen.getByText(/need Codex 0.145 or newer/u)).toBeInTheDocument();
  });

  it.each(["codex-cli 0.165.0", undefined])("shows no version warning for %j", async (version) => {
    if (version) statusState.agentStatuses[0]!.version = version;
    await renderSection();

    expect(screen.queryByText(/need Codex 0.145 or newer/u)).not.toBeInTheDocument();
  });

  it("clears an override when Default is chosen", async () => {
    useSharedSettings.setState({ agentSettings: { codex: { subagentReasoningEffort: "max" } } });
    await renderSection();

    fireEvent.change(screen.getByLabelText("Sub-agent reasoning effort"), {
      target: { value: "__unset__" },
    });

    await waitFor(() => expect(storedCodex().subagentReasoningEffort).toBe(""));
  });

  it("commits max sub-agents on Enter and rejects invalid input", async () => {
    await renderSection();
    const input = screen.getByLabelText("Max concurrent sub-agents");

    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(toastMock.warning).toHaveBeenCalledTimes(1);
    expect(storedCodex().maxSubagents).toBeUndefined();

    fireEvent.change(input, { target: { value: "10" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(storedCodex().maxSubagents).toBe("10"));
  });

  it("restores the previous value when saving fails", async () => {
    flushSharedSettingsMock.mockRejectedValue(new Error("disk full"));
    await renderSection();

    fireEvent.change(screen.getByLabelText("Plan mode reasoning effort"), {
      target: { value: "high" },
    });

    await waitFor(() => expect(toastMock.danger).toHaveBeenCalledTimes(1));
    expect(storedCodex().planModeReasoningEffort).toBe("");
  });

  it("resets every override at once and disables Reset when none are set", async () => {
    await renderSection();
    expect(screen.getByLabelText("Reset advanced settings")).toBeDisabled();

    act(() => {
      useSharedSettings.setState({
        agentSettings: { codex: { subagentModel: "gpt-6-luna", maxSubagents: "10" } },
      });
    });
    fireEvent.click(screen.getByLabelText("Reset advanced settings"));

    await waitFor(() => {
      expect(storedCodex().subagentModel).toBe("");
      expect(storedCodex().maxSubagents).toBe("");
    });
  });

  it("still renders when the config defaults read fails", async () => {
    bridgeMock.getAgentConfigDefaults.mockRejectedValue(new Error("unavailable"));
    render(<CodexAdvancedSettings agentKind="codex" />);
    await act(async () => {});

    expect(screen.getByText("Inherits the parent model")).toBeInTheDocument();
  });
});
