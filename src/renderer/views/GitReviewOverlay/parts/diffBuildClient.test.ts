import { afterEach, describe, expect, it, vi } from "vitest";
import type { DiffBuildRequest, DiffBuildResponse } from "@/renderer/workers/diffBuildWorker";

vi.mock("@/renderer/clientRuntime", () => ({
  hasAnyClientBridge: () => true,
  readClientRuntime: () => ({ host: "browser" }),
}));
vi.mock("@/renderer/state/sharedSettingsStore", () => ({ useSharedSettings: () => "dark" }));

const fixture = {
  key: "review",
  oldName: "review.txt",
  newName: "review.txt",
  fileLang: "plaintext",
  diff: "",
};

describe("browser diff builds", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("builds batches in the module worker on a paired browser", async () => {
    const posted = vi.fn<(request: DiffBuildRequest) => void>();
    class BrowserWorker {
      onmessage: ((event: { data: DiffBuildResponse }) => void) | undefined;
      postMessage(request: DiffBuildRequest): void {
        posted(request);
        queueMicrotask(() => {
          this.onmessage?.({ data: { id: request.id, results: [] } });
        });
      }
    }
    vi.stubGlobal("Worker", BrowserWorker);
    const { buildInWorker } = await import("./diffBuildClient");

    const large = { ...fixture, diff: " ".repeat(100_000) };
    await expect(buildInWorker([large, fixture])).resolves.toEqual([]);
    expect(posted).toHaveBeenCalledWith({
      id: 0,
      items: [large, fixture],
      theme: "dark",
      fastTemplates: false,
    });
  });

  it("yields before building a large selected browser file locally", async () => {
    const create = vi.fn<() => void>();
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          create();
        }
      },
    );
    const { buildInWorker } = await import("./diffBuildClient");
    const diff = " ".repeat(100_000);
    const complete = vi.fn<() => void>();
    const result = buildInWorker([{ ...fixture, diff }]);
    void result.then(complete);
    await Promise.resolve();
    expect(complete).not.toHaveBeenCalled();
    await expect(result).resolves.toMatchObject([{ data: { hunks: [diff] } }]);
    expect(create).not.toHaveBeenCalled();
  });

  it("retains the diff data when the browser cannot construct the worker", async () => {
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          throw new Error("Worker unavailable");
        }
      },
    );
    const { buildInWorker } = await import("./diffBuildClient");

    await expect(buildInWorker([fixture, fixture])).resolves.toMatchObject([
      { key: fixture.key, data: { hunks: [""] }, bundle: null },
      { key: fixture.key, data: { hunks: [""] }, bundle: null },
    ]);
  });
});
