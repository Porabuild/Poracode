import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateStructuredSessionInput } from "../../base";

const readFile = vi.hoisted(() =>
  vi.fn<(path: string) => Promise<Buffer>>().mockResolvedValue(Buffer.from("image bytes")),
);

vi.mock("node:fs/promises", () => ({ readFile }));

import { buildMuseTurnInput } from "./turnInput";

const input = {
  threadId: "thread-1",
  projectLocation: {
    kind: "wsl",
    distro: "Ubuntu",
    linuxPath: "/mnt/c/project",
    uncPath: "\\\\wsl.localhost\\Ubuntu\\mnt\\c\\project",
  },
  config: { model: "muse-spark-1.3" },
  presentationMode: "gui",
} satisfies CreateStructuredSessionInput;

describe("Muse MSP turn input", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads WSL images through UNC and emits the MSP image shape", async () => {
    await expect(
      buildMuseTurnInput(
        input,
        "Inspect this",
        [
          {
            kind: "attachment",
            path: "/mnt/c/project/image.png",
            mimeType: "image/png",
          },
        ],
        "Follow the project instructions.",
      ),
    ).resolves.toEqual([
      { type: "text", text: "Inspect this\n\nFollow the project instructions." },
      { type: "image", mediaType: "image/png", base64Data: "aW1hZ2UgYnl0ZXM=" },
    ]);
    expect(readFile).toHaveBeenCalledWith("\\\\wsl.localhost\\Ubuntu\\mnt\\c\\project\\image.png");
  });

  it("ignores non-image attachments", async () => {
    await expect(
      buildMuseTurnInput(
        input,
        "Read this",
        [
          {
            kind: "attachment",
            path: "/mnt/c/project/notes.txt",
            mimeType: "text/plain",
          },
        ],
        undefined,
      ),
    ).resolves.toEqual([{ type: "text", text: "Read this" }]);
    expect(readFile).not.toHaveBeenCalled();
  });
});
