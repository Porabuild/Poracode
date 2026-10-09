import { describe, expect, it } from "vitest";
import type { SupervisorEvent } from "@/shared/ipc";
import { settingsOwnerEdits, SupervisorSettingsEditsChannel } from "./supervisorSettingsWriter";

describe("settingsOwnerEdits", () => {
  it("edits the narrowest subjects with the next values verbatim", () => {
    const previous = {
      agentInstances: { kept: { id: "kept" }, removed: { id: "removed" } },
      agentSettings: { agent: { token: "sealed-a", other: 1 } },
      disabledAgents: ["a"],
      themeMode: "dark",
    };
    const next = {
      agentInstances: { kept: { id: "kept" }, added: { id: "added", secret: "sealed-b" } },
      agentSettings: { agent: { token: "sealed-c", other: 1 } },
      disabledAgents: [],
      themeMode: "dark",
    };

    expect(settingsOwnerEdits(previous, next)).toEqual([
      { subject: { kind: "entry", field: "agentInstances", key: "removed" } },
      {
        subject: { kind: "entry", field: "agentInstances", key: "added" },
        value: { id: "added", secret: "sealed-b" },
      },
      { subject: { kind: "agent-setting", agentKind: "agent", key: "token" }, value: "sealed-c" },
      { subject: { kind: "field", field: "disabledAgents" }, value: [] },
    ]);
  });

  it("limits the diff to the named fields", () => {
    expect(
      settingsOwnerEdits(
        { themeMode: "dark", locale: "en" },
        { themeMode: "light", locale: "de" },
        {
          fields: ["locale"],
        },
      ),
    ).toEqual([{ subject: { kind: "field", field: "locale" }, value: "de" }]);
  });
});

describe("SupervisorSettingsEditsChannel", () => {
  it("resolves a commit only after the owner confirms it and skips empty commits", async () => {
    const events: SupervisorEvent[] = [];
    const channel = new SupervisorSettingsEditsChannel({
      emit: (event) => events.push(event),
      invalidateSettings: () => {},
    });

    await channel.commit([]);
    expect(events).toEqual([]);

    const admitted = channel.admit();
    const event = events[0];
    if (event?.type !== "settings-edits-requested") throw new Error("Expected a settings request");
    expect(event.edits).toEqual([]);
    channel.confirm({ requestId: event.requestId, ok: false, error: "refused" });
    await expect(admitted).rejects.toThrow("refused");
    channel.dispose();
  });
});
