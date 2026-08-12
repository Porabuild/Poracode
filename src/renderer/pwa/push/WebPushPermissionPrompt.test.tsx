// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { WebPushPermissionPrompt } from "./WebPushPermissionPrompt";

const pushMocks = vi.hoisted(() => ({
  supported: true,
  requestPermission: vi.fn<() => Promise<NotificationPermission>>(),
}));

vi.mock("./webPushRegistration", () => ({
  supportsWebPushRegistration: () => pushMocks.supported,
}));

vi.mock("@/renderer/browserNotificationPermission", () => ({
  requestBrowserNotificationPermission: pushMocks.requestPermission,
}));

describe("WebPushPermissionPrompt", () => {
  beforeEach(() => {
    pushMocks.supported = true;
    pushMocks.requestPermission.mockReset();
    pushMocks.requestPermission.mockResolvedValue("granted");
    vi.stubGlobal("Notification", { permission: "default" });
    useSharedSettings.setState({ notificationsEnabled: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks on installed-PWA launch and requests permission from the Allow gesture", async () => {
    render(<WebPushPermissionPrompt />);

    expect(await screen.findByRole("heading", { name: "Enable notifications" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Allow" }));

    expect(pushMocks.requestPermission).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Enable notifications" })).toBeNull();
    });
  });

  it("stays out of plain browser tabs and unsupported browsers", () => {
    pushMocks.supported = false;

    render(<WebPushPermissionPrompt />);

    expect(screen.queryByRole("heading", { name: "Enable notifications" })).toBeNull();
  });

  it("does not ask when notifications are disabled", () => {
    useSharedSettings.setState({ notificationsEnabled: false });

    render(<WebPushPermissionPrompt />);

    expect(screen.queryByRole("heading", { name: "Enable notifications" })).toBeNull();
  });
});
