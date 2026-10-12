import { describe, expect, it } from "vitest";
import { classifyUpdateFailure } from "./updateErrorPolicy";

describe("classifyUpdateFailure HTTP responses", () => {
  it.each([408, 429, 500, 502, 503, 504])("retries HTTP %i service failures", (statusCode) => {
    const error = Object.assign(new Error("Update service request failed."), { statusCode });

    expect(classifyUpdateFailure(error, "check", "nightly")).toEqual({
      kind: "transient-network",
      retryable: true,
    });
    expect(classifyUpdateFailure(error, "download", "stable")).toEqual({
      kind: "transient-network",
      retryable: true,
    });
  });

  it("recognizes the HTTP status on a wrapped request failure", () => {
    const cause = Object.assign(new Error("Gateway timeout."), { statusCode: 504 });
    const error = new Error("Update request failed.", { cause });

    expect(classifyUpdateFailure(error, "check", "nightly")).toEqual({
      kind: "transient-network",
      retryable: true,
    });
  });

  it.each([400, 401, 403, 404, 501, 505])(
    "does not retry a permanent HTTP %i refusal",
    (statusCode) => {
      const error = Object.assign(new Error("Update request refused."), { statusCode });

      expect(classifyUpdateFailure(error, "check", "nightly")).toEqual({
        kind: "unexpected",
        retryable: false,
      });
    },
  );
});
