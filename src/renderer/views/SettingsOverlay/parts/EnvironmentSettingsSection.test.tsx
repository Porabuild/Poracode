import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { AppProvider } from "@/renderer/components/ui/provider";
import type { EnvironmentPublicProjection } from "@/shared/environments";
import type { RemoteAccessScope } from "@/shared/remote";

const listEnvironments = vi.hoisted(() =>
  vi.fn<() => Promise<EnvironmentPublicProjection[]>>(async () => []),
);

vi.mock("@/renderer/state/remoteServers/environmentSessions", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/renderer/state/remoteServers/environmentSessions")>();
  return {
    ...actual,
    parentClientFor: () => ({ listEnvironments }),
  };
});

import { useEnvironmentManagementStore } from "@/renderer/state/remoteServers/environmentManagement";
import { EnvironmentSettingsSection } from "./EnvironmentSettingsSection";
import { environmentParentCacheKey } from "@/renderer/state/remoteServers/types";

const PARENT_KEY = "conn-parent";
const PARENT_REF = { kind: "connection", connectionId: PARENT_KEY } as const;
const PARENT_BUCKET = environmentParentCacheKey(PARENT_REF);

function projection(): EnvironmentPublicProjection {
  return {
    environmentId: "11111111-1111-4111-8111-111111111111",
    revision: 1,
    label: "Build box",
    target: "user@host",
    trust: { state: "unknown" },
    runtime: { hash: "a".repeat(64) },
    credential: "none",
    legacyConnectionIds: [],
    desired: "enabled",
    createdAt: 1,
    updatedAt: 1,
    state: "disconnected",
  };
}

function seed() {
  useEnvironmentManagementStore.setState({
    byParent: {
      [PARENT_BUCKET]: { status: "ready", environments: [projection()] },
    },
  });
}

function renderSection(scopes: readonly RemoteAccessScope[]) {
  return render(
    <AppProvider>
      <EnvironmentSettingsSection parent={PARENT_REF} parentScopes={scopes} />
    </AppProvider>,
  );
}

beforeEach(() => {
  listEnvironments.mockClear();
  useEnvironmentManagementStore.setState({ byParent: {} });
  useEnvironmentManagementStore.getState().__resetForTest();
  seed();
});

describe("EnvironmentSettingsSection scope gating (ADR §6)", () => {
  it("hides use and manage actions from a viewer", () => {
    renderSection(["session:read"]);
    expect(screen.getByText("Host-owned environments")).toBeTruthy();
    expect(screen.queryByText("New environment")).toBeNull();
    expect(screen.queryByText("Connect")).toBeNull();
    expect(screen.queryByText("Edit")).toBeNull();
    expect(screen.queryByText("Delete")).toBeNull();
  });

  it("allows use actions but no management for an operator", () => {
    renderSection(["session:read", "session:operate", "ports:forward"]);
    expect(screen.getByText("Connect")).toBeTruthy();
    expect(screen.queryByText("New environment")).toBeNull();
    expect(screen.queryByText("Edit")).toBeNull();
    expect(screen.queryByText("Delete")).toBeNull();
  });

  it("shows management actions for a manager", () => {
    renderSection(["session:read", "session:operate", "ports:forward", "projects:manage"]);
    expect(screen.getByText("New environment")).toBeTruthy();
    expect(screen.getByText("Edit")).toBeTruthy();
    expect(screen.getByText("Delete")).toBeTruthy();
  });

  it("renders nothing without read scope", () => {
    const view = renderSection(["session:operate"]);
    expect(view.container.textContent).toBe("");
  });
});

describe("EnvironmentSettingsSection metadata-only edits (C1 F5)", () => {
  const updateEnvironment = vi.fn<(parent: string, id: string, patch: unknown) => Promise<never>>(
    async () => {
      throw new Error("stop-after-capture");
    },
  );

  beforeEach(() => {
    useEnvironmentManagementStore.setState({
      byParent: { [PARENT_BUCKET]: { status: "ready", environments: [projection()] } },
      refreshEnvironments: (async () => []) as never,
      updateEnvironment: updateEnvironment as never,
    });
    updateEnvironment.mockClear();
  });

  function saveEdit(): Record<string, unknown> {
    renderSection(["session:read", "session:operate", "ports:forward", "projects:manage"]);
    fireEvent.click(screen.getByRole("button", { name: /^Edit$/ }));
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    });
    expect(updateEnvironment).toHaveBeenCalledTimes(1);
    return updateEnvironment.mock.calls[0]![2] as Record<string, unknown>;
  }

  it("omits credentialRef (never sends null) when the field is left empty", () => {
    const patch = saveEdit();
    expect("credentialRef" in patch).toBe(false);
    expect(patch.label).toBe("Build box");
    expect(patch.target).toBe("user@host");
  });

  it("sends a typed credential reference", () => {
    renderSection(["session:read", "session:operate", "ports:forward", "projects:manage"]);
    fireEvent.click(screen.getByRole("button", { name: /^Edit$/ }));
    const input = screen.getByLabelText("Host credential reference");
    fireEvent.change(input, { target: { value: "vault://build" } });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    });
    const patch = updateEnvironment.mock.calls[0]![2] as Record<string, unknown>;
    expect(patch.credentialRef).toBe("vault://build");
  });
});
