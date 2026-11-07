import { describe, expect, it } from "vitest";
import {
  buildStandardGuiSlashCommands,
  resolveStandardLocalSlashAction,
} from "./standardGuiSlashCommands";

const context = { hasEffort: true, supportsFast: true };

describe("standard GUI /crew command", () => {
  it("is listed among the standard GUI commands", () => {
    const commands = buildStandardGuiSlashCommands(context);
    const crew = commands.find((command) => command.id === "crew");
    expect(crew).toBeDefined();
    expect(crew?.description).toBe("Open the crew roster");
  });

  it("resolves to the crew control target", () => {
    expect(resolveStandardLocalSlashAction("/crew")).toEqual({
      kind: "open-control",
      target: "crew",
    });
  });

  it("does not resolve partial or provider-bound text", () => {
    expect(resolveStandardLocalSlashAction("/crew extra")).toBeNull();
    expect(resolveStandardLocalSlashAction("/crewx")).toBeNull();
  });
});
