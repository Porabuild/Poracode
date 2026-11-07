import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  ClaudeContextWindowSettings,
  parseClaudeWindowInput,
  resolveClaudeWindows,
} from "./ContextWindowSettings";

const refresh = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>());
const flush = vi.hoisted(() => vi.fn<() => Promise<void>>());
const warning = vi.hoisted(() => vi.fn<(message: string) => void>());
vi.mock("@/renderer/bridge", () => ({ readBridge: () => ({ refreshAgentStatuses: refresh }) }));
vi.mock("@/renderer/state/sharedSettingsStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/state/sharedSettingsStore")>()),
  flushSharedSettings: flush,
}));
vi.mock("@heroui/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@heroui/react")>()),
  toast: { warning, danger: vi.fn<(message: string) => void>() },
}));

beforeEach(() => {
  refresh.mockReset().mockResolvedValue(undefined);
  flush.mockReset().mockResolvedValue(undefined);
  warning.mockReset();
  useSharedSettings.setState({ agentSettings: {} });
});

describe("Claude window settings", () => {
  it("adds a custom size, persists it, refreshes detection, and resets the list", async () => {
    renderWithI18n(<ClaudeContextWindowSettings agentKind="claude" wslDistros={["Ubuntu"]} />);
    expect(screen.getByText("1M")).toBeInTheDocument();
    expect(screen.getByText("400k")).toBeInTheDocument();
    expect(screen.queryByText("200k")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Custom context window"), {
      target: { value: "512000" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add context window" }));
    });
    expect(
      resolveClaudeWindows(useSharedSettings.getState().agentSettings.claude).map(
        (window) => window.id,
      ),
    ).toEqual(["400k", "512k", "1m"]);
    expect(screen.getByText("512k")).toBeInTheDocument();
    expect(flush).toHaveBeenCalledWith({ requireSuccess: true });
    expect(refresh).toHaveBeenCalledWith(["Ubuntu"], { agentKinds: ["claude"] });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove 400k" }));
    });
    expect(screen.queryByText("400k")).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reset context windows" }));
    });
    expect(
      resolveClaudeWindows(useSharedSettings.getState().agentSettings.claude).map(
        (window) => window.id,
      ),
    ).toEqual(["400k", "1m"]);
  });

  it("rejects unsupported native sizes and duplicates", async () => {
    renderWithI18n(<ClaudeContextWindowSettings agentKind="claude" wslDistros={[]} />);
    for (const value of ["99k", "2m", "400k"]) {
      fireEvent.change(screen.getByLabelText("Custom context window"), { target: { value } });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Add context window" }));
      });
    }
    expect(warning.mock.calls.map(([message]) => message)).toEqual([
      "Enter a size between 100k and 1m.",
      "Enter a size between 100k and 1m.",
      "400k is already in the list.",
    ]);
    expect(flush).not.toHaveBeenCalled();
    expect(parseClaudeWindowInput("100k")?.tokens).toBe(100_000);
    expect(parseClaudeWindowInput("1m")?.tokens).toBe(1_000_000);
  });

  it("restores the prior list and skips discovery when a confirmed save fails", async () => {
    useSharedSettings.setState({ agentSettings: { claude: { contextWindows: '["400k","1m"]' } } });
    flush.mockRejectedValueOnce(new Error("disk write failed"));
    renderWithI18n(<ClaudeContextWindowSettings agentKind="claude" wslDistros={[]} />);
    fireEvent.change(screen.getByLabelText("Custom context window"), { target: { value: "768k" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add context window" }));
    });
    expect(flush).toHaveBeenCalledWith({ requireSuccess: true });
    expect(refresh).not.toHaveBeenCalled();
    expect(useSharedSettings.getState().agentSettings.claude?.contextWindows).toBe('["400k","1m"]');
    expect(screen.queryByText("768k")).not.toBeInTheDocument();
  });
});
