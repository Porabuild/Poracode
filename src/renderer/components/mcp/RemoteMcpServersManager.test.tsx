import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { RemoteDesktopClient, type RemoteFetch } from "@/shared/remote/client";
import type { McpServer, Project } from "@/shared/contracts";
import { projectRemoteProject } from "@/renderer/state/remoteProjection";
import { RemoteMcpServersManager } from "./RemoteMcpServersManager";

const initialState = useRemoteServersStore.getState();
const server: McpServer = {
  id: "server-1",
  name: "remote-memory",
  description: "",
  enabled: true,
  timeoutMs: 30_000,
  transport: { type: "stdio", command: "memory", args: [], env: { TOKEN: "«redacted»" } },
};

afterEach(() => {
  cleanup();
  useRemoteServersStore.setState(initialState);
});

function setupRemote(fetch: RemoteFetch, workspace?: Project) {
  const client = new RemoteDesktopClient("https://remote.example.test", "test-token", fetch);
  useRemoteServersStore.setState({
    servers: [
      {
        desktopId: "desktop-a",
        connectionId: "connection-a",
        label: "Remote",
        endpoint: "https://remote.example.test",
        accessToken: "test-token",
        scopes: ["projects:manage"],
      },
    ],
    runtime: { "connection-a": { status: "online", projects: [], threads: [] } },
    withClient: (key, run) => {
      expect(key).toBe("connection-a");
      return run(client);
    },
  });
  return renderWithI18n(
    <RemoteMcpServersManager
      connectionKey="connection-a"
      projects={workspace ? [workspace] : []}
      {...(workspace ? { workspace } : {})}
    />,
  );
}

it("reads and edits one remote row through the existing credential-masking API", async () => {
  const next = { ...server, enabled: false };
  const fetch = vi.fn<RemoteFetch>(async (url, init) => {
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-token");
    if (String(url).endsWith("/command")) {
      return Response.json({ servers: [next] });
    }
    expect(String(url)).toBe("https://remote.example.test/api/settings/mcp-servers");
    return Response.json({ servers: [server] });
  });
  setupRemote(fetch);
  await screen.findByText(server.name);
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("switch", { name: `Disable ${server.name}` }));
  expect(await screen.findByRole("switch", { name: `Enable ${server.name}` })).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(JSON.parse(String(fetch.mock.calls[2]?.[1]?.body))).toEqual({
    kind: "upsert",
    scope: { kind: "global" },
    server: next,
  });
});

it("moves a project server on the selected host without sending the masked definition", async () => {
  const workspace = projectRemoteProject("connection-a", {
    id: "project-a",
    name: "Remote project",
    location: { kind: "posix", path: "/work/project" },
    createdAt: "2026-01-01T00:00:00Z",
  });
  let moved = false;
  const fetch = vi.fn<RemoteFetch>(async (url) => {
    const path = new URL(url).pathname;
    if (path === "/api/projects/project-a/settings") {
      return Response.json({ mcpServers: moved ? [] : [server] });
    }
    if (path === "/api/settings/mcp-servers/command") {
      moved = true;
      return Response.json({ servers: [server] });
    }
    expect(path).toBe("/api/settings/mcp-servers");
    return Response.json({ servers: [] });
  });
  setupRemote(fetch, workspace);
  fireEvent.click(await screen.findByRole("button", { name: `Edit ${server.name}` }));
  fireEvent.click(screen.getByRole("button", { name: "Scope" }));
  fireEvent.click(await screen.findByRole("menuitemradio", { name: /Global/u }));
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "Edit MCP server" })).getByRole("button", {
      name: "Save",
    }),
  );

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByText("Global")).toBeInTheDocument();
  const command = fetch.mock.calls.find(([url]) => String(url).endsWith("/command"));
  expect(JSON.parse(String(command?.[1]?.body))).toEqual({
    kind: "move",
    source: { kind: "project", projectId: "project-a" },
    destination: { kind: "global" },
    serverId: server.id,
  });
});

