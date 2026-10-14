import { afterEach, describe, expect, it, vi } from "vitest";
import { GitBurstGaugePoller } from "./helpers/gitBurstDiagnostics.ts";

describe("GitBurstGaugePoller", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("bounds an in-flight metrics read when the qualification window closes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
            once: true,
          });
        });
      }),
    );
    const poller = new GitBurstGaugePoller("http://127.0.0.1:49152", 1, 25);
    poller.start();
    await new Promise((resolve) => setTimeout(resolve, 10));

    await expect(poller.stop()).resolves.toBeUndefined();
    expect(poller.window(0, Date.now())).toMatchObject({
      samples: 1,
      presentSamples: 0,
    });
  });
});
