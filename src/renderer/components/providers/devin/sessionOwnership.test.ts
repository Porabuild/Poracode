// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Thread } from "@/shared/contracts";
import { sessionOwnershipTag } from "./sessionOwnership";

function thread(overrides: Partial<Thread> = {}): Thread {
  return { id: "thread-1", status: "idle", agentKind: "devin", ...overrides } as Thread;
}

describe("sessionOwnershipTag", () => {
  const tag = (t: Thread, mode: "gui" | "terminal" = "gui") => sessionOwnershipTag(t, mode);

  it("is stable for the same session identity", () => {
    const base = thread({
      sessionRef: { providerSessionId: "sess-1", discoveredAt: "2026-10-07T00:00:00Z" },
    });
    expect(tag(base)).toBe(tag({ ...base }));
    // working→idle is the same live session: status must not participate.
    expect(tag(base)).toBe(tag({ ...base, status: "working" }));
  });

  it("changes with every field that identifies the session", () => {
    const base = thread({
      remoteServerId: "srv-1",
      remoteId: "r-1",
      sessionRef: {
        providerSessionId: "sess-1",
        discoveredAt: "2026-10-07T00:00:00Z",
        executionIdentity: "acct-1",
      },
    });
    expect(tag(base)).not.toBe(tag({ ...base, id: "thread-2" }));
    expect(tag(base)).not.toBe(tag({ ...base, agentKind: "devin:other" }));
    expect(tag(base)).not.toBe(tag({ ...base, remoteServerId: "srv-2" }));
    expect(tag(base)).not.toBe(tag({ ...base, remoteId: "r-2" }));
    expect(tag(base)).not.toBe(
      tag({
        ...base,
        sessionRef: { ...base.sessionRef!, providerSessionId: "sess-2" },
      }),
    );
    expect(tag(base)).not.toBe(
      tag({
        ...base,
        sessionRef: { ...base.sessionRef!, executionIdentity: "acct-2" },
      }),
    );
    expect(tag(base)).not.toBe(tag({ ...base, sessionRef: undefined }));
    expect(tag(base, "gui")).not.toBe(tag(base, "terminal"));
  });

  it("treats absent and present optional fields distinctly", () => {
    expect(tag(thread())).not.toBe(
      tag(
        thread({
          sessionRef: { providerSessionId: "sess-1", discoveredAt: "2026-10-07T00:00:00Z" },
        }),
      ),
    );
  });
});
