import { describe, expect, it, vi } from "vitest";
import type { AcpSessionActionContext } from "../../base/types";
import { AcpConfigControlError } from "../../acp/sessionConfigControl";
import { findFastConfigOption } from "../../acp/modelConfigOptions";
import workspaceDirectoriesFixture from "../fixtures/contracts/workspace-directories.json";
import {
  DEVIN_ACP_CONFIG_ACTION_IDS,
  DEVIN_ACP_FAST_CONFIG_BINDING,
  DEVIN_ACP_SPEED_CONFIG_ID,
  devinAcpConfigOptionsNormalizerFor,
  devinAcpLiveConfigActionDescriptors,
} from "./sessionConfiguration";

/**
 * The live config action pair delegates to the shared ACP seam's transport —
 * these tests drive recorded-shape fixtures through the descriptors and
 * assert the seam contract: pair availability, exact payload typing (no
 * coercion), the immutable `org_id`, single-shot delegation with the caller
 * signal, and the pure cloud normalizer.
 */

const makeRequestMock = () =>
  vi.fn<(method: string, params: Record<string, unknown>) => Promise<unknown>>(async () => ({}));
const makeGetOptionsMock = () => vi.fn<() => readonly unknown[]>(() => []);
const makeSetOptionMock = () =>
  vi.fn<
    (configId: string, value: string | boolean, options?: { signal?: AbortSignal }) => Promise<void>
  >(async () => {});

type ConfigTransport = {
  request: ReturnType<typeof makeRequestMock>;
  getConfigOptions: ReturnType<typeof makeGetOptionsMock>;
  setConfigOption: ReturnType<typeof makeSetOptionMock>;
};

const liveTransport = (overrides: Partial<ConfigTransport> = {}): ConfigTransport => ({
  request: makeRequestMock(),
  getConfigOptions: makeGetOptionsMock(),
  setConfigOption: makeSetOptionMock(),
  ...overrides,
});

const ctx = (overrides: Partial<AcpSessionActionContext> = {}): AcpSessionActionContext => ({
  threadId: "t1",
  sessionId: "native-1",
  signal: new AbortController().signal,
  ...overrides,
});

const descriptor = (transport: ConfigTransport, id: string) =>
  devinAcpLiveConfigActionDescriptors(
    transport as unknown as Parameters<typeof devinAcpLiveConfigActionDescriptors>[0],
  ).find((action) => action.id === id);

const invokeList = async (transport: ConfigTransport, context = ctx()) => {
  const action = descriptor(transport, DEVIN_ACP_CONFIG_ACTION_IDS.list);
  if (!action) throw new Error("list descriptor missing");
  return action.invoke({}, context);
};

const invokeSet = async (
  transport: ConfigTransport,
  payload: unknown,
  context = ctx(),
): Promise<Record<string, unknown>> => {
  const action = descriptor(transport, DEVIN_ACP_CONFIG_ACTION_IDS.set);
  if (!action) throw new Error("set descriptor missing");
  const validated = action.validatePayload
    ? action.validatePayload(payload)
    : (payload as Record<string, unknown>);
  return action.invoke(validated, context);
};

const validateSet = (transport: ConfigTransport, payload: unknown): Record<string, unknown> => {
  const action = descriptor(transport, DEVIN_ACP_CONFIG_ACTION_IDS.set);
  if (!action?.validatePayload) throw new Error("set validator missing");
  return action.validatePayload(payload);
};

// Exact native payload: live `devin acp` 3000.11.3 local session
// (tmp/devin/checkpoint-l-native-pair-controls.json).
const nativeSpeedOption = () => ({
  id: "speed",
  name: "Speed",
  category: "model_config",
  type: "select",
  currentValue: "standard",
  unknownWireField: { nested: [1, 2] },
  options: [
    { value: "standard", name: "Standard" },
    { value: "fast", name: "Fast" },
  ],
});