it("reports an older host without MCP settings instead of showing an editable local list", async () => {
  setupRemote(
    vi.fn(async () =>
      Response.json({ error: { code: "not_found", message: "Route not found." } }, { status: 404 }),
    ),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Route not found.");
  expect(screen.queryByRole("button", { name: "Add MCP server" })).not.toBeInTheDocument();
});

it("imports a JSON file into the paired host with new definitions disabled", async () => {
  const fetch = vi.fn<RemoteFetch>(async (url, init) => {
    if (!String(url).endsWith("/command")) return Response.json({ servers: [server] });
    const { server: imported } = JSON.parse(String(init?.body));
    return Response.json({ servers: [server, imported] });
  });
  const { container } = setupRemote(fetch);
  await screen.findByText(server.name);
  const picker = container.querySelector('input[type="file"]');
  if (!picker) throw new Error("Expected the remote MCP file picker");
  const file = new File(
    [JSON.stringify({ mcpServers: { imported: { command: "test-mcp" } } })],
    "mcp.json",
  );
  fireEvent.change(picker, { target: { files: [file] } });
  expect(await screen.findByRole("switch", { name: "Enable imported" })).toBeInTheDocument();
  const command = fetch.mock.calls.find(([url]) => String(url).endsWith("/command"));
  expect(JSON.parse(String(command?.[1]?.body))).toMatchObject({
    kind: "upsert",
    scope: { kind: "global" },
    server: { name: "imported", enabled: false, transport: { command: "test-mcp" } },
  });
});

it("sends the OAuth callback to the selected host and refreshes authorization status", async () => {
  const http: McpServer = {
    ...server,
    transport: { type: "http", url: "https://mcp.example.test/", headers: {} },
  };
  let authenticated = false;
  const fetch = vi.fn<RemoteFetch>(async (url, init) => {
    if (!String(url).endsWith("/operation")) return Response.json({ servers: [http] });
    const body = JSON.parse(String(init?.body));
    switch (body.kind) {
      case "probe":
        return Response.json({
          kind: "probe",
          result: {
            status: "auth-required",
            environment: { runtime: "host", projectScoped: false },
            latencyMs: 1,
            toolCount: 0,
            error: { code: "auth-required", message: "Sign in first" },
          },
        });
      case "oauth-status":
        return Response.json({
          kind: "oauth-status",
          authenticatedServerIds: authenticated ? [http.id] : [],
        });
      case "oauth-begin":
        return Response.json({
          kind: "oauth-begin",
          result: {
            status: "redirect",
            flowId: "flow",
            authorizationUrl: "https://login.example.test/",
          },
        });
      case "oauth-complete":
        authenticated = true;
        return Response.json({ kind: "oauth-complete", result: { status: "authorized" } });
      default:
        throw new Error("Unexpected MCP operation");
    }
  });
  setupRemote(fetch);
  await screen.findByText(http.name);
  // The row offers authorization after a probe reports that it is required.
  expect(screen.getByRole("button", { name: "Export MCP servers without secrets" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: `Check ${http.name} again` }));
  const oauth = await screen.findByRole("button", { name: "Authenticate" });
  fireEvent.click(oauth);
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("Open in browser")).toBeInTheDocument();
  const callbackUrl = "http://127.0.0.1:49150/callback?code=test&state=test";
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Callback URL" }), {
    target: { value: callbackUrl },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Continue" }));
  expect(
    await screen.findByRole("button", { name: `Sign out of ${http.name}` }),
  ).toBeInTheDocument();
  expect(
    fetch.mock.calls.map(([, init]) => init?.body && JSON.parse(String(init.body))),
  ).toContainEqual({
    kind: "oauth-complete",
    scope: { kind: "global" },
    serverId: http.id,
    flowId: "flow",
    callbackUrl,
  });
});
