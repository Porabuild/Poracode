import { describe, expect, it, vi } from "vitest";
import { invokeSessionAction, listSessionActions, type SessionActionOwner } from "./sessionActions";

const payload = { threadId: "thread-1", actionId: "fixture.inspect", payload: { name: "fixture" } };

describe("active session action ownership", () => {
  it("lists declared GUI actions and hides terminal helper sessions", () => {
    const structuredSession = { listSessionActions: () => [{ id: "fixture.inspect" }] };
    expect(listSessionActions({ presentationMode: "gui", structuredSession })).toEqual({
      actions: [{ id: "fixture.inspect" }],
    });
    expect(listSessionActions({ presentationMode: "terminal", structuredSession })).toEqual({
      actions: [],
    });
    expect(listSessionActions(undefined)).toEqual({ actions: [] });
  });

  it("passes only a declared id and bounded payload to the active runtime", async () => {
    const invoke = vi.fn<(id: string, value: unknown) => Promise<Record<string, unknown>>>(
      async () => ({ inspected: true }),
    );
    const session: SessionActionOwner = {
      presentationMode: "gui",
      structuredSession: { invokeSessionAction: invoke },
    };
    await expect(invokeSessionAction(() => session, payload)).resolves.toEqual({ inspected: true });
    expect(invoke).toHaveBeenCalledExactlyOnceWith("fixture.inspect", { name: "fixture" });
    await expect(
      invokeSessionAction(() => ({ ...session, presentationMode: "terminal" }), payload),
    ).rejects.toThrow("Session actions are unavailable");
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("rejects late results when the thread runtime is replaced", async () => {
    let session: SessionActionOwner | undefined = {
      presentationMode: "gui",
      structuredSession: {
        invokeSessionAction: async () => {
          session = undefined;
          return { stale: true };
        },
      },
    };
    await expect(invokeSessionAction(() => session, payload)).rejects.toThrow(
      "Session actions are unavailable",
    );
  });

  it("rejects a runtime result that cannot cross the JSON boundary", async () => {
    const session: SessionActionOwner = {
      presentationMode: "gui",
      structuredSession: { invokeSessionAction: async () => ({ secret: undefined }) },
    };
    await expect(invokeSessionAction(() => session, payload)).rejects.toThrow(
      "Session action data exceeds JSON bounds",
    );
  });
});
