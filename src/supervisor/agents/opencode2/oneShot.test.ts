import { beforeEach, describe, expect, it, vi } from "vitest";
import { runOpenCode2OneShot } from "./oneShot";
import { UnsupportedOneShotControlError } from "../base";

const mocks = vi.hoisted(() => ({
  acquire: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("./client", async (importActual) => ({
  ...(await importActual<typeof import("./client")>()),
  acquireOpenCode2Server: mocks.acquire,
}));

function fixture() {
  const client = {
    plugin: {
      list: vi.fn<() => Promise<object>>().mockResolvedValue({
        data: [{ source: { type: "builtin" }, state: { status: "active" } }],
      }),
    },
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
  selection: { model: "vendor/model", effort: "high" },
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

describe("OpenCode 2 selection carriers", () => {
  it("refuses present unsupported carriers before acquiring the server", async () => {
    const { client } = fixture();
    const thinkingRefusal = await runOpenCode2OneShot({
      ...input,
      selection: { model: "vendor/model", thinking: true },
    }).catch((error: unknown) => error);
    expect(thinkingRefusal).toBeInstanceOf(UnsupportedOneShotControlError);
    expect((thinkingRefusal as UnsupportedOneShotControlError).axes).toEqual(["thinking"]);
    expect(client.session.create).not.toHaveBeenCalled();
    const contextRefusal = await runOpenCode2OneShot({
      ...input,
      selection: { model: "vendor/model", contextSize: "" },
    }).catch((error: unknown) => error);
    expect(contextRefusal).toBeInstanceOf(UnsupportedOneShotControlError);
    expect((contextRefusal as UnsupportedOneShotControlError).axes).toEqual(["contextSize"]);
    expect(client.session.create).not.toHaveBeenCalled();
    expect(mocks.acquire).not.toHaveBeenCalled();
    // Empty/false legacy carriers keep flowing through the model ref mapping.
    await expect(
      runOpenCode2OneShot({
        ...input,
        selection: { model: "vendor/model", effort: "", fast: false },
      }),
    ).resolves.toBe("generated");
  });

  it("refuses meaningful Fast before the server is acquired", async () => {
    const { client } = fixture();
    const refusal = await runOpenCode2OneShot({
      ...input,
      selection: { model: "vendor/model", fast: true },
    }).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(UnsupportedOneShotControlError);
    expect((refusal as UnsupportedOneShotControlError).axes).toEqual(["fast"]);
    expect(mocks.acquire).not.toHaveBeenCalled();
    expect(client.session.create).not.toHaveBeenCalled();
  });
});

describe("OpenCode 2 unresolved utility model", () => {
  it.each(["", "auto", "vendor/"])(
    "refuses effort for %j before SDK acquisition",
    async (model) => {
      const { client } = fixture();
      await expect(
        runOpenCode2OneShot({ ...input, selection: { model, effort: "high" } }),
      ).rejects.toMatchObject({ name: "UnsupportedOneShotControlError", axes: ["effort"] });
      expect(mocks.acquire).not.toHaveBeenCalled();
      expect(client.session.create).not.toHaveBeenCalled();
    },
  );
});
