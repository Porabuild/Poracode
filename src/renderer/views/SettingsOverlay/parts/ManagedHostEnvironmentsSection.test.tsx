import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { AppProvider } from "@/renderer/components/ui/provider";
import { REMOTE_OPERATOR_SCOPES } from "@/shared/remote";
import type { RemoteDesktopClient } from "@/shared/remote/client";

const listEnvironments = vi.hoisted(() => vi.fn<() => Promise<never[]>>(async () => []));
const retryManagedParentDescriptor = vi.hoisted(() => vi.fn<() => void>());

vi.mock("@/renderer/hostTransport/loopbackHttpWsTransport", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/renderer/hostTransport/loopbackHttpWsTransport")>();
  return { ...actual, retryManagedParentDescriptor };
});

vi.mock("@/renderer/state/remoteServers/environmentSessions", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/renderer/state/remoteServers/environmentSessions")>();
  return {
    ...actual,
    parentClientFor: () => ({ listEnvironments }),
  };
});

import {
  __resetManagedLoopbackOwnerForTest,
  clearManagedParentAuthority,
  failManagedParentAuthority,
  markManagedParentRetrying,
  publishManagedParentAuthority,
} from "@/renderer/state/remoteServers/managedLoopbackOwner";
import { useEnvironmentManagementStore } from "@/renderer/state/remoteServers/environmentManagement";
import { ManagedHostEnvironmentsSection } from "./ManagedHostEnvironmentsSection";

const HOST = "managed-host";

function fakeClient(): RemoteDesktopClient {
  return {
    setTokenLifecycle: () => undefined,
    refreshTokens: async () => null,
    environmentWebSocketTicket: async () => ({ ticket: "t", expiresAt: "" }),
  } as unknown as RemoteDesktopClient;
}

function publishManaged(sshEnvironments: boolean, scopes = REMOTE_OPERATOR_SCOPES): void {
  publishManagedParentAuthority({
    hostDesktopId: HOST,
    endpoint: "http://127.0.0.1:6000/",
    sshEnvironments,
    scopes,
    client: fakeClient(),
    accessToken: () => "managed-access",
  });
}

function renderSection() {
  return render(
    <AppProvider>
      <ManagedHostEnvironmentsSection />
    </AppProvider>,
  );
}

beforeEach(() => {
  __resetManagedLoopbackOwnerForTest();
  useEnvironmentManagementStore.getState().__resetForTest();
  listEnvironments.mockClear();
  retryManagedParentDescriptor.mockClear();
});

describe("ManagedHostEnvironmentsSection", () => {
  it("renders nothing while no managed authority is published", () => {
    const view = renderSection();
    expect(view.container.textContent).toBe("");
  });

  it("renders nothing when the authority lacks the sshEnvironments capability", () => {
    publishManaged(false);
    const view = renderSection();
    expect(view.container.textContent).toBe("");
  });

  it("renders the shared section for a ready authority with gated scopes", () => {
    publishManaged(true, ["session:read"]);
    renderSection();
    expect(screen.getByText("Host-owned environments")).toBeTruthy();
    // A viewer of the desktop's own server can read but never manage.
    expect(screen.queryByText("New environment")).toBeNull();
    expect(screen.queryByText("Edit")).toBeNull();
  });

  it("reconnects management for an operator authority", () => {
    publishManaged(true, ["session:read", "session:operate", "ports:forward"]);
    renderSection();
    expect(screen.getByText("Host-owned environments")).toBeTruthy();
    expect(screen.queryByText("New environment")).toBeNull();
  });

  it("reports a descriptor failure truthfully and retries manually", () => {
    failManagedParentAuthority("Unable to verify the desktop's own server.");
    renderSection();
    expect(screen.getByRole("alert").textContent).toContain("Unable to verify");
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(retryManagedParentDescriptor).toHaveBeenCalledOnce();
  });

  it("shows the in-flight retry instead of accepting a competing retry", () => {
    failManagedParentAuthority("Unable to verify the desktop's own server.");
    renderSection();
    expect(screen.getByRole("button", { name: /Retry/ })).toBeEnabled();

    act(() => markManagedParentRetrying());
    const retryingButton = screen.getByRole("button", { name: /Retry/ });
    expect(retryingButton).toBeDisabled();
    expect(screen.getByRole("alert").closest("section")).toHaveAttribute("aria-busy", "true");
  });

  it("retires the section when the authority is cleared", () => {
    publishManaged(true);
    const view = renderSection();
    expect(screen.getByText("Host-owned environments")).toBeTruthy();
    act(() => clearManagedParentAuthority());
    expect(view.container.textContent).toBe("");
  });
});
