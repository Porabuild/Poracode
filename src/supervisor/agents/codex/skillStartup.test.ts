import { describe, expect, it, vi } from "vitest";
import { setupCodexStructuredSession as setup } from "./structuredSessionTestHarness";

const skills = (name: string) => ({
  data: [{ skills: [{ name, path: `/skills/${name}/SKILL.md` }] }],
});

describe("Codex skill discovery during startup", () => {
  it("starts the thread and explicit skill turn while the slash catalog is stalled", async () => {
    const discovery = Promise.withResolvers<unknown>();
    const h = setup((method) => {
      if (method === "skills/list") return discovery.promise;
      if (method === "thread/start") return { thread: { id: "provider-thread" } };
      return undefined;
    });

    await h.session.activate();
    await h.session.openThread({ model: "gpt-5.4" });
    await h.session.startTurn("$review check it", { model: "gpt-5.4" }, [
      {
        kind: "skill",
        name: "review",
        path: "/skills/review/SKILL.md",
        invocation: "$review",
        provider: "Codex",
        scope: "global",
      },
    ]);

    expect(h.requests.map(({ method }) => method)).toEqual(
      expect.arrayContaining(["initialize", "skills/list", "thread/start", "turn/start"]),
    );
    expect(h.requests.find(({ method }) => method === "turn/start")?.params).toMatchObject({
      input: expect.arrayContaining([
        { type: "skill", name: "review", path: "/skills/review/SKILL.md" },
      ]),
    });
    discovery.resolve(skills("review"));
    await vi.waitFor(() =>
      expect(h.updates.at(-1)).toMatchObject({
        slashCommands: expect.arrayContaining([expect.objectContaining({ id: "review" })]),
      }),
    );
  });

  it("coalesces skill changes during discovery and suppresses the stale catalog", async () => {
    const first = Promise.withResolvers<unknown>();
    const second = Promise.withResolvers<unknown>();
    let calls = 0;
    const h = setup((method) =>
      method === "skills/list" ? (++calls === 1 ? first.promise : second.promise) : undefined,
    );
    await h.session.activate();
    h.notify("skills/changed", {});
    h.notify("skills/changed", {});
    expect(calls).toBe(1);
    first.resolve(skills("stale"));
    await vi.waitFor(() => expect(calls).toBe(2));
    expect(h.requests.filter(({ method }) => method === "skills/list")[1]?.params).toMatchObject({
      forceReload: true,
    });
    expect(JSON.stringify(h.updates)).not.toContain('"stale"');
    second.resolve(skills("current"));
    await vi.waitFor(() =>
      expect(h.updates.at(-1)).toMatchObject({
        slashCommands: expect.arrayContaining([expect.objectContaining({ id: "current" })]),
      }),
    );
  });

  it("reloads a queued skill change even when the pending discovery fails", async () => {
    const discovery = Promise.withResolvers<unknown>();
    let calls = 0;
    const h = setup((method) =>
      method === "skills/list"
        ? ++calls === 1
          ? discovery.promise
          : skills("recovered")
        : undefined,
    );
    await h.session.activate();
    h.notify("skills/changed", {});
    discovery.reject(new Error("initial catalog failed"));
    await vi.waitFor(() =>
      expect(h.updates.at(-1)).toMatchObject({
        slashCommands: expect.arrayContaining([expect.objectContaining({ id: "recovered" })]),
      }),
    );
    expect(h.requests.filter(({ method }) => method === "skills/list")).toEqual([
      expect.objectContaining({ params: expect.objectContaining({ forceReload: false }) }),
      expect.objectContaining({ params: expect.objectContaining({ forceReload: true }) }),
    ]);
  });

  it("ignores late discovery and change notifications after disposal", async () => {
    const discovery = Promise.withResolvers<unknown>();
    const h = setup((method) => (method === "skills/list" ? discovery.promise : undefined));
    await h.session.activate();
    // Isolate the lifecycle fence from the unrelated provider shutdown RPCs.
    Object.assign(h.session, { isDisposed: true });
    const count = h.updates.length;
    discovery.resolve(skills("late"));
    await discovery.promise;
    await Promise.resolve();
    h.notify("skills/changed", {});
    expect(h.updates).toHaveLength(count);
    expect(h.requests.filter(({ method }) => method === "skills/list")).toHaveLength(1);
  });

  it("keeps activation successful when optional skill discovery fails", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const h = setup((method) =>
        method === "skills/list" ? new Error("catalog unavailable") : undefined,
      );
      await h.session.activate();
      await vi.waitFor(() => expect(warning).toHaveBeenCalled());
    } finally {
      warning.mockRestore();
    }
  });
});
