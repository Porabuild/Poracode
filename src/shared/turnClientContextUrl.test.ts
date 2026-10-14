import { describe, expect, it } from "vitest";
import { normalizeTurnClientContextUrl } from "./turnClientContextUrl";

describe("normalizeTurnClientContextUrl", () => {
  it.each([
    ["http://EXAMPLE.test:80", "http://example.test", "http://example.test/"],
    [
      "https://u:p@app.test:8443/cb?code=c#access_token=t",
      "https://app.test:8443",
      "https://app.test:8443/cb",
    ],
    [
      "https://例え.test/ café/%2F?q=secret#fragment",
      "https://xn--r8jz45g.test",
      "https://xn--r8jz45g.test/%20caf%C3%A9/%2F",
    ],
    ["https://app.test/a/../b?q=x", "https://app.test", "https://app.test/b"],
    ["http://[::1]:8080/a%0Ab", "http://[::1]:8080", "http://[::1]:8080/a%0Ab"],
  ])("keeps only web page identity for %s", (input, origin, pageUrl) => {
    expect(normalizeTurnClientContextUrl(input)).toEqual({ origin, pageUrl });
  });

  it.each([
    "",
    "not a url",
    "/relative",
    "https://",
    "https://[bad]/",
    "file:///private/a",
    "javascript:alert(1)",
    "data:text/plain,secret",
    "chrome://settings",
    "ftp://example.test/a",
  ])("rejects malformed or non-web URL %s", (input) =>
    expect(normalizeTurnClientContextUrl(input)).toBeUndefined(),
  );
});