describe("devinAcpLiveConfigActionDescriptors availability", () => {
  it("declares the neutral pair only when the transport carries both live members", () => {
    const both = devinAcpLiveConfigActionDescriptors(liveTransport() as never);
    expect(both.map((action) => action.id)).toEqual([
      DEVIN_ACP_CONFIG_ACTION_IDS.list,
      DEVIN_ACP_CONFIG_ACTION_IDS.set,
    ]);

    // A transport predating the live seam advertises nothing — never a
    // dead menu entry backed by a missing method.
    for (const partial of [
      {},
      { getConfigOptions: () => [] },
      { setConfigOption: async () => {} },
    ]) {
      expect(devinAcpLiveConfigActionDescriptors(partial as never)).toEqual([]);
    }
  });
});

describe("devin.config.list", () => {
  it("returns the detached retained snapshot without touching the wire", async () => {
    const options = [
      { id: "mode", type: "select", category: "mode", currentValue: "bypass", options: [] },
    ];
    const transport = liveTransport({
      getConfigOptions: makeGetOptionsMock().mockReturnValue(options),
    });
    const result = await invokeList(transport);
    expect(result).toEqual({ configOptions: options });
    expect(transport.getConfigOptions).toHaveBeenCalledExactlyOnceWith();
    // Listing is a pure cache view: no extension RPC, no request tunnel.
    expect(transport.request).not.toHaveBeenCalled();
    expect(transport.setConfigOption).not.toHaveBeenCalled();
  });
});

describe("devin.config.set payload validation", () => {
  it("keeps string values exact — empty strings are legitimate, nothing is trimmed", () => {
    const transport = liveTransport();
    expect(validateSet(transport, { configId: "persona_slug", value: "" })).toEqual({
      configId: "persona_slug",
      value: "",
    });
    expect(validateSet(transport, { configId: "repos", value: "  " })).toEqual({
      configId: "repos",
      value: "  ",
    });
  });

  it("accepts booleans for negotiated boolean controls without stringifying them", () => {
    const transport = liveTransport();
    expect(validateSet(transport, { configId: "thinking", value: true })).toEqual({
      configId: "thinking",
      value: true,
    });
  });

  it.each([
    ["missing value", { configId: "model" }],
    ["number value", { configId: "model", value: 3 }],
    ["null value", { configId: "model", value: null }],
    ["object value", { configId: "model", value: { value: "swe-2-high" } }],
    ["missing configId", { value: "swe-2-high" }],
    ["empty configId", { configId: "", value: "swe-2-high" }],
    ["non-object payload", "model"],
  ])("rejects %s before any delegation", async (_label, payload) => {
    const transport = liveTransport();
    expect(() => validateSet(transport, payload)).toThrow(/payload/);
    await expect(invokeSet(transport, payload)).rejects.toThrow(/payload/);
    expect(transport.setConfigOption).not.toHaveBeenCalled();
  });

  it("refuses org_id before ANY wire send — the execution boundary is not a live control", async () => {
    const transport = liveTransport();
    await expect(invokeSet(transport, { configId: "org_id", value: "org-other" })).rejects.toThrow(
      /org_id is fixed/,
    );
    expect(transport.setConfigOption).not.toHaveBeenCalled();
    expect(transport.request).not.toHaveBeenCalled();
  });

  it("retains native workspace readback but refuses folder writes through the model config action", async () => {
    // Captured new/load/empty/omitted/setter options from the owned native
    // qualification. Membership, including the current value, cannot grant
    // scope through a transport that only owns model/config writes.
    for (const { option } of workspaceDirectoriesFixture.steps) {
      const transport = liveTransport({
        getConfigOptions: makeGetOptionsMock().mockReturnValue([option]),
      });
      expect(await invokeList(transport)).toEqual({ configOptions: [option] });
      await expect(
        invokeSet(transport, { configId: option.id, value: option.currentValue }),
      ).rejects.toMatchObject({
        data: { configId: "workspace-dirs", reason: "workspace-scope-requires-reopen" },
      });
      expect(transport.setConfigOption).not.toHaveBeenCalled();
      expect(transport.request).not.toHaveBeenCalled();
    }
  });

  it("passes opaque long ids and values through untouched — no field-length caps on native identifiers", async () => {
    // Native ids are opaque (36-char org UUIDs, long persona slugs, composite
    // Fusion pairs): this seam refuses nothing by length. Membership/type is
    // the shared seam's advertised-validation job.
    const longConfigId = "org-4ae633b3dfc843f68520f7088bca580f-suffix-".repeat(6) + "tail"; // >200
    const longValue = "persona/".concat("slug-segment-".repeat(45)); // >500
    expect(longConfigId.length).toBeGreaterThan(200);
    expect(longValue.length).toBeGreaterThan(500);
    const transport = liveTransport();
    expect(validateSet(transport, { configId: longConfigId, value: longValue })).toEqual({
      configId: longConfigId,
      value: longValue,
    });
    const result = await invokeSet(transport, { configId: longConfigId, value: longValue });
    expect(result).toEqual({ configId: longConfigId, set: true });
    expect(transport.setConfigOption).toHaveBeenCalledExactlyOnceWith(
      longConfigId,
      longValue,
      expect.objectContaining({ signal: expect.anything() }),
    );
    // The exact long ids also survive the bounded result round-trip.
    expect(result.configId).toBe(longConfigId);
  });
});

