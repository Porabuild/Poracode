import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoracodeBridge } from "@/shared/ipc";
import { readBridge } from "./bridge";
import { registerRemoteProcedureHost, type RemoteProcedureHost } from "./remoteProcedureRouter";

function makeRemoteHost(
  gitCall: RemoteProcedureHost["gitCall"] = async () => undefined,
): RemoteProcedureHost {
  return {
    resolveThreadOwner: () => undefined,
    resolveProjectOwner: () => undefined,
    gitCall,
    loadThreadRuntimeItemsPage: async () => undefined,
    startRemoteShell: async () => {},
    closeRemoteTerminal: async () => {},
    writeThreadTerminal: async () => {},
    resizeThreadTerminal: async () => {},
  };
}

describe("remote-aware renderer bridge", () => {
  beforeEach(() => {
    registerRemoteProcedureHost(undefined);
  });

  it("routes allowlisted project procedures when a remote owner is resolved", async () => {
    const local = vi.fn<() => Promise<unknown>>(async () => ({ local: true }));
    window.poracode = {
      getGitStatus: local,
    } as unknown as PoracodeBridge;
    const remote = vi.fn<RemoteProcedureHost["gitCall"]>(async (_desktopId, procedure, payload) => {
      expect(_desktopId).toBe("d1");
      expect(procedure).toBe("getGitStatus");
      expect(payload).toEqual({
        projectLocation: { kind: "posix", path: "/remote/project" },
      });
      return { remote: true };
    });
    registerRemoteProcedureHost(makeRemoteHost(remote));

    await expect(
      readBridge().getGitStatus({
        projectLocation: {
          kind: "posix",
          path: "/remote/project",
          remoteServerId: "d1",
        },
      }),
    ).resolves.toEqual({ remote: true });
    expect(remote).toHaveBeenCalledOnce();
    expect(local).not.toHaveBeenCalled();
  });

  it("falls through to the local bridge when the router declines the payload", async () => {
    const local = vi.fn<() => Promise<unknown>>(async () => ({ local: true }));
    window.poracode = {
      getGitStatus: local,
    } as unknown as PoracodeBridge;
    registerRemoteProcedureHost(makeRemoteHost());

    await expect(
      readBridge().getGitStatus({
        projectLocation: { kind: "posix", path: "/local/project" },
      }),
    ).resolves.toEqual({ local: true });
    expect(local).toHaveBeenCalledOnce();
  });

  it("wraps the frozen Electron preload bridge without violating proxy invariants", async () => {
    let routedReceiver: unknown;
    let nativeReceiver: unknown;
    const source = Object.freeze({
      async getGitStatus(this: unknown) {
        routedReceiver = this;
        return { local: true };
      },
      nativeCall(this: unknown) {
        nativeReceiver = this;
      },
    });
    window.poracode = source as unknown as PoracodeBridge;

    await expect(
      readBridge().getGitStatus({
        projectLocation: { kind: "posix", path: "/local/project" },
      }),
    ).resolves.toEqual({ local: true });
    (readBridge() as unknown as { nativeCall(): void }).nativeCall();
    expect(routedReceiver).toBe(source);
    expect(nativeReceiver).toBe(source);
  });
});
