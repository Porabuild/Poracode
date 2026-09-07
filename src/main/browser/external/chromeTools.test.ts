import { describe, expect, it, vi } from "vitest";
import type { CdpSession } from "../cdp/cdpClient";
import type { ExternalChromeConnection } from "./ExternalChromeConnection";
import { dispatchChromeTool } from "./chromeTools";

describe("dispatchChromeTool", () => {
  it.each([
    ["Space", " ", "Space"],
    ["Esc", "Escape", "Escape"],
    ["Delete", "Delete", "Delete"],
  ])("delivers the shared %s key through native Chrome input", async (key, expectedKey, code) => {
    const sendCdp = vi
      .fn<(method: string, params: Record<string, unknown>) => Promise<void>>()
      .mockResolvedValue(undefined);
    const connection = {
      cdpSession: () => ({ send: sendCdp }),
      sendCdp,
    } as unknown as ExternalChromeConnection;
    await expect(
      dispatchChromeTool(
        "press",
        { key, shift: true },
        { connection, allowEval: false, allowDataAccess: false },
      ),
    ).resolves.toEqual({ ok: true });
    expect(sendCdp).toHaveBeenCalledTimes(2);
    expect(sendCdp).toHaveBeenLastCalledWith(
      "Input.dispatchKeyEvent",
      expect.objectContaining({ type: "keyUp", key: expectedKey, code, modifiers: 8 }),
    );
  });
  it("attaches for an enabled session and detaches when it is disabled", async () => {
    const cdp = {
      send: vi.fn<() => Promise<unknown>>().mockResolvedValue({
        result: { type: "boolean", value: true },
      }),
    } as unknown as CdpSession;
    const connection = {
      cdpSession: () => cdp,
      ensureWorkspace: vi.fn<() => Promise<number>>().mockResolvedValue(7),
      isAttached: () => true,
      detach: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      status: () => ({ connected: true, extensionVersion: "1", attachedTabId: 7 }),
    } as unknown as ExternalChromeConnection;
    const setSessionActive = vi.fn<(active: boolean) => boolean>().mockReturnValue(true);
    const ctx = {
      connection,
      allowEval: false,
      allowDataAccess: false,
      setSessionActive,
    };

    await expect(dispatchChromeTool("enable", {}, ctx)).resolves.toMatchObject({
      enabled: true,
    });
    await expect(dispatchChromeTool("disable", {}, ctx)).resolves.toEqual({
      enabled: false,
    });

    expect(connection.ensureWorkspace).toHaveBeenCalledOnce();
    expect(setSessionActive).toHaveBeenNthCalledWith(1, true);
    expect(setSessionActive).toHaveBeenNthCalledWith(2, false);
    expect(connection.detach).toHaveBeenCalledOnce();
  });

  it("does not hide or detach while another Chrome session remains active", async () => {
    const cdp = {
      send: vi.fn<() => Promise<unknown>>().mockResolvedValue({
        result: { type: "boolean", value: true },
      }),
    } as unknown as CdpSession;
    const connection = {
      cdpSession: () => cdp,
      isAttached: () => true,
      detach: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    } as unknown as ExternalChromeConnection;

    await expect(
      dispatchChromeTool(
        "disable",
        {},
        {
          connection,
          allowEval: false,
          allowDataAccess: false,
          setSessionActive: () => false,
        },
      ),
    ).resolves.toEqual({ enabled: false });

    expect(cdp.send).not.toHaveBeenCalled();
    expect(connection.detach).not.toHaveBeenCalled();
  });

  it("hides and restores the presence cursor around external Chrome screenshots", async () => {
    const events: string[] = [];
    const cdp = {
      send: vi.fn<(method: string, params?: Record<string, unknown>) => Promise<unknown>>(
        async (method, params) => {
          if (method === "Runtime.evaluate") {
            const expression = String(params?.expression ?? "");
            if (expression.includes("depth+1")) {
              events.push("hide");
            } else {
              events.push("restore");
            }
            return { result: { type: "boolean", value: true } };
          }
          if (method === "Page.captureScreenshot") {
            events.push("capture");
            return { data: Buffer.from("screenshot").toString("base64") };
          }
          return {};
        },
      ),
    } as unknown as CdpSession;
    const connection = {
      cdpSession: () => cdp,
    } as unknown as ExternalChromeConnection;

    const result = await dispatchChromeTool(
      "chrome_screenshot",
      {},
      {
        connection,
        allowEval: false,
        allowDataAccess: false,
      },
    );

    expect(events).toEqual(["hide", "capture", "restore"]);
    expect(result).toEqual({
      __image: Buffer.from("screenshot").toString("base64"),
      mimeType: "image/jpeg",
    });
  });
});
