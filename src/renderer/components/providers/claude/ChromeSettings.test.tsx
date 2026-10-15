import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { ClaudeChromeSettings } from "./ChromeSettings";

const flush = vi.hoisted(() => vi.fn<() => Promise<void>>());
const error = vi.hoisted(() => vi.fn<(message: string) => void>());
vi.mock("@/renderer/state/sharedSettingsStore", async (original) => ({
  ...(await original<typeof import("@/renderer/state/sharedSettingsStore")>()),
  flushSharedSettings: flush,
}));
vi.mock("@heroui/react", async (original) => ({
  ...(await original<typeof import("@heroui/react")>()),
  toast: { danger: error },
}));
beforeEach(() => {
  useSharedSettings.setState({ agentSettings: {} });
  flush.mockReset().mockResolvedValue(undefined);
  error.mockReset();
});

it("enables pre-upgrade profiles by default and saves an opt-out for the selected profile only", async () => {
  useSharedSettings.setState({ agentSettings: { claude: { chromeIntegration: true } } });
  renderWithI18n(<ClaudeChromeSettings agentKind="claude:fixture" />);
  const toggle = screen.getByRole("switch", { name: "Claude in Chrome" });
  expect(toggle).toBeChecked();
  await act(async () => fireEvent.click(toggle));
  expect(useSharedSettings.getState().agentSettings["claude:fixture"]?.chromeIntegration).toBe(
    false,
  );
  expect(useSharedSettings.getState().agentSettings.claude?.chromeIntegration).toBe(true);
  expect(toggle).not.toBeChecked();
  expect(flush).toHaveBeenCalledWith({ requireSuccess: true });
});

it("restores the previous choice when confirmed persistence fails", async () => {
  useSharedSettings.setState({ agentSettings: { claude: { chromeIntegration: false } } });
  flush.mockRejectedValueOnce(new Error("disk write failed"));
  renderWithI18n(<ClaudeChromeSettings agentKind="claude" />);
  const toggle = screen.getByRole("switch", { name: "Claude in Chrome" });
  await act(async () => fireEvent.click(toggle));
  expect(useSharedSettings.getState().agentSettings.claude?.chromeIntegration).toBe(false);
  expect(toggle).not.toBeChecked();
  expect(error).toHaveBeenCalledOnce();
});
