import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";

const mocks = vi.hoisted(() => ({
  acquireOpenCodeServer: vi.fn<() => Promise<unknown>>(),
}));

vi.mock("./sdkClient", () => ({
  acquireOpenCodeServer: mocks.acquireOpenCodeServer,
}));

import { runOpenCodeOneShot } from "./sdkOneShot";

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
        model: "openai/model",
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
      model: "openai/model",
      prompt: "Generate a title",
    });

    expect(create).toHaveBeenCalledWith({
      title: "poracode one-shot model",
      permission: [{ permission: "*", pattern: "*", action: "deny" }],
    });
  });
});
