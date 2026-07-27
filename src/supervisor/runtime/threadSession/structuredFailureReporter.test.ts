import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpenCodeReadinessTimeoutError } from "../../agents/opencode/sdkServer";
import type { SessionRuntime } from "../sessionTypes";

const captureSupervisorException = vi.hoisted(() =>
  vi.fn<(error: unknown, tags?: Record<string, string>) => void>(),
);

vi.mock("../../diagnostics/sentry", () => ({ captureSupervisorException }));

import { StructuredFailureReporter } from "./structuredFailureReporter";

function createSession(): SessionRuntime {
  return {
    agentKind: "codex",
    presentationMode: "gui",
  } as SessionRuntime;
}

describe("StructuredFailureReporter", () => {
  beforeEach(() => {
    captureSupervisorException.mockClear();
  });

  it("captures one privacy-safe failure per concrete session", () => {
    const reporter = new StructuredFailureReporter();
    const session = createSession();

    reporter.capture(session, new Error("provider returned an unknown server failure"));
    reporter.capture(session, new Error("a later derivative close failure"));

    expect(captureSupervisorException).toHaveBeenCalledTimes(1);
    expect(captureSupervisorException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Structured runtime session failed." }),
      {
        "poracode.feature_area": "thread-session-lifecycle",
        "poracode.presentation": "gui",
        "poracode.provider": "codex",
        "poracode.runtime_kind": "structured",
      },
    );
  });

  it.each([
    "Quota exhausted",
    "usage limit exceeded",
    "You've reached your usage limit for this billing cycle",
    "You've hit your usage limit",
    "You have reached your quota limit",
    "You’ve hit your quota limit",
    "billing limit reached",
    "billing credits exhausted",
    "request failed: insufficient_quota",
    "RPC error: auth_required",
    "Device authentication failed",
    "User must authenticate before continuing",
  ])("does not capture the expected provider outcome: %s", (message) => {
    const reporter = new StructuredFailureReporter();

    reporter.capture(createSession(), new Error(message));

    expect(captureSupervisorException).not.toHaveBeenCalled();
  });

  it.each([
    "Quota lookup failed",
    "You've reached your usage settings",
    "We've hit a usage service error",
    "Usage service unavailable",
    "Billing configuration is invalid",
    "Authentication service failed",
    "Device authentication request failed",
    "User authentication state is unknown",
    "auth_requiredness parser crashed",
  ])("still captures a near-miss provider failure: %s", (message) => {
    const reporter = new StructuredFailureReporter();

    reporter.capture(createSession(), new Error(message));

    expect(captureSupervisorException).toHaveBeenCalledTimes(1);
  });

  it("recognizes an expected provider outcome through a wrapped cause", () => {
    const reporter = new StructuredFailureReporter();
    const cause = new Error("auth_required");

    reporter.capture(createSession(), new Error("provider request failed", { cause }));

    expect(captureSupervisorException).not.toHaveBeenCalled();
  });

  it("does not consume the one-capture slot for an expected outcome", () => {
    const reporter = new StructuredFailureReporter();
    const session = createSession();

    reporter.capture(session, new Error("usage quota exhausted"));
    expect(captureSupervisorException).not.toHaveBeenCalled();
    reporter.capture(session, new Error("provider response parser failed"));

    expect(captureSupervisorException).toHaveBeenCalledTimes(1);
  });

  it("does not capture a typed OpenCode readiness timeout", () => {
    const reporter = new StructuredFailureReporter();

    reporter.capture(
      createSession(),
      new OpenCodeReadinessTimeoutError("opencode serve: OpenCode server did not respond in time."),
    );

    expect(captureSupervisorException).not.toHaveBeenCalled();
  });

  it("still captures an untyped readiness near-miss", () => {
    const reporter = new StructuredFailureReporter();

    reporter.capture(
      createSession(),
      new Error("opencode serve: OpenCode server did not respond in time."),
    );

    expect(captureSupervisorException).toHaveBeenCalledTimes(1);
  });
});
