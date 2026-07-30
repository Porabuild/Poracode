// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScheduleRunInboxQuery, UpdateScheduleRunStatePayload } from "@/shared/contracts";
import type { PoracodeBridge } from "@/shared/ipc";
import type { RemoteDesktopClient } from "./remoteClient";
import { installRemoteBridge, setRemoteBridgeClient } from "./bridge";

vi.mock("./browserMirror", () => ({
  useBrowserMirrorStore: { getState: () => ({}) },
}));
vi.mock("./settingsSync", () => ({ pushDesktopSettingsDiff: () => undefined }));
vi.mock("./storeSync", () => ({ applyAgentStatuses: () => undefined }));

describe("remote schedule run bridge", () => {
  afterEach(() => {
    setRemoteBridgeClient(null);
    Object.defineProperty(window, "poracode", {
      configurable: true,
      writable: true,
      value: undefined,
    });
  });

  it("forwards schedule run operations to the active desktop client", async () => {
    const scheduleRuns = vi.fn<(id: string) => Promise<never[]>>(async () => []);
    const scheduleRunInbox = vi.fn<(query: ScheduleRunInboxQuery) => Promise<never[]>>(
      async () => [],
    );
    const updateScheduleRunState = vi.fn<(payload: UpdateScheduleRunStatePayload) => Promise<null>>(
      async () => null,
    );
    const cancelScheduleRun = vi.fn<(id: string) => Promise<boolean>>(async () => true);
    setRemoteBridgeClient({
      scheduleRuns,
      scheduleRunInbox,
      updateScheduleRunState,
      cancelScheduleRun,
    } as unknown as RemoteDesktopClient);
    Object.defineProperty(window, "poracode", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    installRemoteBridge();
    const bridge = window.poracode as Pick<
      PoracodeBridge,
      "getScheduleRuns" | "getScheduleRunInbox" | "updateScheduleRunState" | "cancelScheduleRun"
    >;
    const scheduleId = "d2ac39e9-14ac-4776-9279-37a1e455a5db";
    const runId = "6f3b1a2c-1111-4d5e-8a9b-0c1d2e3f4a5b";

    await bridge.getScheduleRuns({ id: scheduleId });
    await bridge.getScheduleRunInbox({ filter: "unread", limit: 25 });
    await bridge.updateScheduleRunState({ id: runId, unread: false });
    await bridge.cancelScheduleRun({ id: runId });

    expect(scheduleRuns).toHaveBeenCalledWith(scheduleId);
    expect(scheduleRunInbox).toHaveBeenCalledWith({ filter: "unread", limit: 25 });
    expect(updateScheduleRunState).toHaveBeenCalledWith({ id: runId, unread: false });
    expect(cancelScheduleRun).toHaveBeenCalledWith(runId);
  });
});
