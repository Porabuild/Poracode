import { describe, expect, it } from "vitest";
import {
  shouldUseLightweightFullscreenPop,
  shouldUseLightweightFullscreenPush,
  shouldUseLightweightSubAgentPop,
  shouldUseLightweightSubAgentPush,
  shouldUseLightweightThreadListPop,
} from "./lightweightThreadListPop";

describe("shouldUseLightweightThreadListPop", () => {
  it("uses the lightweight pop only for an iOS web thread returning to the list", () => {
    expect(
      shouldUseLightweightThreadListPop("/thread/long", "/threads", {
        platform: "ios",
        nativeApp: false,
      }),
    ).toBe(true);
    expect(
      shouldUseLightweightThreadListPop("/thread/long", "/threads", {
        platform: "ios",
        nativeApp: true,
      }),
    ).toBe(false);
    expect(
      shouldUseLightweightThreadListPop("/thread/long", "/threads", {
        platform: "android",
        nativeApp: false,
      }),
    ).toBe(false);
  });

  it("keeps ordinary iOS web navigations on the paired View Transition path", () => {
    const runtime = { platform: "ios", nativeApp: false } as const;
    expect(shouldUseLightweightThreadListPop("/threads", "/thread/long", runtime)).toBe(false);
    expect(shouldUseLightweightThreadListPop("/thread/long", "/workspace/long", runtime)).toBe(
      false,
    );
    expect(shouldUseLightweightThreadListPop("/settings", "/threads", runtime)).toBe(false);
  });
});

describe("shouldUseLightweightSubAgentPush", () => {
  it("uses the lightweight push only for an iOS web thread opening its own subagent", () => {
    const runtime = { platform: "ios", nativeApp: false } as const;
    expect(
      shouldUseLightweightSubAgentPush("/thread/thread-1", "/subagent/thread-1/parent-1", runtime),
    ).toBe(true);
    expect(
      shouldUseLightweightSubAgentPush("/thread/thread-1", "/subagent/thread-2/parent-1", runtime),
    ).toBe(false);
    expect(
      shouldUseLightweightSubAgentPush("/thread/thread-1", "/subagent/thread-1/parent-1", {
        platform: "ios",
        nativeApp: true,
      }),
    ).toBe(false);
  });
});

describe("shouldUseLightweightSubAgentPop", () => {
  it("uses the lightweight pop only when an iOS web subagent returns to its parent", () => {
    const runtime = { platform: "ios", nativeApp: false } as const;
    expect(
      shouldUseLightweightSubAgentPop("/subagent/thread-1/parent-1", "/thread/thread-1", runtime),
    ).toBe(true);
    expect(
      shouldUseLightweightSubAgentPop("/subagent/thread-1/parent-1", "/thread/thread-2", runtime),
    ).toBe(false);
    expect(
      shouldUseLightweightSubAgentPop("/subagent/thread-1/parent-1", "/thread/thread-1", {
        platform: "android",
        nativeApp: false,
      }),
    ).toBe(false);
  });
});

describe("shouldUseLightweightFullscreenPush", () => {
  it("uses the lightweight push only for an iOS web page opening a fullscreen screen", () => {
    const runtime = { platform: "ios", nativeApp: false } as const;
    expect(
      shouldUseLightweightFullscreenPush("/thread/thread-1", "/workspace/thread-1", runtime),
    ).toBe(true);
    expect(shouldUseLightweightFullscreenPush("/threads", "/terminal/project-1", runtime)).toBe(
      true,
    );
    expect(shouldUseLightweightFullscreenPush("/thread/thread-1", "/notes/thread-1", runtime)).toBe(
      true,
    );
  });

  it("keeps fullscreen-to-fullscreen and ordinary navigations on the View Transition path", () => {
    const runtime = { platform: "ios", nativeApp: false } as const;
    // Two overlays have nothing mounted beneath them, so the slide stays a VT.
    expect(shouldUseLightweightFullscreenPush("/workspace/thread-1", "/pr/123", runtime)).toBe(
      false,
    );
    expect(shouldUseLightweightFullscreenPush("/thread/thread-1", "/threads", runtime)).toBe(false);
    expect(shouldUseLightweightFullscreenPush(undefined, "/workspace/thread-1", runtime)).toBe(
      false,
    );
  });

  it("stays off outside iOS web", () => {
    expect(
      shouldUseLightweightFullscreenPush("/thread/thread-1", "/workspace/thread-1", {
        platform: "ios",
        nativeApp: true,
      }),
    ).toBe(false);
    expect(
      shouldUseLightweightFullscreenPush("/thread/thread-1", "/workspace/thread-1", {
        platform: "android",
        nativeApp: false,
      }),
    ).toBe(false);
  });
});

describe("shouldUseLightweightFullscreenPop", () => {
  it("uses the lightweight pop only for an iOS web fullscreen screen closing to a page", () => {
    const runtime = { platform: "ios", nativeApp: false } as const;
    expect(
      shouldUseLightweightFullscreenPop("/workspace/thread-1", "/thread/thread-1", runtime),
    ).toBe(true);
    expect(shouldUseLightweightFullscreenPop("/terminal/project-1", "/threads", runtime)).toBe(
      true,
    );
    expect(shouldUseLightweightFullscreenPop("/notes/thread-1", "/thread/thread-1", runtime)).toBe(
      true,
    );
  });

  it("keeps fullscreen-to-fullscreen and ordinary navigations on the View Transition path", () => {
    const runtime = { platform: "ios", nativeApp: false } as const;
    expect(shouldUseLightweightFullscreenPop("/pr/123", "/workspace/thread-1", runtime)).toBe(
      false,
    );
    expect(shouldUseLightweightFullscreenPop("/thread/thread-1", "/threads", runtime)).toBe(false);
    expect(shouldUseLightweightFullscreenPop(undefined, "/thread/thread-1", runtime)).toBe(false);
  });

  it("stays off outside iOS web", () => {
    expect(
      shouldUseLightweightFullscreenPop("/workspace/thread-1", "/thread/thread-1", {
        platform: "android",
        nativeApp: false,
      }),
    ).toBe(false);
  });
});