describe("devin.config.set delegation", () => {
  it("delegates exactly once to the shared setter with the caller's signal", async () => {
    const controller = new AbortController();
    const transport = liveTransport();
    const result = await invokeSet(
      transport,
      { configId: "model", value: "swe-2-high" },
      ctx({ signal: controller.signal }),
    );
    expect(result).toEqual({ configId: "model", set: true });
    expect(transport.setConfigOption).toHaveBeenCalledExactlyOnceWith(
      "model",
      "swe-2-high",
      expect.objectContaining({ signal: controller.signal }),
    );
    // Never an extension RPC: the standard setter is the only wire path.
    expect(transport.request).not.toHaveBeenCalled();
  });

  it("propagates the shared confirmation error and never retries the mutation", async () => {
    const unconfirmed = new AcpConfigControlError(
      "unconfirmed",
      'The session reports a different value for config option "model".',
      { configId: "model" },
    );
    const setOption = makeSetOptionMock().mockRejectedValue(unconfirmed);
    const transport = liveTransport({ setConfigOption: setOption });
    await expect(invokeSet(transport, { configId: "model", value: "swe-2-high" })).rejects.toBe(
      unconfirmed,
    );
    expect(transport.setConfigOption).toHaveBeenCalledTimes(1);
  });

  it("propagates a lifecycle refusal (closed transport) typed", async () => {
    const setOption = makeSetOptionMock().mockRejectedValue(
      new AcpConfigControlError("unavailable", "ACP session is not open.", { configId: "model" }),
    );
    const transport = liveTransport({ setConfigOption: setOption });
    await expect(
      invokeSet(transport, { configId: "model", value: "swe-2-high" }),
    ).rejects.toMatchObject({ reason: "unavailable" });
    expect(transport.setConfigOption).toHaveBeenCalledTimes(1);
  });
});

