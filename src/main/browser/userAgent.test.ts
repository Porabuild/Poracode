import { describe, expect, it } from "vitest";
import { buildBrowserUserAgent } from "./userAgent";

describe("buildBrowserUserAgent", () => {
  it("removes the Electron product token", () => {
    expect(
      buildBrowserUserAgent(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Electron/41.7.0 Safari/537.36",
      ),
    ).toBe(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
    );
  });

  it("keeps the app product token before Chrome (Google rejects a bare Chrome UA from an embedded browser)", () => {
    expect(
      buildBrowserUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Poracode/1.3.2 Chrome/146.0.0.0 Electron/41.7.0 Safari/537.36",
      ),
    ).toBe(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Poracode/1.3.2 Chrome/146.0.0.0 Safari/537.36",
    );
  });

  it("preserves a channel-suffixed app token such as Poracode Nightly", () => {
    expect(
      buildBrowserUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Poracode Nightly/1.3.2 Chrome/146.0.0.0 Electron/41.7.0 Safari/537.36",
      ),
    ).toBe(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Poracode Nightly/1.3.2 Chrome/146.0.0.0 Safari/537.36",
    );
  });
});
