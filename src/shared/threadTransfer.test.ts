import { describe, expect, it } from "vitest";
import { threadSchema } from "./contracts/thread";
import type { PersistedRuntimeItem } from "./ipc/schemas";
import {
  selectThreadTransferSnapshot,
  threadTransferCommandSchema,
  threadTransferRepoIdentity,
  transferableThreadConfig,
} from "./threadTransfer";

const item = (id: string, type = "assistant_message", extra = {}): PersistedRuntimeItem => ({
  id,
  type,
  state: "completed",
  streams: {},
  ...extra,
});

const baseThread = {
  id: "thread-1",
  projectId: "project-1",
  title: "Picker",
  agentKind: "codex",
  config: { model: "gpt-5" },
  status: "inactive",
  attention: "none",
  createdAt: "2026-11-01T10:00:00Z",
  updatedAt: "2026-11-01T10:00:00Z",
};
const forkedFrom = {
  version: 1,
  threadId: "source",
  title: "Picker",
  throughItemId: "a1",
  inheritedTurnCount: 1,
  contextStrategy: "transcript",
};

describe("thread transfer contract", () => {
  it("keeps pre-transfer fork rows valid and reads the additive transfer lineage", () => {
    expect(threadSchema.parse({ ...baseThread, forkedFrom }).forkedFrom).toEqual(forkedFrom);
    const transfer = {
      version: 1,
      transferId: "transfer-0001",
      sourceHostLabel: "Laptop",
      transferredAt: "2026-11-02T10:00:00Z",
    };
    const parsed = threadSchema.parse({ ...baseThread, forkedFrom: { ...forkedFrom, transfer } });
    expect(parsed.forkedFrom?.transfer).toEqual(transfer);
    // A future lineage version is refused rather than misread.
    expect(
      threadSchema.safeParse({
        ...baseThread,
        forkedFrom: { ...forkedFrom, transfer: { ...transfer, version: 2 } },
      }).success,
    ).toBe(false);
  });

  it("names repositories across SSH and HTTPS spellings without credentials", () => {
    expect(threadTransferRepoIdentity("git@github.com:Acme/Widgets.git")).toBe(
      "github.com/acme/widgets",
    );
    expect(threadTransferRepoIdentity("https://user:token@github.com/Acme/Widgets")).toBe(
      "github.com/acme/widgets",
    );
    expect(threadTransferRepoIdentity("/srv/repos/widgets")).toBeNull();
  });

  it("moves every settled item, including a failed last prompt, without live work", () => {
    const snapshot = selectThreadTransferSnapshot(
      [
        item("u1", "user_message"),
        item("a1"),
        item("goal", "goal"),
        item("bg", "tool_call", { payload: { status: "running" } }),
        item("child", "assistant_message", { parentItemId: "bg" }),
        item("u2", "user_message", { state: "started" }),
      ],
      [{ anchorItemId: "a1", startedAt: "t0", endedAt: "t1" }],
    );
    expect(snapshot?.items.map((entry) => entry.id)).toEqual(["u1", "a1", "u2"]);
    expect(snapshot?.items.every((entry) => entry.state === "completed")).toBe(true);
    expect(snapshot?.throughItemId).toBe("u2");
    expect(selectThreadTransferSnapshot([item("goal", "goal")], [])).toBeNull();
  });

  it("drops host-bound settings and refuses unsafe transfer ids", () => {
    expect(
      transferableThreadConfig({
        model: "gpt-5",
        effort: "high",
        executionEnvironment: { kind: "wsl", distro: "Ubuntu" },
        importedFrom: { path: "/x.jsonl", importedAt: "t" },
      }),
    ).toEqual({ model: "gpt-5", effort: "high" });
    expect(
      threadTransferCommandSchema.safeParse({ kind: "release", transferId: "../../etc" }).success,
    ).toBe(false);
  });
});
