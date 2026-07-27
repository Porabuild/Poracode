import { describe, expect, it, vi } from "vitest";
import type { SessionRuntime } from "../sessionTypes";

const captureSupervisorException = vi.hoisted(() =>
  vi.fn<(error: unknown, tags?: Record<string, string>) => void>(),
);

vi.mock("../../diagnostics/sentry", () => ({ captureSupervisorException }));

import { StructuredFailureReporter } from "./structuredFailureReporter";

describe("StructuredFailureReporter", () => {
  it("captures one privacy-safe failure per concrete session", () => {
    const reporter = new StructuredFailureReporter();
    const session = {
      agentKind: "codex",
      presentationMode: "gui",
    } as SessionRuntime;

    reporter.capture(session);
    reporter.capture(session);

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
});
