import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, AgentStatusesResponse, Project } from "@/shared/contracts";
import { deepSeekDefaultCapabilities } from "@/supervisor/agents/deepseek/detection";
import { watchDeepSeekLogin } from "./terminalLogin";

const refresh = vi.hoisted(() => vi.fn<() => Promise<AgentStatusesResponse>>());
vi.mock("@/renderer/bridge", () => ({ readBridge: () => ({ refreshAgentStatuses: refresh }) }));

const status: AgentStatus = {
  kind: "deepseek",
  label: "DeepSeek Harness",
  installed: true,
  authState: "unknown",
  capabilities: deepSeekDefaultCapabilities,
};
const project: Project = {
  id: "project",
  name: "Project",
  createdAt: "2026-10-18T00:00:00Z",
  location: { kind: "windows", path: "C:\\project" },
};
const signedIn = {
  windows: [{ ...status, authState: "authenticated" as const }],
  wsl: [],
  fromCache: false,
};

describe("DeepSeek browser login completion", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refresh.mockReset().mockResolvedValue({ windows: [status], wsl: [], fromCache: false });
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("finishes on fresh stored authentication while the web server keeps running", async () => {
    const onAuthenticated = vi.fn<() => void>();
    const stop = watchDeepSeekLogin({ status, project, onAuthenticated });
    await vi.advanceTimersByTimeAsync(3000);
    expect(onAuthenticated).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledWith([], {
      agentKinds: ["deepseek"],
      envs: [{ kind: "native" }],
    });
    refresh.mockResolvedValue(signedIn);
    await vi.advanceTimersByTimeAsync(3000);
    expect(onAuthenticated).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(9000);
    expect(refresh).toHaveBeenCalledTimes(2);
    stop();
  });

  it("ignores cached auth, retries discovery failures, and fences a closed session", async () => {
    const onAuthenticated = vi.fn<() => void>();
    refresh
      .mockResolvedValueOnce({ ...signedIn, fromCache: true })
      .mockRejectedValueOnce(new Error("offline"));
    const stop = watchDeepSeekLogin({ status, project, onAuthenticated });
    await vi.advanceTimersByTimeAsync(6000);
    expect(onAuthenticated).not.toHaveBeenCalled();
    let resolve!: (response: AgentStatusesResponse) => void;
    refresh.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await vi.advanceTimersByTimeAsync(3000);
    stop();
    resolve(signedIn);
    await vi.advanceTimersByTimeAsync(9000);
    expect(onAuthenticated).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("checks only the selected WSL distro", async () => {
    const onAuthenticated = vi.fn<() => void>();
    const wslStatus = { ...status, envKind: "wsl" as const, envDistro: "Ubuntu" };
    const stop = watchDeepSeekLogin({ status: wslStatus, project, onAuthenticated });
    refresh.mockResolvedValue({
      ...signedIn,
      wsl: [{ ...wslStatus, envDistro: "Other", authState: "authenticated" }],
    });
    await vi.advanceTimersByTimeAsync(3000);
    expect(refresh).toHaveBeenCalledWith(["Ubuntu"], {
      agentKinds: ["deepseek"],
      envs: [{ kind: "wsl", distro: "Ubuntu" }],
    });
    expect(onAuthenticated).not.toHaveBeenCalled();
    refresh.mockResolvedValue({ ...signedIn, wsl: [{ ...wslStatus, authState: "authenticated" }] });
    await vi.advanceTimersByTimeAsync(3000);
    expect(onAuthenticated).toHaveBeenCalledOnce();
    stop();
  });

  it("never uses local auth to complete a paired-host login", async () => {
    const onAuthenticated = vi.fn<() => void>();
    const stop = watchDeepSeekLogin({
      status,
      project: { ...project, remoteServerId: "remote" },
      onAuthenticated,
    });
    await vi.advanceTimersByTimeAsync(6000);
    expect(refresh).not.toHaveBeenCalled();
    expect(onAuthenticated).not.toHaveBeenCalled();
    stop();
  });
});
