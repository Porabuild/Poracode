import { expect, it, vi } from "vitest";
import type { AgentStatusesResponse, Project } from "@/shared/contracts";
import { agentCapabilitySchema } from "@/shared/contracts";
import type { AppProviderLoginRequest } from "@/shared/contracts/appProviderAuth";
import { runAppProviderLogin } from "./appProviderLoginActions";
import type { runAgentLoginCommand } from "./agentLoginActions";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn<() => Promise<AgentStatusesResponse>>(),
  login: vi.fn<typeof runAgentLoginCommand>(),
  terminal: vi.fn<() => { active?: object }>(),
  projects: vi.fn<() => { projects: Project[] }>(),
}));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ platform: "win32", refreshAgentStatuses: mocks.refresh }),
}));
vi.mock("@/renderer/state/appStore", () => ({ useAppStore: { getState: mocks.projects } }));
vi.mock("@/renderer/state/loginTerminalStore", () => ({
  useLoginTerminalStore: { getState: mocks.terminal },
}));
vi.mock("./agentLoginActions", () => ({ runAgentLoginCommand: mocks.login }));

it("uses the host-selected login command and local WSL environment after admission", async () => {
  const request = {
    version: 1,
    input: { agentKind: "fixture", methodId: "terminal", env: { kind: "wsl", distro: "Fixture" } },
  } as const satisfies AppProviderLoginRequest;
  mocks.projects.mockReturnValue({ projects: [] });
  mocks.terminal.mockReturnValue({ active: {} });
  mocks.refresh.mockResolvedValue({
    fromCache: false,
    windows: [],
    wsl: [
      {
        kind: "fixture",
        label: "Fixture",
        installed: true,
        authState: "missing",
        capabilities: agentCapabilitySchema.parse({}),
        loginCommand: "fixture login",
        authMethods: [
          { id: "terminal", name: "Terminal", type: "terminal", env: { PRIVATE: "fixture" } },
        ],
        envKind: "wsl",
        envDistro: "Fixture",
      },
    ],
  });
  const begin = vi.fn<() => Promise<void>>(async () => undefined);
  await expect(runAppProviderLogin(request, begin)).rejects.toThrow(/already open/u);
  expect(mocks.login).not.toHaveBeenCalled();

  mocks.terminal.mockReturnValue({});
  mocks.login.mockReturnValue(true);
  const admitted = Promise.withResolvers<void>();
  const gatedBegin = vi.fn<() => Promise<void>>(() => admitted.promise);
  const result = runAppProviderLogin(request, gatedBegin);
  try {
    await vi.waitFor(() => expect(gatedBegin).toHaveBeenCalledOnce());
    expect(mocks.login).not.toHaveBeenCalled();
  } finally {
    admitted.resolve();
  }
  await expect(result).resolves.toEqual({ opened: true });
  expect(mocks.login).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      command: "fixture login",
      env: { PRIVATE: "fixture" },
      project: expect.objectContaining({
        location: expect.objectContaining({ kind: "wsl", distro: "Fixture" }),
      }),
    }),
  );
});
