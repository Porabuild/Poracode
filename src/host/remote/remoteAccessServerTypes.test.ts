import { describe, expect, it } from "vitest";
import {
  classifyIngressWorkClass,
  environmentProxyChildWorkClass,
  ingressControlRouteSuffix,
} from "./remoteAccessServerTypes";
import { classifyIngressRequest } from "./remoteAccessServerIngress";
import type { RemoteAccessServerHost } from "./remoteAccessServerTypes";

/**
 * Dedicated classifier tests for the C1 correction: the proxied control
 * class is derived from the INNER child path through the same shared route
 * list as the direct transport classifier, and nothing malformed, nested,
 * encoded, or forwarded can borrow it.
 */

const ordinaryHost = { options: {}, ingressPolicyCache: new WeakMap() } as never;

function classifyPost(url: string, host = "127.0.0.1:4444", headers: Record<string, string> = {}) {
  return classifyIngressRequest(
    ordinaryHost as RemoteAccessServerHost,
    { method: "POST", url, headers: { host, ...headers } } as never,
    "127.0.0.1",
  );
}

function classifyGet(url: string) {
  return classifyIngressRequest(
    ordinaryHost as RemoteAccessServerHost,
    { method: "GET", url, headers: { host: "127.0.0.1:4444" } } as never,
    "127.0.0.1",
  );
}

describe("ingress control route suffix", () => {
  it("matches the direct stop/answer routes only", () => {
    expect(ingressControlRouteSuffix("/api/threads/t1/interrupt")).toBe("/interrupt");
    expect(ingressControlRouteSuffix("/api/threads/t1/close")).toBe("/close");
    expect(ingressControlRouteSuffix("/api/threads/t1/terminal/close")).toBe("/terminal/close");
    expect(ingressControlRouteSuffix("/api/threads/t1/requests/resolve")).toBe("/requests/resolve");
    expect(ingressControlRouteSuffix("/api/threads/t1/send")).toBeNull();
    expect(
      ingressControlRouteSuffix("/api/environments/e/proxy/api/threads/t1/interrupt"),
    ).toBeNull();
  });
});

describe("classifyIngressWorkClass", () => {
  it.each(["interrupt", "close", "terminal/close", "requests/resolve"])(
    "classifies a well-formed proxied %s as control",
    (suffix) => {
      const url = `/api/environments/env-1/proxy/api/threads/t1/${suffix}`;
      expect(classifyIngressWorkClass("POST", url)).toBe("control");
      expect(environmentProxyChildWorkClass("POST", `/api/threads/t1/${suffix}`)).toBe("control");
    },
  );

  it.each([
    "POST /api/environments/env-1/proxy/api/threads/t1/send",
    "POST /api/environments/env-1/proxy/api/environments/env-2/proxy/api/threads/t1/interrupt",
    "POST /api/environments/env-1/proxy/api%2fthreads%2ft1%2finterrupt",
    "POST /api/environments/env-1/proxy/api/%2e%2e/threads/t1/interrupt",
    "POST /api/environments/env-1/foo/../proxy/api/threads/t1/interrupt",
    "GET /api/environments/env-1/proxy/api/threads/t1/interrupt",
  ])("keeps nested/encoded/malformed shape %s bulk", (entry) => {
    const [method, url] = entry.split(" ") as [string, string];
    expect(classifyIngressWorkClass(method, url)).toBe("bulk");
  });

  it("keeps non-control child paths and methods bulk at the gateway seam", () => {
    expect(environmentProxyChildWorkClass("POST", "/api/threads/t1/send")).toBe("bulk");
    expect(environmentProxyChildWorkClass("GET", "/api/threads/t1/interrupt")).toBe("bulk");
  });

  it("keeps the historical direct classification", () => {
    expect(classifyIngressWorkClass("POST", "/api/threads/t1/interrupt")).toBe("control");
    expect(classifyIngressWorkClass("POST", "/api/threads/t1/send")).toBe("bulk");
    expect(classifyIngressWorkClass("GET", "/api/threads/t1/interrupt")).toBe("bulk");
  });
});

describe("classifyIngressRequest forwarded authorities", () => {
  it("forces forwarded child traffic to bulk even on a control-shaped proxy path", () => {
    const path = "/api/environments/env-1/proxy/api/threads/t1/interrupt";
    expect(classifyPost(path).workClass).toBe("control");

    const forwardedHost = "f-000000000000000000000000-00000000000000000000000000000000.example";
    expect(classifyPost(path, forwardedHost).workClass).toBe("bulk");

    expect(
      classifyPost(path, "127.0.0.1:4444", { "x-poracode-forward-id": "not-a-uuid" }).workClass,
    ).toBe("bulk");
  });

  it("keeps a proxied read normal (the environment data plane owns it)", () => {
    expect(classifyGet("/api/environments/env-1/proxy/api/snapshot").readClass).toBe("normal");
  });
});
