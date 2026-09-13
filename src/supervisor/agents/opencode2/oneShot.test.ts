import { beforeEach, describe, expect, it, vi } from "vitest";
import { runOpenCode2OneShot } from "./oneShot";

const mocks = vi.hoisted(() => ({
  acquire: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("./client", async (importActual) => ({
  ...(await importActual<typeof import("./client")>()),
  acquireOpenCode2Server: mocks.acquire,
}));

function fixture() {
  const client = {
    plugin: { awaitActivation: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) },
    session: {
      create: vi.fn<() => Promise<{ id: string }>>().mockResolvedValue({ id: "temporary" }),
      switchModel: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      generate: vi.fn<() => Promise<{ text: string }>>().mockResolvedValue({ text: "generated" }),
      remove: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    },
  };
  const dispose = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  mocks.acquire.mockResolvedValue({ client, dispose });
  return { client, dispose };
}
const input = {
  location: { kind: "posix" as const, path: "/repo" },
  model: "vendor/model",
  effort: "high",
  prompt: "Summarize",
};
beforeEach(() => mocks.acquire.mockReset());

describe("OpenCode 2 native utility generation", () => {
  it("uses the project model without a tool loop and removes its temporary session", async () => {
    const { client, dispose } = fixture();
    await expect(runOpenCode2OneShot(input)).resolves.toBe("generated");
    expect(client.session.create).toHaveBeenCalledWith(
      { location: { directory: "/repo" } },
      expect.any(Object),
    );
    expect(client.session.switchModel).toHaveBeenCalledWith(
      { sessionID: "temporary", model: { providerID: "vendor", id: "model", variant: "high" } },
      expect.any(Object),
    );
    expect(client.session.generate).toHaveBeenCalledWith(
      { sessionID: "temporary", prompt: "Summarize" },
      expect.any(Object),
    );
    expect(client.session.remove).toHaveBeenCalledWith(
      { sessionID: "temporary" },
      expect.any(Object),
    );
    expect(dispose).toHaveBeenCalledWith({ closeServerIfIdle: true });
  });

  it("cleans up after generation failure and rejects pre-cancelled calls before spawning", async () => {
    const { client, dispose } = fixture();
    client.session.generate.mockRejectedValueOnce(new Error("generation failed"));
    await expect(runOpenCode2OneShot(input)).rejects.toThrow("generation failed");
    expect(client.session.remove).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
    await expect(
      runOpenCode2OneShot({ ...input, signal: AbortSignal.abort(new Error("cancelled")) }),
    ).rejects.toThrow("cancelled");
    expect(mocks.acquire).toHaveBeenCalledTimes(1);
  });
});
