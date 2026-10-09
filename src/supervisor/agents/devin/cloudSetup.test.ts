import { describe, expect, it, vi } from "vitest";
import type { AcpConfigureOpenedSessionContext } from "../acp/sessionOpenedSetup";
import {
  allowDevinCloudRepositorySelection,
  assertDevinCloudSetupChatOnly,
  configureDevinCloudSetup,
  hasDevinCloudSetupChoices,
} from "./cloudSetup";

function select(id: string, currentValue: string, values: string[]) {
  return {
    id,
    type: "select",
    currentValue,
    options: values.map((value) => ({ value, name: value })),
  };
}

function fixture(kind: AcpConfigureOpenedSessionContext["kind"] = "new", pending?: unknown) {
  let options = [
    select("persona_slug", "", ["", "dana"]),
    select("platform", "linux", ["linux", "macos", "windows"]),
    select("repos", "", ["org/repo-a", "org/repo-b"]),
  ];
  const setConfigOption = vi.fn<(id: string, value: string | boolean) => Promise<void>>(
    async (id, value) => {
      options = options.map((option) =>
        option.id === id ? { ...option, currentValue: String(value) } : option,
      );
    },
  );
  const opened: AcpConfigureOpenedSessionContext = {
    kind,
    sessionId: "devin-owned-cloud-session",
    openResponse: {
      _meta: pending === undefined ? {} : { "cognition.ai/pendingSession": pending },
    },
    readCurrentConfigOptions: () => structuredClone(options),
    setConfigOption,
  };
  return { opened, setConfigOption, options: () => options };
}

describe("Devin cloud chat setup", () => {
  it("applies explicit fresh choices, with persona first and exact native CSV", async () => {
    const { opened, setConfigOption } = fixture();
    await configureDevinCloudSetup({
      persona: "dana",
      platform: "windows",
      repositories: ["org/repo-a", "org/repo-b"],
    })(opened);
    expect(setConfigOption.mock.calls).toEqual([
      ["persona_slug", "dana"],
      ["platform", "windows"],
      ["repos", "org/repo-a,org/repo-b"],
    ]);
  });

  it("leaves absent fields native and carries explicit empty clear values", async () => {
    const { opened, setConfigOption } = fixture("load", true);
    await opened.setConfigOption("repos", "org/repo-a");
    await opened.setConfigOption("persona_slug", "dana");
    setConfigOption.mockClear();
    await configureDevinCloudSetup({ repositories: [], persona: "" })(opened);
    expect(setConfigOption.mock.calls).toEqual([
      ["persona_slug", ""],
      ["repos", ""],
    ]);
    setConfigOption.mockClear();
    await configureDevinCloudSetup(undefined)(opened);
    await configureDevinCloudSetup({})(opened);
    expect(setConfigOption).not.toHaveBeenCalled();
  });

  it.each(["load", "resume"] as const)(
    "applies choices to pending %s and keeps activated workspace choices",
    async (kind) => {
      const pending = fixture(kind, true);
      await configureDevinCloudSetup({ platform: "macos" })(pending.opened);
      expect(pending.setConfigOption).toHaveBeenCalledWith("platform", "macos");
      for (const marker of [undefined, false]) {
        const active = fixture(kind, marker);
        await configureDevinCloudSetup({
          persona: "unavailable",
          platform: "windows",
          repositories: [],
        })(active.opened);
        expect(active.setConfigOption).not.toHaveBeenCalled();
      }
    },
  );

  it("refuses a malformed pending marker instead of ignoring pending choices", async () => {
    const { opened, setConfigOption } = fixture("load", "true");
    await expect(configureDevinCloudSetup({ platform: "macos" })(opened)).rejects.toMatchObject({
      code: "cloud-pending-state-invalid",
    });
    expect(setConfigOption).not.toHaveBeenCalled();
  });

  it.each([
    { persona: "foreign-persona" },
    { platform: "windows" as const, repositories: ["foreign/repo"] },
  ])("rejects unadvertised exact selections and exposes the failed open", async (choices) => {
    const { opened } = fixture();
    await expect(configureDevinCloudSetup(choices)(opened)).rejects.toMatchObject({
      code: "cloud-setup-selection-unavailable",
    });
  });

  it("retains a detached launch choice and does not follow later profile mutation", async () => {
    const choices = { repositories: ["org/repo-a"] };
    const configure = configureDevinCloudSetup(choices);
    choices.repositories[0] = "foreign/repo";
    const { opened, setConfigOption } = fixture();
    await configure(opened);
    expect(setConfigOption).toHaveBeenCalledWith("repos", "org/repo-a");
  });

  it("allows only qualified clear/composite values for the cloud repository option", () => {
    const repos = select("repos", "", ["org/repo-a", "org/repo-b"]);
    expect(allowDevinCloudRepositorySelection("repos", "", repos)).toBe(true);
    expect(allowDevinCloudRepositorySelection("repos", "org/repo-a,org/repo-b", repos)).toBe(true);
    for (const value of [
      "foreign/repo",
      "org/repo-a,foreign/repo",
      "org/repo-a,org/repo-a",
      "org/repo-a,",
      ",org/repo-a",
    ]) {
      expect(allowDevinCloudRepositorySelection("repos", value, repos)).toBe(false);
    }
    expect(allowDevinCloudRepositorySelection("platform", "", repos)).toBe(false);
    expect(allowDevinCloudRepositorySelection("repos", "", { ...repos, type: "boolean" })).toBe(
      false,
    );
  });

  it("refuses explicit chat setup in cloud CLI, keeps local and unspecified launches", () => {
    expect(hasDevinCloudSetupChoices(undefined)).toBe(false);
    expect(hasDevinCloudSetupChoices({})).toBe(false);
    expect(hasDevinCloudSetupChoices({ repositories: [] })).toBe(true);
    expect(() => assertDevinCloudSetupChatOnly("cloud", { repositories: [] })).toThrow(
      "This profile has cloud chat setup choices.",
    );
    expect(() => assertDevinCloudSetupChatOnly("local", { persona: "dana" })).not.toThrow();
    expect(() => assertDevinCloudSetupChatOnly("cloud", {})).not.toThrow();
  });
});
