import { NextRequest } from "next/server";
import { JSDOM } from "jsdom";
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
import { GET as verification } from "../../(default)/feedback/verify/route";
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

it("limits verifier ancestry and only releases tokens after a trusted parent handshake", async () => {
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "test-site-key");
  const response = await verification();
  expect(response.headers.get("content-security-policy")).toContain(
    "frame-ancestors 'self' file: http://localhost:* http://127.0.0.1:* https://poracode.com",
  );
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  const dom = new JSDOM(await response.text(), {
    url: "https://poracode.com/feedback/verify",
    runScripts: "dangerously",
  });
  try {
    const render = vi.fn<(...args: unknown[]) => string>(() => "widget");
    const remove = vi.fn<(id: string) => void>();
    Object.assign(dom.window, { turnstile: { render, remove } });
    const send = (origin: string, source: Window | null) =>
      dom.window.dispatchEvent(
        new dom.window.MessageEvent("message", {
          origin,
          source,
          data: { type: "poracode.feedback.verify" },
        }),
      );
    send("https://evil.test", dom.window as unknown as Window);
    send("http://localhost:3100", null);
    expect(render).not.toHaveBeenCalled();
    send("http://localhost:3100", dom.window as unknown as Window);
    expect(render).toHaveBeenCalledExactlyOnceWith(
      "#challenge",
      expect.objectContaining({ sitekey: "test-site-key", action: "feedback", size: "normal" }),
    );
    Object.defineProperty(dom.window, "innerWidth", { value: 280, configurable: true });
    dom.window.dispatchEvent(new dom.window.Event("resize"));
    expect(remove).toHaveBeenCalledWith("widget");
    expect(render).toHaveBeenLastCalledWith(
      "#challenge",
      expect.objectContaining({ size: "compact" }),
    );
  } finally {
    dom.window.close();
  }
});