describe("devinAcpConfigOptionsNormalizerFor", () => {
  const cloudOptions = () => [
    {
      id: "org_id",
      type: "select",
      category: null,
      currentValue: "org-1",
      options: [{ value: "org-1", name: "Acme" }],
    },
    {
      id: "devin_version",
      type: "select",
      category: null,
      currentValue: "devin-2-5",
      unknownField: { nested: true },
      options: [
        { value: "devin-2-5", name: "Devin 2.5", _meta: { "cognition.ai/pickerLabel": "2.5" } },
      ],
    },
  ];

  const localOptions = () => [
    {
      id: "mode",
      name: "Session Mode",
      category: "mode",
      type: "select",
      currentValue: "bypass",
      options: [{ value: "bypass", name: "Bypass Permissions" }],
    },
    {
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: "swe-2-high",
      options: [{ value: "swe-2-high", name: "SWE-2" }],
    },
    {
      id: "thought_level",
      name: "Thinking",
      category: "thought_level",
      type: "select",
      currentValue: "medium",
      options: [
        { value: "low", name: "Low" },
        { value: "medium", name: "Medium" },
        { value: "high", name: "High" },
        { value: "xhigh", name: "XHigh" },
        { value: "max", name: "Max" },
      ],
    },
    nativeSpeedOption(),
  ];

  const deepFreeze = <T>(value: T): T => {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    }
    return value;
  };

  const byId = (entries: readonly unknown[], id: string): Record<string, unknown> => {
    const found = entries.find(
      (entry) => entry && typeof entry === "object" && (entry as { id?: unknown }).id === id,
    );
    if (!found || typeof found !== "object") throw new Error(`option ${id} missing`);
    return found as Record<string, unknown>;
  };

  it("declares the cloud-only normalizer — local and unknown targets wire none", () => {
    expect(devinAcpConfigOptionsNormalizerFor("cloud")).toBeDefined();
    // The local surface needs no category declaration: the native `speed`
    // select is bound through DEVIN_ACP_FAST_CONFIG_BINDING with its native
    // category and values untouched.
    expect(devinAcpConfigOptionsNormalizerFor("local")).toBeUndefined();
    expect(devinAcpConfigOptionsNormalizerFor(undefined)).toBeUndefined();
  });

  it("gives the cloud devin_version select the semantic model category, preserving every field", () => {
    const normalize = devinAcpConfigOptionsNormalizerFor("cloud")!;
    const options = cloudOptions();
    const normalized = normalize(options);
    expect(normalized).toHaveLength(2);
    // Unrelated options pass through untouched (same reference).
    expect(normalized[0]).toBe(options[0]);
    expect(normalized[1]).toEqual({
      id: "devin_version",
      type: "select",
      category: "model",
      currentValue: "devin-2-5",
      unknownField: { nested: true },
      options: [
        { value: "devin-2-5", name: "Devin 2.5", _meta: { "cognition.ai/pickerLabel": "2.5" } },
      ],
    });
  });

  it("leaves the native speed select completely untouched — the binding consumes native values", () => {
    const normalize = devinAcpConfigOptionsNormalizerFor("cloud")!;
    const speed = nativeSpeedOption();
    const normalized = normalize([speed]);
    // Same reference: native id, category, current value, labels and value
    // ids are never rewritten — the declared binding classifies the select
    // by exact id plus the exact value pair with `category: "model_config"`
    // intact, so no provider rewrite is needed or performed.
    expect(normalized[0]).toBe(speed);
  });

  it("rewrites only the declared devin_version category on a mixed payload", () => {
    const normalize = devinAcpConfigOptionsNormalizerFor("cloud")!;
    const speed = nativeSpeedOption();
    const options = [...cloudOptions(), ...localOptions().slice(0, 3), speed];
    const normalized = normalize(options);
    expect(byId(normalized, "devin_version").category).toBe("model");
    // Native categories nothing declares stay verbatim — the speed select by
    // reference, everything else deep-equal to its inbound shape.
    expect(byId(normalized, DEVIN_ACP_SPEED_CONFIG_ID)).toBe(speed);
    expect(byId(normalized, "mode").category).toBe("mode");
    expect(byId(normalized, "org_id").category).toBeNull();
  });

  it("never rewrites boolean or unsupported options", () => {
    const normalize = devinAcpConfigOptionsNormalizerFor("cloud")!;
    const booleanOption = { id: "thinking", type: "boolean", currentValue: true };
    // A boolean-typed option with the bound speed id is untouched too: the
    // binding drives selects only, and the normalizer rewrites nothing but
    // the cloud devin_version category.
    const booleanSpeedOption = { id: "speed", type: "boolean", currentValue: true };
    // A boolean-VALUE select that is not the native speed id is untouched —
    // the shared driver owns its true/false classification.
    const booleanValueSelect = {
      id: "turbo",
      type: "select",
      category: "model_config",
      currentValue: "true",
      options: [{ value: "true" }, { value: "false" }],
    };
    const nonSelectSpeed = { id: "speed" };
    const normalized = normalize([
      booleanOption,
      booleanSpeedOption,
      booleanValueSelect,
      nonSelectSpeed,
    ]);
    // Same references — nothing rewritten, nothing cloned without cause.
    expect(normalized[0]).toBe(booleanOption);
    expect(normalized[1]).toBe(booleanSpeedOption);
    expect(normalized[2]).toBe(booleanValueSelect);
    expect(normalized[3]).toBe(nonSelectSpeed);
  });

  it("never mutates the inbound payload — a deep-frozen inventory normalizes without throwing", () => {
    const normalize = devinAcpConfigOptionsNormalizerFor("cloud")!;
    const speed = nativeSpeedOption();
    const frozen = deepFreeze([...cloudOptions(), speed]);
    const normalized = normalize(frozen);
    // The mapped entry is a fresh clone carrying the declared category…
    expect(byId(normalized, "devin_version").category).toBe("model");
    // …while the frozen inbound record is untouched (a strict-mode write to
    // it would throw before this assertion runs).
    const frozenVersion = byId(frozen, "devin_version");
    expect(frozenVersion.category).toBeNull();
    expect(Object.isFrozen(frozenVersion)).toBe(true);
    expect(Object.isFrozen(frozenVersion.options)).toBe(true);
    // The speed select passes through by reference — nothing to rewrite.
    expect(byId(normalized, DEVIN_ACP_SPEED_CONFIG_ID)).toBe(speed);
  });

  it("is idempotent — repeated normalization agrees", () => {
    const normalize = devinAcpConfigOptionsNormalizerFor("cloud")!;
    const once = normalize([...cloudOptions(), ...localOptions()]);
    const twice = normalize(once);
    expect(twice).toEqual(once);
  });

  it("is total and pure — malformed shapes pass through, repeated calls agree", () => {
    const normalize = devinAcpConfigOptionsNormalizerFor("cloud")!;
    expect(normalize([])).toEqual([]);
    expect(normalize([null, "scalar", 3])).toEqual([null, "scalar", 3]);
    expect(normalize([{ id: "repos" }])).toEqual([{ id: "repos" }]);
    expect(normalize([{ id: "devin_version", type: "boolean" }])).toEqual([
      { id: "devin_version", type: "boolean" },
    ]);
    const once = normalize(cloudOptions());
    const twice = normalize(cloudOptions());
    expect(once).toEqual(twice);
  });
});

