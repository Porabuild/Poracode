import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { pluginFixture, seedBuiltInPlugins } from "@/renderer/testUtils/plugins";
import type {
  PluginAccount,
  PluginAccountsPayload,
  PluginAccountsResult,
} from "@/shared/contracts/pluginCatalog";
import type { McpOauthWaitResult } from "@/shared/contracts";
import { PluginServiceAccounts } from "./PluginServiceAccounts";
import { usePluginOauth } from "./usePluginOauth";

const mocks = vi.hoisted(() => ({
  pluginAccounts: vi.fn<(payload: PluginAccountsPayload) => Promise<PluginAccountsResult>>(),
  openExternalNative: vi.fn<(url: string) => Promise<void>>(),
  waitMcpServerOauth: vi.fn<(payload: { flowId: string }) => Promise<McpOauthWaitResult>>(),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => mocks }));

function Harness({ managed = false }: { managed?: boolean }) {
  const plugin = {
    ...pluginFixture("github"),
    mcpServers: [
      {
        name: "service",
        entry: {
          type: "streamable-http" as const,
          url: "https://example.org/mcp",
          headers: managed ? { Authorization: "package-token" } : {},
        },
      },
    ],
  };
  const oauth = usePluginOauth(plugin);
  return (
    <>
      <PluginServiceAccounts plugin={plugin} oauth={oauth} />
      {oauth.error ? <p role="alert">{oauth.error}</p> : null}
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pluginAccounts.mockReset();
  mocks.waitMcpServerOauth.mockReset();
  mocks.openExternalNative.mockResolvedValue();
  seedBuiltInPlugins();
});

describe("plugin service account UI", () => {
  it("shows labels/scopes and selects and logs out only the named account", async () => {
    let accounts: PluginAccount[] = [
      {
        id: "23700f34-528d-405a-9611-a80fe0c393ed",
        pluginName: "github",
        serverName: "service",
        label: "Work",
        scopes: ["notes:read"],
        selected: true,
        status: "connected",
      },
      {
        id: "73a123b6-ed9b-4324-a73d-317ba04f7f63",
        pluginName: "github",
        serverName: "service",
        label: "Personal",
        scopes: ["notes:write"],
        selected: false,
        status: "connected",
      },
    ];
    mocks.pluginAccounts.mockImplementation(async (payload) => {
      if (payload.action === "select")
        accounts = accounts.map((account) => ({
          ...account,
          selected: account.id === payload.accountId,
        }));
      if (payload.action === "logout")
        accounts = accounts.map((account) =>
          account.id === payload.accountId ? { ...account, status: "disconnected" } : account,
        );
      return { accounts };
    });
    render(<Harness />);
    expect(await screen.findByText("Granted scopes: notes:read")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use account" }));
    await waitFor(() =>
      expect(mocks.pluginAccounts).toHaveBeenCalledWith({
        action: "select",
        pluginName: "github",
        serverName: "service",
        accountId: accounts[1]!.id,
      }),
    );
    const personal = screen.getByText("Personal").parentElement!;
    await waitFor(() => expect(within(personal).getByText("Selected")).toBeInTheDocument());
    fireEvent.click(within(personal).getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(within(personal).getByText("Disconnected")).toBeInTheDocument());
    expect(accounts[0]?.status).toBe("connected");
  });

  it("cancels a pending sign-in through that account's logout operation", async () => {
    const account: PluginAccount = {
      id: "23700f34-528d-405a-9611-a80fe0c393ed",
      pluginName: "github",
      serverName: "service",
      label: "Work",
      scopes: [],
      selected: true,
      status: "disconnected",
    };
    let finish!: (result: McpOauthWaitResult) => void;
    mocks.waitMcpServerOauth.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mocks.pluginAccounts.mockImplementation(async (payload) => {
      if (payload.action === "begin")
        return {
          accounts: [account],
          accountId: account.id,
          authorization: {
            status: "redirect",
            flowId: "flow",
            authorizationUrl: "https://example.org/authorize",
          },
        };
      if (payload.action === "logout") finish({ status: "error", message: "Canceled" });
      return { accounts: payload.action === "list" ? [] : [account] };
    });
    render(<Harness />);
    fireEvent.change(screen.getByRole("textbox", { name: "Account label for service" }), {
      target: { value: "Work" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel sign-in" }));
    await waitFor(() =>
      expect(mocks.pluginAccounts).toHaveBeenCalledWith({
        action: "logout",
        pluginName: "github",
        serverName: "service",
        accountId: account.id,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Cancel sign-in" })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reports package-managed authentication without offering OAuth", async () => {
    mocks.pluginAccounts.mockResolvedValue({
      accounts: [
        {
          id: "23700f34-528d-405a-9611-a80fe0c393ed",
          pluginName: "github",
          serverName: "service",
          label: "Old OAuth identity",
          scopes: ["notes:read"],
          selected: true,
          status: "connected",
        },
      ],
    });
    render(<Harness managed />);
    await waitFor(() => expect(mocks.pluginAccounts).toHaveBeenCalled());
    expect(
      screen.getByText(
        "Sign-in is unavailable for project plugins and services with plugin-managed authentication.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add account" })).not.toBeInTheDocument();
    expect(screen.queryByText("Old OAuth identity")).not.toBeInTheDocument();
    expect(screen.queryByText("Selected")).not.toBeInTheDocument();
  });
});
