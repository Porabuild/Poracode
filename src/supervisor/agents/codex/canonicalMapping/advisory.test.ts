import { describe, expect, it } from "vitest";
import { msg } from "@/shared/messages";
import { createCodexMapperState, mapCodexNotification } from "../canonicalMapping";
import { setupCodexStructuredSession } from "../structuredSessionTestHarness";

function map(method: string, params: Record<string, unknown>) {
  return mapCodexNotification(method, params, createCodexMapperState("local-thread"));
}

describe("Codex advisory notifications", () => {
  it("maps each advisory kind to a canonical warning, noticing all but generic warnings", () => {
    expect(map("warning", { threadId: null, message: "Skills were shortened." })).toEqual([
      { type: "warning", threadId: "local-thread", message: "Skills were shortened." },
    ]);
    expect(
      map("configWarning", {
        summary: "Unknown key `foo`",
        details: "Remove it from config.toml.",
        path: "/home/me/.codex/config.toml",
      }),
    ).toEqual([
      {
        type: "warning",
        threadId: "local-thread",
        message: "Unknown key `foo`\n\nRemove it from config.toml.\n\n/home/me/.codex/config.toml",
        presentation: "notice",
      },
    ]);
    expect(map("deprecationNotice", { summary: "Old flag", details: null })).toEqual([
      { type: "warning", threadId: "local-thread", message: "Old flag", presentation: "notice" },
    ]);
    expect(map("guardianWarning", { threadId: "provider-thread", message: "Risky." })).toEqual([
      { type: "warning", threadId: "local-thread", message: "Risky.", presentation: "notice" },
    ]);
    expect(
      map("model/rerouted", {
        threadId: "provider-thread",
        turnId: "turn-1",
        fromModel: "gpt-5.6-sol",
        toModel: "gpt-5.6-terra",
        reason: "highRiskCyberActivity",
      }),
    ).toEqual([
      {
        type: "warning",
        threadId: "local-thread",
        message: msg("codex.modelRerouted", { fromModel: "gpt-5.6-sol", toModel: "gpt-5.6-terra" }),
        presentation: "notice",
      },
    ]);
  });

  it("drops advisories without user-facing text", () => {
    expect(map("warning", { threadId: null, message: "  " })).toEqual([]);
    expect(map("configWarning", { details: "no summary" })).toEqual([]);
    expect(map("model/rerouted", { threadId: "provider-thread", fromModel: "a" })).toEqual([]);
  });

  it("surfaces a repeated advisory once per session", () => {
    const state = createCodexMapperState("local-thread");
    const params = { threadId: null, message: "Skills were shortened." };
    expect(mapCodexNotification("warning", params, state)).toHaveLength(1);
    expect(mapCodexNotification("warning", params, state)).toEqual([]);
    expect(
      mapCodexNotification("warning", { threadId: null, message: "Something else." }, state),
    ).toHaveLength(1);
  });
});

describe("Codex advisory routing", () => {
  it("surfaces main-thread and thread-less advisories on the local thread", () => {
    const h = setupCodexStructuredSession();
    h.notify("guardianWarning", { threadId: "provider-thread", message: "Risky." });
    h.notify("configWarning", { summary: "Bad config", details: null });

    expect(h.events).toEqual([
      { type: "warning", threadId: "local-thread", message: "Risky.", presentation: "notice" },
      { type: "warning", threadId: "local-thread", message: "Bad config", presentation: "notice" },
    ]);
  });

  it("keeps a subagent child thread's advisories out of the main timeline", () => {
    const h = setupCodexStructuredSession();
    h.notify("item/started", {
      threadId: "provider-thread",
      item: {
        id: "spawn-call",
        type: "collabAgentToolCall",
        tool: "spawnAgent",
        status: "inProgress",
        receiverThreadIds: ["child-thread"],
        agentsStates: { "child-thread": { status: "running" } },
      },
    });
    const before = h.events.length;
    h.notify("guardianWarning", { threadId: "child-thread", message: "Child risk." });
    h.notify("warning", { threadId: "child-thread", message: "Child warning." });

    expect(h.events.slice(before)).toEqual([]);
  });

  it("keeps other threads' advisories out of the main timeline", () => {
    const h = setupCodexStructuredSession();
    h.notify("warning", { threadId: "unrelated-thread", message: "Not ours." });
    h.notify("model/rerouted", {
      threadId: "unrelated-thread",
      turnId: "turn-x",
      fromModel: "a",
      toModel: "b",
      reason: "highRiskCyberActivity",
    });

    expect(h.events).toEqual([]);
  });
});
