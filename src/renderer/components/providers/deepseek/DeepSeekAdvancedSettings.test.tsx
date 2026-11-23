import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ChangeEvent, KeyboardEvent, MouseEvent, ReactNode } from "react";
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
    onMouseDown?: (event: MouseEvent<HTMLButtonElement>) => void;
    onPress?: () => void;
  }) => (
    <button
      type="button"
      aria-label={props["aria-label"]}
      disabled={props.isDisabled}
      onMouseDown={props.onMouseDown}
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
  ToggleSwitch: (props: {
    "aria-label"?: string;
    isSelected: boolean;
    onChange: (next: boolean) => void;
  }) => (
    <input
      type="checkbox"
      aria-label={props["aria-label"]}
      checked={props.isSelected}
      onChange={(event) => props.onChange(event.currentTarget.checked)}
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

const flushSharedSettingsMock = vi.hoisted(() => vi.fn<() => Promise<void>>());
vi.mock("@/renderer/state/sharedSettingsStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/renderer/state/sharedSettingsStore")>();
  return { ...actual, flushSharedSettings: flushSharedSettingsMock };
});

import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { DeepSeekAdvancedSettings } from "./DeepSeekAdvancedSettings";

const storedDeepSeek = () => useSharedSettings.getState().agentSettings.deepseek ?? {};

beforeEach(() => {
  flushSharedSettingsMock.mockReset().mockResolvedValue(undefined);
  toastMock.danger.mockReset();
  toastMock.warning.mockReset();
  useSharedSettings.setState({ agentSettings: {} });
});

describe("DeepSeekAdvancedSettings", () => {
  it("persists boolean toggles and defaults uploadSessionLog to checked", async () => {
    render(<DeepSeekAdvancedSettings agentKind="deepseek" />);

    const codeMode = screen.getByLabelText("Code mode (PTC)");
    const uploadLog = screen.getByLabelText("Upload session log");
    expect(codeMode).not.toBeChecked();
    expect(uploadLog).toBeChecked();

    fireEvent.click(codeMode);
    await waitFor(() => expect(storedDeepSeek().codeMode).toBe(true));
    expect(flushSharedSettingsMock).toHaveBeenCalledWith({ requireSuccess: true });

    fireEvent.click(uploadLog);
    await waitFor(() => expect(storedDeepSeek().uploadSessionLog).toBe(false));
  });

  it("saves select overrides and clears them when reset to Automatic", async () => {
    render(<DeepSeekAdvancedSettings agentKind="deepseek" />);
    const searchSelect = screen.getByLabelText("Web search provider");

    fireEvent.change(searchSelect, { target: { value: "deepseek-search-api" } });
    await waitFor(() => expect(storedDeepSeek().webSearchProvider).toBe("deepseek-search-api"));

    fireEvent.change(searchSelect, { target: { value: "__unset__" } });
    await waitFor(() => expect(storedDeepSeek().webSearchProvider).toBe(""));
  });

  it("validates integer limits on Enter/blur and warns on out-of-range input", async () => {
    render(<DeepSeekAdvancedSettings agentKind="deepseek" />);
    const timeoutInput = screen.getByLabelText("Shell command timeout (seconds)");

    fireEvent.change(timeoutInput, { target: { value: "2" } });
    fireEvent.keyDown(timeoutInput, { key: "Enter" });
    expect(toastMock.warning).toHaveBeenCalledTimes(1);
    expect(storedDeepSeek().shellTimeoutSeconds).toBeUndefined();

    fireEvent.change(timeoutInput, { target: { value: "120" } });
    fireEvent.blur(timeoutInput);
    await waitFor(() => expect(storedDeepSeek().shellTimeoutSeconds).toBe("120"));
  });

  it("rolls back optimistic changes on flush failure without flipping untouched defaults", async () => {
    useSharedSettings.setState({
      agentSettings: { deepseek: { ralphLoop: true } },
    });
    flushSharedSettingsMock.mockRejectedValue(new Error("disk full"));
    render(<DeepSeekAdvancedSettings agentKind="deepseek" />);

    fireEvent.click(screen.getByLabelText("Reset advanced settings"));

    await waitFor(() => expect(toastMock.danger).toHaveBeenCalledTimes(1));
    expect(storedDeepSeek().ralphLoop).toBe(true);
    expect(storedDeepSeek().codeMode).toBe(false);
    expect(storedDeepSeek().uploadSessionLog).toBe(true);
  });

  it("resets all overrides at once and disables Reset when none are active", async () => {
    render(<DeepSeekAdvancedSettings agentKind="deepseek" />);
    expect(screen.getByLabelText("Reset advanced settings")).toBeDisabled();

    act(() => {
      useSharedSettings.setState({
        agentSettings: {
          deepseek: {
            codeMode: true,
            webSearchProvider: "deepseek-search-api",
            shellTimeoutSeconds: "120",
            uploadSessionLog: false,
          },
        },
      });
    });

    const resetButton = screen.getByLabelText("Reset advanced settings");
    expect(resetButton).toBeEnabled();
    fireEvent.click(resetButton);

    await waitFor(() => {
      expect(storedDeepSeek().codeMode).toBe(false);
      expect(storedDeepSeek().webSearchProvider).toBe("");
      expect(storedDeepSeek().shellTimeoutSeconds).toBe("");
      expect(storedDeepSeek().uploadSessionLog).toBe(true);
    });
    expect(screen.getByLabelText("Reset advanced settings")).toBeDisabled();
  });

  it("keeps controls and Reset consistent for default-equivalent, padded, and invalid stored values", () => {
    useSharedSettings.setState({
      agentSettings: {
        deepseek: {
          webFetchProvider: "http",
          webBilling: "auto",
          shellTimeoutSeconds: "4",
        },
      },
    });
    const { rerender } = render(<DeepSeekAdvancedSettings agentKind="deepseek" />);

    expect(screen.getByLabelText("Web fetch provider")).toHaveValue("__unset__");
    expect(screen.getByLabelText("DeepSeek Web API billing")).toHaveValue("__unset__");
    expect(screen.getByLabelText("Shell command timeout (seconds)")).toHaveValue("");
    expect(screen.getByLabelText("Reset advanced settings")).toBeDisabled();

    act(() => {
      useSharedSettings.setState({
        agentSettings: {
          deepseek: {
            webSearchProvider: " deepseek-search-api ",
          },
        },
      });
    });
    rerender(<DeepSeekAdvancedSettings agentKind="deepseek" />);
    expect(screen.getByLabelText("Web search provider")).toHaveValue("deepseek-search-api");
    expect(screen.getByLabelText("Reset advanced settings")).toBeEnabled();
  });

  it("prevents focus loss on Reset mousedown so an uncommitted invalid draft does not toast", async () => {
    useSharedSettings.setState({
      agentSettings: { deepseek: { codeMode: true } },
    });
    render(<DeepSeekAdvancedSettings agentKind="deepseek" />);

    const timeoutInput = screen.getByLabelText("Shell command timeout (seconds)");
    fireEvent.change(timeoutInput, { target: { value: "2" } });

    const resetButton = screen.getByLabelText("Reset advanced settings");
    const cancelled = !fireEvent.mouseDown(resetButton);
    expect(cancelled).toBe(true);
    fireEvent.click(resetButton);

    await waitFor(() => expect(storedDeepSeek().codeMode).toBe(false));
    expect(toastMock.warning).not.toHaveBeenCalled();
    expect(flushSharedSettingsMock).toHaveBeenCalledTimes(1);
  });
});
