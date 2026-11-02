import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@/shared/contracts";
import { composerCustomMcpItems } from "./composerCustomMcpServers";

const mocks = vi.hoisted(() => ({
  loadAuthoritative: vi.fn<(projectId: string) => Promise<McpServer[]>>(),
  saveProject: vi.fn<(projectId: string, servers: McpServer[]) => Promise<void>>(
    async () => undefined,
  ),
  loadUser: vi.fn<() => Promise<McpServer[]>>(),
  saveUser: vi.fn<(servers: McpServer[]) => Promise<void>>(async () => undefined),
  toastDanger: vi.fn<(message: string) => void>(),
}));

vi.mock("@/renderer/state/projectSettings/projectSettingsLoader", () => ({
  loadAuthoritativeProjectMcpServers: mocks.loadAuthoritative,
}));
vi.mock("@/renderer/actions/projectActions", () => ({
  saveProjectMcpServers: mocks.saveProject,
}));
vi.mock("@/renderer/components/mcp/mcpServersMutation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/components/mcp/mcpServersMutation")>()),
  sharedSettingsServerPersistence: () => ({
    loadServers: mocks.loadUser,
    saveServers: mocks.saveUser,
  }),
}));
vi.mock("@heroui/react", () => ({ toast: { danger: mocks.toastDanger } }));

const location = { kind: "windows" as const, path: "E:\\work\\project" };

function server(id: string, overrides: Partial<McpServer> = {}): McpServer {
  return {
    id,
    name: id,
    description: "",
    enabled: false,
    timeoutMs: 30_000,
    transport: { type: "http", url: `https://${id}.example.test/`, headers: {} },
    ...overrides,
  };
}

describe("composerCustomMcpItems", () => {
  beforeEach(() => vi.clearAllMocks());

  it("toggles a project server against the authoritative list, not the projection", async () => {
    const vercel = server("vercel");
    const addedElsewhere = server("linear", { enabled: true });
    mocks.loadAuthoritative.mockResolvedValue([vercel, addedElsewhere]);
    const [item] = composerCustomMcpItems({
      servers: [vercel],
      userServers: [],
      projectServers: [vercel],
      projectId: "p1",
      projectLocation: location,
      editable: true,
    });

    expect(item).toMatchObject({
      id: "project:vercel",
      enabled: false,
      oauth: { server: vercel, projectLocation: location },
    });
    item!.onToggle!(true);

    await waitFor(() =>
      expect(mocks.saveProject).toHaveBeenCalledExactlyOnceWith("p1", [
        { ...vercel, enabled: true },
        addedElsewhere,
      ]),
    );
    expect(mocks.saveUser).not.toHaveBeenCalled();
  });

  it("serializes overlapping toggles so the later save keeps the earlier change", async () => {
    let hostList = [server("vercel"), server("linear")];
    mocks.loadAuthoritative.mockImplementation(async () => hostList);
    mocks.saveProject.mockImplementation(async (_projectId, servers) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      hostList = servers;
    });
    const [vercelItem, linearItem] = composerCustomMcpItems({
      servers: hostList,
      userServers: [],
      projectServers: hostList,
      projectId: "p1",
      projectLocation: location,
      editable: true,
    });

    vercelItem!.onToggle!(true);
    linearItem!.onToggle!(true);

    await waitFor(() => expect(mocks.saveProject).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(hostList.map((item) => item.enabled)).toEqual([true, true]));
  });

  it("toggles a Global server through shared settings and reports a refused save", async () => {
    const context7 = server("context7", { enabled: true });
    mocks.loadUser.mockResolvedValue([context7]);
    mocks.saveUser.mockRejectedValueOnce(new Error("refused"));
    const [item] = composerCustomMcpItems({
      servers: [context7],
      userServers: [context7],
      projectServers: [],
      projectId: "p1",
      projectLocation: location,
      editable: true,
    });

    expect(item).toMatchObject({ id: "user:context7", oauth: { server: context7 } });
    expect(item!.oauth).not.toHaveProperty("projectLocation");
    item!.onToggle!(false);

    await waitFor(() => expect(mocks.toastDanger).toHaveBeenCalledOnce());
    expect(mocks.saveUser).toHaveBeenCalledWith([{ ...context7, enabled: false }]);
    expect(mocks.saveProject).not.toHaveBeenCalled();
  });

  it("renders provider-owned rows without toggles or sign-in", () => {
    const [item] = composerCustomMcpItems({
      servers: [server("vercel", { enabled: true })],
      userServers: [],
      projectServers: [server("vercel", { enabled: true })],
      projectId: "p1",
      projectLocation: location,
      editable: false,
    });
    expect(item).not.toHaveProperty("onToggle");
    expect(item).not.toHaveProperty("oauth");
  });
});
