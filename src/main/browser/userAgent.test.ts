import { describe, expect, it } from "vitest";
import { buildChromeLikeUserAgent } from "./userAgent";

describe("buildChromeLikeUserAgent", () => {
  it("removes Electron while preserving the current Chromium user agent", () => {
    expect(
      buildChromeLikeUserAgent(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Electron/41.7.0 Safari/537.36",
      ),
    ).toBe(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    );
  });

  it("removes an app product token before Chrome", () => {
    expect(
      buildChromeLikeUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Lightcode/1.2.1 Chrome/141.0.0.0 Electron/41.7.0 Safari/537.36",
      ),
    ).toBe(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    );
  });

  it("matches the equivalent real Chrome user agent", () => {
    const realChromeLinuxUserAgent =
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

    expect(
      buildChromeLikeUserAgent(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Lightcode/1.2.1 Chrome/141.0.0.0 Electron/41.7.0 Safari/537.36",
      ),
    ).toBe(realChromeLinuxUserAgent);
  });
});
