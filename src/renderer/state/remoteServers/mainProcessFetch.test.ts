import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoracodeBridge } from "@/shared/ipc";
import type { ElectronHostBridge } from "@/shared/clientRuntime";
import { mainProcessFetch } from "./mainProcessFetch";

const remoteHttpBridgeFetch = vi.hoisted(() =>
  vi.fn<(url: string, init?: unknown) => Promise<Response>>(),
);
vi.mock("./remoteHttpBridgeClient", () => ({
  remoteHttpBridgeFetch: (url: string, init?: unknown) => remoteHttpBridgeFetch(url, init),
}));

const runtimeState = vi.hoisted(() => ({ host: "electron" as "electron" | "browser" }));
vi.mock("@/renderer/clientRuntime", () => ({
  readClientRuntime: () => ({ host: runtimeState.host }),
  hasAnyClientBridge: () => window.poracodeHost !== undefined || window.poracode !== undefined,
}));

describe("remote server fetch transport", () => {
  beforeEach(() => {
    runtimeState.host = "electron";
    remoteHttpBridgeFetch.mockReset();
    window.poracode = undefined as unknown as typeof window.poracode;
    delete window.poracodeHost;
    vi.restoreAllMocks();
  });

  it("uses native fetch in the browser host", async () => {
    runtimeState.host = "browser";
    window.poracode = {} as PoracodeBridge;
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
    expect(remoteHttpBridgeFetch).not.toHaveBeenCalled();
  });

  it("keeps Electron requests on the off-main bridge", async () => {
    window.poracodeHost = {} as ElectronHostBridge;
    remoteHttpBridgeFetch.mockResolvedValue(new Response("ok", { status: 200 }));
    const fetch = vi.spyOn(window, "fetch");

    const response = await mainProcessFetch("https://host.example/api");

    expect(await response.text()).toBe("ok");
    expect(remoteHttpBridgeFetch).toHaveBeenCalledWith("https://host.example/api", undefined);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("propagates renderer aborts as AbortError without a main fallback", async () => {
    window.poracodeHost = {} as ElectronHostBridge;
    const controller = new AbortController();
    remoteHttpBridgeFetch.mockImplementation(
      async (_url, init) =>
        await new Promise<Response>((_resolve, reject) => {
          (init as { signal?: AbortSignal } | undefined)?.signal?.addEventListener(
            "abort",
            () => reject(new Error("bridge interaction aborted")),
            { once: true },
          );
        }),
    );

    const pending = mainProcessFetch("https://host.example/api", { signal: controller.signal });
    await vi.waitFor(() => expect(remoteHttpBridgeFetch).toHaveBeenCalledOnce());
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("normalizes bridge failures to the status-zero transport error", async () => {
    window.poracodeHost = {} as ElectronHostBridge;
    remoteHttpBridgeFetch.mockRejectedValue(new Error("bridge utility gone"));

    await expect(mainProcessFetch("https://host.example/api")).rejects.toMatchObject({
      status: 0,
      code: "network",
    });
  });
});
