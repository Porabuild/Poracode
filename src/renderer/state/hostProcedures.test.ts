import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduledTask } from "@/shared/contracts";
import type { RemoteServersState } from "./remoteServers/types";

const bridge = vi.hoisted(() => ({
  createSchedule: vi.fn<(input: unknown) => Promise<unknown>>(),
  updateSchedule: vi.fn<(input: unknown) => Promise<unknown>>(),
}));

vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));

import { useRemoteServersStore } from "./remoteServersStore";
import { callHostProcedure } from "./hostProcedures";

const task = { id: "task-1", name: "Nightly" } as ScheduledTask;
const originalWithClient = useRemoteServersStore.getState().withClient;

describe("callHostProcedure", () => {
  beforeEach(() => {
    bridge.createSchedule.mockReset().mockResolvedValue(task);
    bridge.updateSchedule.mockReset().mockResolvedValue(task);
    useRemoteServersStore.setState({ withClient: originalWithClient });
  });

  it("sends the attached host's call through the bridge with the procedure payload", async () => {
    const input = { name: "Nightly" } as never;
    await expect(callHostProcedure(undefined, "createSchedule", input)).resolves.toBe(task);
    expect(bridge.createSchedule).toHaveBeenCalledWith(input);
    await callHostProcedure(undefined, "updateSchedule", { id: "task-1", task: input });
    expect(bridge.updateSchedule).toHaveBeenCalledWith({ id: "task-1", task: input });
  });

  it("sends a paired host's call through its connection with the same translation", async () => {
    const client = {
      createSchedule: vi.fn<(input: unknown) => Promise<unknown>>(async () => task),
      updateSchedule: vi.fn<(id: string, input: unknown) => Promise<unknown>>(async () => task),
    };
    const connections: string[] = [];
    const withClient: RemoteServersState["withClient"] = async (key, invoke) => {
      connections.push(key);
      return invoke(client as unknown as Parameters<typeof invoke>[0]);
    };
    useRemoteServersStore.setState({ withClient });
    const input = { name: "Nightly" } as never;

    await expect(callHostProcedure("studio", "createSchedule", input)).resolves.toBe(task);
    await callHostProcedure("studio", "updateSchedule", { id: "task-1", task: input });

    expect(connections).toEqual(["studio", "studio"]);
    expect(client.createSchedule).toHaveBeenCalledWith(input);
    expect(client.updateSchedule).toHaveBeenCalledWith("task-1", input);
    expect(bridge.createSchedule).not.toHaveBeenCalled();
    expect(bridge.updateSchedule).not.toHaveBeenCalled();
  });

  it("surfaces a paired host failure to the caller", async () => {
    const withClient: RemoteServersState["withClient"] = async () => {
      throw new Error("offline");
    };
    useRemoteServersStore.setState({ withClient });
    await expect(callHostProcedure("studio", "createSchedule", {} as never)).rejects.toThrow(
      "offline",
    );
  });
});