describe("DEVIN_ACP_FAST_CONFIG_BINDING", () => {
  it("binds the exact native speed select and value pair of the live capture", () => {
    // Exact native ids from tmp/devin/checkpoint-l-native-pair-controls.json.
    expect(DEVIN_ACP_FAST_CONFIG_BINDING).toEqual({
      configId: "speed",
      disabled: "standard",
      enabled: "fast",
    });
    expect(DEVIN_ACP_FAST_CONFIG_BINDING.configId).toBe(DEVIN_ACP_SPEED_CONFIG_ID);
    // A degenerate pair would classify nothing — the two ids stay distinct.
    expect(DEVIN_ACP_FAST_CONFIG_BINDING.disabled).not.toBe(DEVIN_ACP_FAST_CONFIG_BINDING.enabled);
  });

  it("classifies the exact captured payload as the bound fast control with the native category untouched", () => {
    // Shared classification (findFastConfigOption with the declared binding)
    // claims the select by exact id plus the exact two advertised values and
    // ignores the category — the native `category: "model_config"` needs no
    // provider rewrite and none happens. Classification only: the composer
    // gating, echo fold and wire push are shared-side consumption qualified
    // by root's live UI tests — not claimed here.
    const speed = nativeSpeedOption();
    const found = findFastConfigOption([speed], DEVIN_ACP_FAST_CONFIG_BINDING);
    expect(found?.id).toBe(DEVIN_ACP_SPEED_CONFIG_ID);
    // Classification is read-only: the captured payload is untouched.
    expect(speed.category).toBe("model_config");
    expect(speed.currentValue).toBe("standard");
    expect(speed.options).toEqual([
      { value: "standard", name: "Standard" },
      { value: "fast", name: "Fast" },
    ]);
  });

  it("keeps fast unbound on payloads the binding cannot drive", () => {
    // A different advertised pair on the bound id is never claimed — the
    // binding drives only the exact captured values, never a guess.
    const otherPair = {
      ...nativeSpeedOption(),
      options: [
        { value: "eco", name: "Eco" },
        { value: "turbo", name: "Turbo" },
      ],
    };
    expect(findFastConfigOption([otherPair], DEVIN_ACP_FAST_CONFIG_BINDING)).toBeUndefined();
    // A native boolean-typed control with the bound id is never claimed
    // either (booleans classify through the shared value-shape path only).
    expect(
      findFastConfigOption(
        [{ id: "speed", type: "boolean", currentValue: true }],
        DEVIN_ACP_FAST_CONFIG_BINDING,
      ),
    ).toBeUndefined();
  });
});
