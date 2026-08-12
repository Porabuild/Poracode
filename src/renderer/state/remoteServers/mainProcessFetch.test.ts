import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoracodeBridge } from "@/shared/ipc";
import type { ElectronHostBridge } from "@/shared/clientRuntime";
import {
  installBrowserClientRuntime,
  installElectronClientRuntime,
  resetClientRuntimeForTest,
} from "@/renderer/clientRuntime";
import { mainProcessFetch } from "./mainProcessFetch";

describe("remote server fetch transport", () => {
  beforeEach(() => {
    resetClientRuntimeForTest();
    vi.restoreAllMocks();
  });

  it("uses native fetch in the browser host", async () => {
    const browserBridge = { arch: "web" } as unknown as PoracodeBridge;
    window.poracode = browserBridge;
    installBrowserClientRuntime(browserBridge);
    const fetch = vi.spyOn(window, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));

    await expect(
      mainProcessFetch("https://host.example/api", {
        method: "POST",
        headers: { authorization: "Bearer token" },
        body: new TextEncoder().encode("payload"),
      }),
    ).resolves.toBeInstanceOf(Response);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[0]).toBe("https://host.example/api");
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: { authorization: "Bearer token" },
    });
  });

  it("keeps Electron requests on the main-process transport", async () => {
    const remoteHttpRequest = vi.fn<
      (input: unknown) => Promise<{ status: number; headers: Record<string, string>; body: string }>
    >(async () => ({
      status: 200,
      headers: { "content-type": "text/plain" },
      body: "ok",
    }));
    const electronBridge = {
      arch: "x64",
      remoteHttpRequest,
    } as unknown as PoracodeBridge;
    const host = {
      ...electronBridge,
      onSupervisorEvent: () => () => {},
      onBackendRendererStreamChanged: () => () => {},
      getBackendRendererStreamInfo: async () => null,
      invokeProcedure: async (name: keyof PoracodeBridge, args: unknown[]) => {
        const method = electronBridge[name] as unknown as (...input: unknown[]) => unknown;
        return method(...args);
      },
    } as unknown as ElectronHostBridge;
    installElectronClientRuntime(host);
    const fetch = vi.spyOn(window, "fetch");

    const response = await mainProcessFetch("https://host.example/api");

    expect(await response.text()).toBe("ok");
    expect(remoteHttpRequest).toHaveBeenCalledWith({ url: "https://host.example/api" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
