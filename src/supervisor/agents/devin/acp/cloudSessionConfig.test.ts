import { describe, expect, it } from "vitest";

import {
  DEVIN_ACP_CLOUD_CONFIG_OPTION_IDS,
  DEVIN_ACP_CLOUD_VERSION_CONFIG_ID,
  classifyDevinAcpCloudSessionConfig,
  classifyDevinAcpSelectOptionMeta,
  projectDevinAcpPickerRows,
  resolveDevinAcpCloudVersionConfigValue,
} from "./cloudSessionConfig";

/**
 * Recorded live `session/new` configOptions from `devin acp --cloud`
 * 3000.11.3 (tmp/devin/e3/results/cloud-session-new.json; option lists
 * truncated to the recorded samples — account data is irrelevant to the
 * contract, the option ids and select mechanics are not).
 */
const CLOUD_SESSION_NEW_CONFIG_OPTIONS = [
  {
    id: "org_id",
    name: "Organization",
    category: null,
    type: "select",
    currentValue: "org-4ae633b3dfc843f68520f7088bca580f",
    options: [{ value: "org-4ae633b3dfc843f68520f7088bca580f", name: "SDSLeon" }],
  },
  {
    id: "repos",
    name: "Repositories",
    category: null,
    type: "select",
    currentValue: "",
    options: [
      { value: "SDSLeon/zed", name: "zed" },
      { value: "SDSLeon/lightcode", name: "lightcode" },
    ],
  },
  {
    id: "persona_slug",
    name: "Persona",
    category: null,
    type: "select",
    currentValue: "",
    options: [
      { value: "", name: "Agent" },
      { value: "dana", name: "Data Analyst" },
    ],
  },
  {
    id: "devin_version",
    name: "Devin version",
    category: null,
    type: "select",
    currentValue: "devin-2-5",
    options: [
      { value: "devin-auto", name: "Fusion" },
      { value: "devin-ultra", name: "Ultra" },
      { value: "devin-2-5", name: "Normal" },
      { value: "devin-fast-opus", name: "Fast" },
      { value: "devin_lite", name: "Lite" },
      { value: "devin-swe-2-low", name: "SWE-2 Medium" },
    ],
  },
  {
    id: "platform",
    name: "Platform",
    category: null,
    type: "select",
    currentValue: "linux",
    options: [
      { value: "linux", name: "Ubuntu" },
      { value: "macos", name: "macOS" },
      { value: "windows", name: "Windows" },
    ],
  },
];

describe("classifyDevinAcpCloudSessionConfig", () => {
  it("classifies the live cloud option set and reports unknown ids", () => {
    const view = classifyDevinAcpCloudSessionConfig(CLOUD_SESSION_NEW_CONFIG_OPTIONS);
    expect(view.orgId?.currentValue).toBe("org-4ae633b3dfc843f68520f7088bca580f");
    expect(view.repos?.optionValues).toContain("SDSLeon/zed");
    expect(view.personaSlug?.optionValues).toEqual(["", "dana"]);
    expect(view.devinVersion?.currentValue).toBe("devin-2-5");
    expect(view.platform?.optionValues).toEqual(["linux", "macos", "windows"]);
    expect(view.unknownOptionIds).toEqual([]);
  });

  it("reports options that appear on a future build as unknown instead of dropping them", () => {
    const view = classifyDevinAcpCloudSessionConfig([
      ...CLOUD_SESSION_NEW_CONFIG_OPTIONS,
      {
        id: "net_policy",
        name: "Network policy",
        category: null,
        type: "select",
        currentValue: "a",
        options: [],
      },
    ]);
    expect(view.unknownOptionIds).toEqual(["net_policy"]);
  });

  it("tolerates missing and malformed option lists", () => {
    expect(classifyDevinAcpCloudSessionConfig(undefined).devinVersion).toBeUndefined();
    expect(classifyDevinAcpCloudSessionConfig("nope" as unknown).unknownOptionIds).toEqual([]);
    expect(classifyDevinAcpCloudSessionConfig([]).platform).toBeUndefined();
  });
});

describe("resolveDevinAcpCloudVersionConfigValue", () => {
  it("pushes a stored cloud version only when the session offers that exact value", () => {
    const push = resolveDevinAcpCloudVersionConfigValue(
      { model: "devin-ultra" },
      CLOUD_SESSION_NEW_CONFIG_OPTIONS,
    );
    expect(push).toEqual({
      configId: "devin_version",
      value: "devin-ultra",
      currentValue: "devin-2-5",
    });
  });

  it("omits currentValue when the requested value is already active", () => {
    const push = resolveDevinAcpCloudVersionConfigValue(
      { model: "devin-2-5" },
      CLOUD_SESSION_NEW_CONFIG_OPTIONS,
    );
    expect(push).toEqual({ configId: "devin_version", value: "devin-2-5" });
  });

  it("returns undefined for no selection, unknown versions, and non-cloud sessions", () => {
    expect(
      resolveDevinAcpCloudVersionConfigValue({}, CLOUD_SESSION_NEW_CONFIG_OPTIONS),
    ).toBeUndefined();
    expect(
      resolveDevinAcpCloudVersionConfigValue({ model: null }, CLOUD_SESSION_NEW_CONFIG_OPTIONS),
    ).toBeUndefined();
    expect(
      resolveDevinAcpCloudVersionConfigValue(
        { model: "bogus-cloud-version" },
        CLOUD_SESSION_NEW_CONFIG_OPTIONS,
      ),
    ).toBeUndefined();
    // Local session configOptions (mode/model/thought_level) must not match.
    expect(
      resolveDevinAcpCloudVersionConfigValue({ model: "swe-2-high" }, [
        {
          id: "model",
          name: "Model",
          category: "model",
          type: "select",
          currentValue: "swe-2-high",
          options: [],
        },
      ]),
    ).toBeUndefined();
  });

  it("keys the contract on the confirmed option id constant", () => {
    expect(DEVIN_ACP_CLOUD_VERSION_CONFIG_ID).toBe("devin_version");
    expect(Object.values(DEVIN_ACP_CLOUD_CONFIG_OPTION_IDS).sort()).toEqual([
      "devin_version",
      "org_id",
      "persona_slug",
      "platform",
      "repos",
    ]);
  });
});

