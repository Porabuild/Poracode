import { describe, expect, it } from "vitest";
import { generateBackendImagePreview } from "./BackendImagePreview";

describe("generateBackendImagePreview", () => {
  it("decodes and resizes images in BackendHost", async () => {
    const data = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="16"><rect width="32" height="16" fill="red"/></svg>',
    );

    await expect(generateBackendImagePreview({ data, mime: "image/svg+xml" })).resolves.toMatch(
      /^data:image\/jpeg;base64,/,
    );
  });
});
