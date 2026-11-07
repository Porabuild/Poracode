import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentVisionService } from "./AgentVisionService";

const image = "data:image/jpeg;base64,aGVsbG8=";

afterEach(() => vi.useRealTimers());

describe("AgentVisionService", () => {
  it("caps streaming captures at 15 fps and coalesces multiple viewers", async () => {
    vi.useFakeTimers();
    const service = new AgentVisionService();
    const capture = vi.fn<() => Promise<{ image: string }>>(async () => ({ image }));
    service.begin("a", "browser", "wait", { capture });
    for (let frame = 0; frame < 15; frame++) {
      await Promise.all([service.read("a", true, true), service.read("a", true, true)]);
      await service.read("a", false, true);
      vi.advanceTimersByTime(67);
    }
    expect(capture).toHaveBeenCalledTimes(15);
    service.stop("a");
    vi.advanceTimersByTime(1000);
    await service.read("a", true, true);
    expect(capture).toHaveBeenCalledTimes(15);
  });
  it("tracks each thread without a client, captures only for viewers, and coalesces reads", async () => {
    const service = new AgentVisionService();
    const capture = vi.fn<() => Promise<{ image: string }>>(async () => ({ image }));
    const action = service.begin("a", "browser", "navigate");
    expect(await service.read("a", false)).toMatchObject({ status: "running" });
    action.finish({ target: "https://example.test", capture });
    service.begin("b", "computer", "click").finish();
    expect(await service.read("a", false)).toMatchObject({
      source: "browser",
      target: "https://example.test",
    });
    expect(capture).not.toHaveBeenCalled();
    await Promise.all([service.read("a"), service.read("a")]);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(await service.read("a")).toMatchObject({ image, capturedAt: expect.any(Number) });
    expect(await service.read("a", false)).not.toHaveProperty("image");
    expect(await service.read("a")).toMatchObject({ image });
    expect(await service.read("b")).toMatchObject({ source: "computer" });
    expect(await service.read("unknown")).toBeNull();
  });

  it("fences stale actions and in-flight captures after stop, replacement, and shutdown", async () => {
    const service = new AgentVisionService();
    const first = service.begin("a", "browser", "navigate");
    service.begin("a", "computer", "click").finish();
    first.finish({ target: "stale" });
    expect(await service.read("a")).toMatchObject({ source: "computer" });
    const pending = Promise.withResolvers<{ image: string }>();
    service.begin("a", "browser", "click").finish({ capture: () => pending.promise });
    const read = service.read("a");
    service.stop("a");
    pending.resolve({ image });
    expect(await read).not.toHaveProperty("image");
    service.dispose();
    expect(await service.read("a")).toBeNull();
  });

  it("refreshes the pinned preview throughout a long action and clears the old target", async () => {
    vi.useFakeTimers();
    const service = new AgentVisionService();
    const capture = vi.fn<() => Promise<{ image: string }>>(async () => ({ image }));
    const action = service.begin("a", "browser", "wait", { target: "tab-a", capture });
    expect(await service.read("a")).toMatchObject({ status: "running", image });
    vi.advanceTimersByTime(6 * 60_000);
    expect(await service.read("a")).toMatchObject({ status: "running", image });
    expect(capture).toHaveBeenCalledTimes(2);
    action.finish();
    service.begin("a", "browser", "navigate", { target: "tab-b" });
    expect(await service.read("a")).toMatchObject({ target: "tab-b", status: "running" });
    expect(await service.read("a")).not.toHaveProperty("image");
  });

  it("rejects an in-flight frame when an action finishes on a different target", async () => {
    vi.useFakeTimers();
    const service = new AgentVisionService();
    const pending = Promise.withResolvers<{ image: string }>();
    const action = service.begin("a", "browser", "navigate", {
      target: "tab-a",
      capture: () => pending.promise,
    });
    const reading = service.read("a");
    action.finish({ target: "tab-b", capture: async () => ({ image }) });
    pending.resolve({ image: "data:image/jpeg;base64,b2xk" });
    expect(await reading).not.toHaveProperty("image");
    vi.advanceTimersByTime(1000);
    expect(await service.read("a")).toMatchObject({ target: "tab-b", status: "idle", image });
  });

  it("contains capture errors and invalid image data, and expires old observations", async () => {
    vi.useFakeTimers();
    const service = new AgentVisionService();
    service.begin("a", "computer", "click").finish({
      capture: async () => {
        throw new Error("window closed");
      },
    });
    expect(await service.read("a")).toMatchObject({ status: "idle" });
    service
      .begin("a", "browser", "click")
      .finish({ capture: async () => ({ image: "https://untrusted.test/image.svg" }) });
    expect(await service.read("a")).not.toHaveProperty("image");
    vi.advanceTimersByTime(5 * 60_000 + 1);
    expect(await service.read("a")).toBeNull();
  });
});
