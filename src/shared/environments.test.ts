import { describe, expect, it } from "vitest";
import { isEnvironmentProxyRequestPath, matchEnvironmentProxyPath } from "./environments";

/**
 * Raw-path guard tests for the environment data plane (review F3): the
 * matcher runs on the RAW target and fails closed on traversal, encoded
 * separators, literal and percent-encoded control bytes at one or two
 * encoding layers, and malformed shapes — before any dial and without
 * decoding separators or recursing.
 */

describe("matchEnvironmentProxyPath", () => {
  it("matches the prefix and preserves the raw child path and query", () => {
    expect(
      matchEnvironmentProxyPath("/api/environments/env-1/proxy/api/snapshot?x=1&y=%20"),
    ).toEqual({
      kind: "match",
      environmentId: "env-1",
      rawChildPath: "/api/snapshot",
      rawQuery: "x=1&y=%20",
    });
    expect(matchEnvironmentProxyPath("/api/environments/env-1/proxy")).toEqual({
      kind: "match",
      environmentId: "env-1",
      rawChildPath: "/",
      rawQuery: "",
    });
    expect(matchEnvironmentProxyPath("/api/environments/env-1/proxy/ws")).toEqual({
      kind: "match",
      environmentId: "env-1",
      rawChildPath: "/ws",
      rawQuery: "",
    });
    // A nested proxy shape is a valid match; classification unwraps once.
    const nested = matchEnvironmentProxyPath(
      "/api/environments/env-1/proxy/api/environments/env-2/proxy/api/threads/t1/interrupt",
    );
    expect(nested?.kind).toBe("match");
  });

  it.each([
    "/api/snapshot",
    "/api/environments",
    "/api/environments/env-1",
    "/api/environments/env-1/list",
    "/api/environments/env-1/proxyfoo/api/snapshot",
  ])("leaves ordinary route %s to the registry", (path) => {
    expect(matchEnvironmentProxyPath(path)).toBeNull();
    expect(isEnvironmentProxyRequestPath(path)).toBe(false);
  });

  it.each([
    "/api/environments/env-1/proxy/../secrets",
    "/api/environments/env-1/proxy/%2e%2e/secrets",
    "/api/environments/env-1/proxy/%2E%2E/secrets",
    "/api/environments/env-1/proxy/..%5csecrets",
    "/api/environments/env-1/proxy//evil.example/x",
    "/api/environments/env-1/proxy/%2f%2fevil.example/x",
    "/api/environments/env-1/proxy/a/%2f/b",
    "/api/environments/env%2e1/proxy/api/snapshot",
    "/api/environments/env-1/../proxy/api/snapshot",
  ])("fails traversal/separator/dot/bad-id path %s closed", (path) => {
    expect(matchEnvironmentProxyPath(path)).toEqual({
      kind: "invalid",
      reason: expect.any(String),
    });
    expect(isEnvironmentProxyRequestPath(path)).toBe(true);
  });

  it("leaves an absolute-form target to ordinary routing", () => {
    // The reserved-header rule owns the fail-closed case for absolute forms.
    expect(
      matchEnvironmentProxyPath("http://evil.example/api/environments/env-1/proxy/api/snapshot"),
    ).toBeNull();
  });

  it.each([
    ["literal NUL", "/api/environments/env-1/proxy/api/\u0000secret"],
    ["encoded NUL", "/api/environments/env-1/proxy/api/%00secret"],
    ["encoded CRLF", "/api/environments/env-1/proxy/api/%0d%0aX-Injected"],
    ["encoded tab", "/api/environments/env-1/proxy/api/%09tab"],
    ["encoded US", "/api/environments/env-1/proxy/api/%1f"],
    ["encoded DEL", "/api/environments/env-1/proxy/api/%7fdel"],
    ["double-encoded NUL", "/api/environments/env-1/proxy/api/%2500double"],
    ["double-encoded CRLF", "/api/environments/env-1/proxy/api/%250d%250a"],
    ["double-encoded DEL", "/api/environments/env-1/proxy/api/%257f"],
  ])("rejects control-byte path (%s)", (_label, path) => {
    expect(matchEnvironmentProxyPath(path)).toEqual({
      kind: "invalid",
      reason: "traversal",
    });
  });

  it("keeps a percent escape that is not a control byte as legal child data", () => {
    expect(matchEnvironmentProxyPath("/api/environments/env-1/proxy/api/100%25done")).toMatchObject(
      {
        kind: "match",
      },
    );
  });
});
