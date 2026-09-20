import { describe, expect, it } from "vitest";
import { REMOTE_VIEWER_SCOPES } from "../protocol";
import { REMOTE_HTTP_ROUTES } from "./routes";

describe("HTTP route audit attributes (V6 A.9)", () => {
  it("requires every registry route to declare an audit attribute", () => {
    expect(REMOTE_HTTP_ROUTES.length).toBeGreaterThan(0);
    for (const route of REMOTE_HTTP_ROUTES) {
      const justified =
        route.audit.kind !== false || (route.audit.kind === false && route.audit.reason.length > 0);
      expect({ id: route.id, justified }).toEqual({ id: route.id, justified: true });
    }
  });

  it("audits every mutating bearer route", () => {
    const unaudited = REMOTE_HTTP_ROUTES.filter(
      (route) =>
        route.method !== "GET" &&
        route.auth === "bearer" &&
        route.scopes.some((scope) => !REMOTE_VIEWER_SCOPES.includes(scope)) &&
        route.audit.kind === false,
    );
    expect(unaudited.map((route) => route.id)).toEqual([]);
  });
});
