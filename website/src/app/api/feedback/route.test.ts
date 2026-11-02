import { NextRequest } from "next/server";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  start: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  limit: vi.fn<(...args: unknown[]) => Promise<void>>(),
}));
vi.mock("../../../lib/feedback", () => ({
  configured: () => true,
  FeedbackError: class extends Error {},
  startFeedback: mocks.start,
  limitFeedbackRequests: mocks.limit,
  completeFeedback: vi.fn<() => Promise<void>>(),
  resumeFeedback: vi.fn<() => Promise<void>>(),
  feedbackStatus: vi.fn<() => Promise<void>>(),
}));
import { GET, OPTIONS, POST } from "./route";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it("supports credentialless native clients and still rate-limits their form requests", async () => {
  const preflight = await OPTIONS();
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
  expect(preflight.headers.get("access-control-allow-credentials")).toBeNull();
  const config = await GET(new NextRequest("https://poracode.com/api/feedback"));
  expect(config.headers.get("access-control-allow-origin")).toBe("*");
  expect(await config.json()).toEqual({ enabled: true });
  mocks.start.mockResolvedValue({ receipt: "receipt", grants: [] });
  const request = new NextRequest("https://poracode.com/api/feedback", {
    method: "POST",
    headers: {
      origin: "null",
      "content-type": "application/json",
      "x-vercel-forwarded-for": "192.0.2.1",
    },
    body: JSON.stringify({ version: 1, title: "Native feedback" }),
  });
  const response = await POST(request);
  expect(response.status).toBe(200);
  expect(mocks.limit).toHaveBeenCalledWith("192.0.2.1");
  expect(mocks.start).toHaveBeenCalledWith({ version: 1, title: "Native feedback" }, "192.0.2.1");
});
