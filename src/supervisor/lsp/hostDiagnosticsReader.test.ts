import { describe, expect, it, vi } from "vitest";
import { bindHostDiagnosticsReader, type HostDiagnosticsSource } from "./hostDiagnosticsReader";

describe("project-bound diagnostics reader", () => {
  it("does not follow mutated launch arguments or host callback arguments across reads", async () => {
    const location = { kind: "posix" as const, path: "/owned" };
    const paths: string[] = [];
    const source = vi.fn<HostDiagnosticsSource>(async (owner, signal) => {
      expect(signal.aborted).toBe(false);
      if (owner.kind === "posix") {
        paths.push(owner.path);
        owner.path = "/host-mutated";
      }
      return { documents: [], truncated: false };
    });
    const read = bindHostDiagnosticsReader(location, source);
    location.path = "/successor";
    await read(new AbortController().signal);
    await read(new AbortController().signal);
    expect(paths).toEqual(["/owned", "/owned"]);
  });
  it("does not gather after abort or expose a result that completed after owner retirement", async () => {
    const gate = Promise.withResolvers<undefined>();
    const source = vi.fn<HostDiagnosticsSource>(() => gate.promise);
    const read = bindHostDiagnosticsReader({ kind: "posix", path: "/owned" }, source);
    const already = new AbortController();
    already.abort();
    await expect(read(already.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(source).not.toHaveBeenCalled();
    const owner = new AbortController();
    const pending = read(owner.signal);
    owner.abort();
    gate.resolve(undefined);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(source).toHaveBeenCalledOnce();
  });
  it("preserves unavailable independently from a valid empty snapshot", async () => {
    const source = vi
      .fn<HostDiagnosticsSource>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue({ documents: [], truncated: false });
    const read = bindHostDiagnosticsReader({ kind: "posix", path: "/owned" }, source);
    const signal = new AbortController().signal;
    expect(await read(signal)).toBeUndefined();
    expect(await read(signal)).toEqual({ documents: [], truncated: false });
  });
});
