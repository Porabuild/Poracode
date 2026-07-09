import { describe, expect, it, vi } from "vitest";
import type { ClientSideConnection } from "@agentclientprotocol/sdk";
import { readUnstableSessionModels, setUnstableSessionModel } from "./unstableModelCompat";

describe("readUnstableSessionModels", () => {
  it("reads the pre-1.0 models field from a session response", () => {
    const result = readUnstableSessionModels({
      sessionId: "s-1",
      models: {
        currentModelId: "grok-4.5[effort=high,fast=true]",
        availableModels: [
          { modelId: "default[]", name: "Auto" },
          { modelId: "grok-4.5[effort=high,fast=true]", name: "grok-4.5", description: "fast" },
        ],
      },
    });

    expect(result).toEqual({
      currentModelId: "grok-4.5[effort=high,fast=true]",
      availableModels: [
        { modelId: "default[]", name: "Auto" },
        { modelId: "grok-4.5[effort=high,fast=true]", name: "grok-4.5", description: "fast" },
      ],
    });
  });

  it("omits currentModelId when the agent does not report one", () => {
    const result = readUnstableSessionModels({
      models: { availableModels: [{ modelId: "m-1", name: "One" }] },
    });

    expect(result).toEqual({ availableModels: [{ modelId: "m-1", name: "One" }] });
    expect(result && "currentModelId" in result).toBe(false);
  });

  it("drops malformed model entries instead of failing", () => {
    const result = readUnstableSessionModels({
      models: {
        availableModels: [{ modelId: "m-1", name: "One" }, { modelId: 42 }, null, "junk"],
      },
    });

    expect(result?.availableModels).toEqual([{ modelId: "m-1", name: "One" }]);
  });

  it("returns undefined for responses without the unstable field", () => {
    expect(readUnstableSessionModels({ sessionId: "s-1" })).toBeUndefined();
    expect(readUnstableSessionModels({ models: {} })).toBeUndefined();
    expect(readUnstableSessionModels({ models: { availableModels: "nope" } })).toBeUndefined();
    expect(readUnstableSessionModels(undefined)).toBeUndefined();
    expect(readUnstableSessionModels(null)).toBeUndefined();
  });
});

describe("setUnstableSessionModel", () => {
  it("sends the removed session/set_model request through the raw escape hatch", async () => {
    const request = vi
      .fn<(method: string, params: { sessionId: string; modelId: string }) => Promise<unknown>>()
      .mockResolvedValue({});
    const connection = { request } as unknown as ClientSideConnection;

    await setUnstableSessionModel(connection, { sessionId: "s-1", modelId: "m-2" });

    expect(request).toHaveBeenCalledWith("session/set_model", {
      sessionId: "s-1",
      modelId: "m-2",
    });
  });
});
