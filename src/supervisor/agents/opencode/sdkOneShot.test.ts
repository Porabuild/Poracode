import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";

const mocks = vi.hoisted(() => ({
  acquireOpenCodeServer: vi.fn<() => Promise<unknown>>(),
}));

vi.mock("./sdkClient", () => ({
  acquireOpenCodeServer: mocks.acquireOpenCodeServer,
}));

import { runOpenCodeOneShot } from "./sdkOneShot";
import { UnsupportedOneShotControlError } from "../base";

const location: ProjectLocation = { kind: "windows", path: "C:\\judge" };

describe("runOpenCodeOneShot", () => {
  const create = vi.fn<(input: unknown) => Promise<{ data: { id: string } }>>();
  const prompt = vi.fn<(input: unknown) => Promise<unknown>>();
  const abort = vi.fn<(input: unknown) => Promise<void>>();
  const dispose = vi.fn<() => Promise<void>>();

  beforeEach(() => {
    vi.clearAllMocks();
    create.mockResolvedValue({ data: { id: "session-1" } });
    prompt.mockResolvedValue({
      data: { info: {}, parts: [{ type: "text", text: "judgement" }] },
    });
    abort.mockResolvedValue(undefined);
    dispose.mockResolvedValue(undefined);
    mocks.acquireOpenCodeServer.mockResolvedValue({
      client: { session: { create, prompt, abort } },
      dispose,
    });
  });

  it("allows only read/search/list tools for an isolated judge workspace", async () => {
    await expect(
      runOpenCodeOneShot({
        location,
        selection: { model: "openai/model" },
        prompt: "Judge the anonymous files",
        readOnlyWorkspace: true,
      }),
    ).resolves.toBe("judgement");

    expect(create).toHaveBeenCalledWith({
      title: "poracode one-shot model",
      permission: [
        { permission: "*", pattern: "*", action: "deny" },
        { permission: "read", pattern: "*", action: "allow" },
        { permission: "list", pattern: "*", action: "allow" },
        { permission: "glob", pattern: "*", action: "allow" },
        { permission: "grep", pattern: "*", action: "allow" },
      ],
    });
  });

  it("keeps ordinary one-shot generation deny-all", async () => {
    await runOpenCodeOneShot({
      location,
      selection: { model: "openai/model" },
      prompt: "Generate a title",
    });

    expect(create).toHaveBeenCalledWith({
      title: "poracode one-shot model",
      permission: [{ permission: "*", pattern: "*", action: "deny" }],
    });
  });

  it.each(["<｜DSML｜tool_calls>", "< | | DSML | | tool_calls>"])(
    "rejects a leaked DeepSeek tool-call marker: %s",
    async (marker) => {
      prompt.mockResolvedValue({
        data: { info: {}, parts: [{ type: "text", text: marker }] },
      });

      await expect(
        runOpenCodeOneShot({
          location,
          selection: { model: "opencode-go/deepseek-v4-flash" },
          prompt: "Generate a title",
        }),
      ).rejects.toThrow("OpenCode returned a provider tool-call marker instead of text.");
      expect(dispose).toHaveBeenCalledOnce();
    },
  );
});

describe("runOpenCodeOneShot selection carriers", () => {
  const create = vi.fn<(input: unknown) => Promise<{ data: { id: string } }>>();
  const prompt = vi.fn<(input: unknown) => Promise<unknown>>();
  const dispose = vi.fn<() => Promise<void>>();

  beforeEach(() => {
    vi.clearAllMocks();
    create.mockResolvedValue({ data: { id: "session-1" } });
    prompt.mockResolvedValue({
      data: { info: {}, parts: [{ type: "text", text: "reply" }] },
    });
    dispose.mockResolvedValue(undefined);
    mocks.acquireOpenCodeServer.mockResolvedValue({
      client: { session: { create, prompt, abort: vi.fn<() => Promise<void>>() } },
      dispose,
    });
  });

  it("maps a nonempty effort onto the session variant and refuses present unsupported carriers", async () => {
    await runOpenCodeOneShot({
      location,
      selection: { model: "openai/model", effort: "high" },
      prompt: "Generate a title",
    });
    expect(prompt).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { providerID: "openai", modelID: "model" },
        variant: "high",
      }),
    );

    // A present thinking carrier has no SDK mapping in this lane: it refuses
    // before the server is acquired instead of being silently dropped.
    const thinkingRefusal = await runOpenCodeOneShot({
      location,
      selection: { model: "openai/model", thinking: false },
      prompt: "Generate a title",
    }).catch((error: unknown) => error);
    expect(thinkingRefusal).toBeInstanceOf(UnsupportedOneShotControlError);
    expect((thinkingRefusal as UnsupportedOneShotControlError).axes).toEqual(["thinking"]);
    expect(mocks.acquireOpenCodeServer).toHaveBeenCalledTimes(1);

    const contextRefusal = await runOpenCodeOneShot({
      location,
      selection: { model: "openai/model", contextSize: "default" },
      prompt: "Generate a title",
    }).catch((error: unknown) => error);
    expect(contextRefusal).toBeInstanceOf(UnsupportedOneShotControlError);
    expect((contextRefusal as UnsupportedOneShotControlError).axes).toEqual(["contextSize"]);
    expect(mocks.acquireOpenCodeServer).toHaveBeenCalledTimes(1);
  });

  it("refuses meaningful Fast before the server is acquired and keeps false Fast inert", async () => {
    // fast:true has no SDK mapping in this lane: it refuses deterministically
    // before any effect instead of dropping the control after acquisition.
    const refusal = await runOpenCodeOneShot({
      location,
      selection: { model: "openai/model", fast: true },
      prompt: "Generate a title",
    }).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(UnsupportedOneShotControlError);
    expect((refusal as UnsupportedOneShotControlError).axes).toEqual(["fast"]);
    expect(mocks.acquireOpenCodeServer).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();

    // false Fast is the legacy default carrier: it keeps flowing through the
    // mapped effort path unchanged.
    await expect(
      runOpenCodeOneShot({
        location,
        selection: { model: "openai/model", effort: "", fast: false },
        prompt: "Generate a title",
      }),
    ).resolves.toBe("reply");
  });
});
