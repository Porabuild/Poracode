import { describe, expect, it } from "vitest";
import type { ThreadStatus } from "./contracts";
import { buildThreadRelaunchStartInput, shouldRelaunchThreadOnOpen } from "./threadRelaunch";

describe("shouldRelaunchThreadOnOpen", () => {
  it("relaunches only inactive threads", () => {
    const cases: Array<[ThreadStatus, boolean]> = [
      ["inactive", true],
      ["launching", false],
      ["idle", false],
      ["working", false],
      ["finished", false],
      ["error", false],
    ];
    for (const [status, expected] of cases) {
      expect(shouldRelaunchThreadOnOpen({ status })).toBe(expected);
    }
  });
});

describe("buildThreadRelaunchStartInput", () => {
  const projectLocation = { kind: "posix", path: "/repo" } as const;
  const initialSize = { cols: 120, rows: 30 };

  it("builds the empty-prompt relaunch payload with optional fields passed through", () => {
    expect(
      buildThreadRelaunchStartInput({
        thread: {
          id: "t1",
          agentKind: "codex",
          agentInstanceId: "inst-9",
          config: { model: "m" },
          sessionRef: { providerSessionId: "sess-1", discoveredAt: "2026-01-01T00:00:00.000Z" },
          presentationMode: "gui",
        },
        projectLocation,
        initialSize,
      }),
    ).toEqual({
      threadId: "t1",
      projectLocation: { kind: "posix", path: "/repo" },
      agentKind: "codex",
      agentInstanceId: "inst-9",
      config: { model: "m" },
      prompt: "",
      initialSize: { cols: 120, rows: 30 },
      sessionRef: { providerSessionId: "sess-1", discoveredAt: "2026-01-01T00:00:00.000Z" },
      presentationMode: "gui",
    });
  });

  it("omits optional fields the thread does not carry", () => {
    const input = buildThreadRelaunchStartInput({
      thread: {
        id: "t2",
        agentKind: "claude",
        config: { model: "m" },
      },
      projectLocation,
      initialSize,
    });
    expect(input).toEqual({
      threadId: "t2",
      projectLocation: { kind: "posix", path: "/repo" },
      agentKind: "claude",
      config: { model: "m" },
      prompt: "",
      initialSize: { cols: 120, rows: 30 },
    });
    expect("agentInstanceId" in input).toBe(false);
    expect("sessionRef" in input).toBe(false);
    expect("presentationMode" in input).toBe(false);
  });
});