describe("classifyDevinAcpSelectOptionMeta + projectDevinAcpPickerRows", () => {
  it("types the sparse archived-view load variant (E4 live capture)", () => {
    // Exact _meta from tmp/devin/e4/results/cloud-load-options.json
    // (devin_version first option, archived-view session/load).
    const meta = classifyDevinAcpSelectOptionMeta({
      "cognition.ai/toggleable": true,
      "cognition.ai/isFusion": true,
    });
    expect(meta).toMatchObject({ toggleable: true, isFusion: true });
    expect(meta.unknownKeys).toEqual([]);
    const persona = classifyDevinAcpSelectOptionMeta({
      "cognition.ai/icon": "code-xml",
      "cognition.ai/toggleable": false,
      "cognition.ai/isFusionCompatible": true,
    });
    expect(persona).toMatchObject({
      icon: "code-xml",
      toggleable: false,
      isFusionCompatible: true,
    });
  });
  it("types the full grouped-picker variant documented from E3 session/new", () => {
    const meta = classifyDevinAcpSelectOptionMeta({
      "cognition.ai/pickerLabel": "Fusion",
      "cognition.ai/tooltip": "Delegate end to end",
      "cognition.ai/toggleable": true,
      "cognition.ai/group": { name: "Fusion", header: "Research preview" },
      "cognition.ai/section": "Preview models",
      "cognition.ai/sectionTooltip": "Limited availability",
    });
    expect(meta).toEqual({
      pickerLabel: "Fusion",
      tooltip: "Delegate end to end",
      toggleable: true,
      icon: undefined,
      isFusion: undefined,
      isFusionCompatible: undefined,
      groupName: "Fusion",
      groupHeader: "Research preview",
      sectionName: "Preview models",
      sectionTooltip: "Limited availability",
      unknownKeys: [],
    });
    // Bare-string group values and groupName alias both resolve.
    expect(classifyDevinAcpSelectOptionMeta({ "cognition.ai/groupName": "Vendor" }).groupName).toBe(
      "Vendor",
    );
  });
  it("surfaces unknown meta keys fail-visible and tolerates absence", () => {
    expect(classifyDevinAcpSelectOptionMeta(undefined)).toMatchObject({ unknownKeys: [] });
    expect(classifyDevinAcpSelectOptionMeta("flat")).toMatchObject({
      unknownKeys: ["<non-object>"],
    });
    const unknown = classifyDevinAcpSelectOptionMeta({
      "cognition.ai/toggleable": true,
      "cognition.ai/futureKey": { nested: true },
      "cognition.ai/anotherOne": 1,
    });
    expect(unknown.unknownKeys).toEqual(["cognition.ai/futureKey", "cognition.ai/anotherOne"]);
  });
  it("projects picker rows through nested groups and bounds the projection", () => {
    const rows = projectDevinAcpPickerRows([
      {
        group: "Fusion",
        name: "Fusion models",
        options: [
          {
            value: "devin-auto",
            name: "devin-auto",
            description: "Delegate end to end",
            _meta: { "cognition.ai/pickerLabel": "Fusion", "cognition.ai/isFusion": true },
          },
        ],
      },
      {
        value: "devin-2-5",
        name: "Normal",
        _meta: { "cognition.ai/toggleable": true },
      },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      value: "devin-auto",
      name: "devin-auto",
      description: "Delegate end to end",
    });
    expect(rows[0]!.meta).toMatchObject({ pickerLabel: "Fusion", isFusion: true });
    expect(rows[1]!.meta).toMatchObject({ toggleable: true });
  });
  it("fails a select past the picker row bound instead of truncating tiers", () => {
    const many = Array.from({ length: 501 }, (_, i) => ({ value: `v${i}`, name: `V${i}` }));
    expect(() => projectDevinAcpPickerRows(many)).toThrow(/picker row bound/);
    const exactlyBound = Array.from({ length: 500 }, (_, i) => ({ value: `v${i}`, name: `V${i}` }));
    expect(projectDevinAcpPickerRows(exactlyBound)).toHaveLength(500);
  });
  it("preserves distinct opaque values and labels beyond the previous display limit", () => {
    const prefix = "p".repeat(240);
    const rows = projectDevinAcpPickerRows([
      { value: `${prefix}:first`, name: `${prefix} First` },
      { value: `${prefix}:second`, name: `${prefix} Second` },
      { value: "", name: "Default" },
    ]);
    expect(rows.map(({ value, name }) => ({ value, name }))).toEqual([
      { value: `${prefix}:first`, name: `${prefix} First` },
      { value: `${prefix}:second`, name: `${prefix} Second` },
      { value: "", name: "Default" },
    ]);
  });
  it("rejects cyclic and oversized snapshots before walking nested groups", () => {
    const group: { group: string; options: unknown[] } = { group: "recursive", options: [] };
    group.options.push(group);
    expect(() => projectDevinAcpPickerRows([group])).toThrow(/cycles/);
    expect(() => projectDevinAcpPickerRows([{ value: "x", name: "x".repeat(512 * 1024) }])).toThrow(
      /byte bound/,
    );
  });
});
