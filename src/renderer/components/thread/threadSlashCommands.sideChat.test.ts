import { describe, expect, it } from "vitest";
import {
  resolveAvailableSlashCommands,
  resolveLocalSlashCommandAction,
} from "./threadSlashCommands";

const gui = { agentKind: "neutral-gui", presentationMode: "gui" as const, supportsSideChat: true };

describe("app-owned side chat commands", () => {
  it("works without a provider command registration", () => {
    expect(resolveAvailableSlashCommands([], [], gui).map((command) => command.id)).toEqual([
      "btw",
    ]);
    expect(resolveLocalSlashCommandAction("/btw why this design?", gui)).toEqual({
      kind: "open-side-chat",
      prompt: "why this design?",
    });
    expect(resolveLocalSlashCommandAction(" /BTW\nwhat changed?", gui)).toEqual({
      kind: "open-side-chat",
      prompt: "what changed?",
    });
    expect(resolveLocalSlashCommandAction("/btw", gui)).toEqual({
      kind: "open-side-chat",
      prompt: "",
    });
  });

  it("reserves exact command tokens and leaves longer names alone", () => {
    expect(resolveLocalSlashCommandAction("/btwhatever", gui)).toBeNull();
    expect(resolveLocalSlashCommandAction("explain /btw please", gui)).toBeNull();
    expect(
      resolveAvailableSlashCommands([{ id: "btw", label: "Provider command" }], [], gui).filter(
        (command) => command.id === "btw",
      ),
    ).toHaveLength(1);
  });

  it("requires an existing GUI side-chat surface and never intercepts terminal input", () => {
    expect(
      resolveLocalSlashCommandAction("/btw hello", { ...gui, presentationMode: "terminal" }),
    ).toBeNull();
    expect(resolveAvailableSlashCommands([], [], { ...gui, presentationMode: "terminal" })).toEqual(
      [],
    );
    expect(
      resolveLocalSlashCommandAction("/btw hello", { ...gui, supportsSideChat: false }),
    ).toBeNull();
    expect(resolveAvailableSlashCommands([], [], { ...gui, supportsSideChat: false })).toEqual([]);
  });
});
