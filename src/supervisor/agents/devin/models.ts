import { z } from "zod";
import type { AgentCapability, ThreadConfig } from "@/shared/contracts";
import { canonicalizeEffortId } from "@/shared/effortOrder";
import { findSelectConfigOption, findThoughtLevelConfig } from "../acp/sessionConfig";
import { findFastConfigOption, flattenSelectOptionValues } from "../acp/modelConfigOptions";
import {
  hasExplicitCompositeControls,
  hasUnsupportedCompositeControls,
  compositeControlsCarriable,
} from "./compositeModelControls";
import { DEVIN_ACP_FAST_CONFIG_BINDING } from "./acp/fastConfigBinding";
import { devinDefaultHiddenModels } from "./modelVisibility";
import {
  classifyDevinAcpCloudSessionConfig,
  resolveDevinAcpCloudVersionConfigValue,
} from "./acp/cloudSessionConfig";

const catalogSchema = z.object({
  families: z.array(
    z.object({
      family_label: z.string().min(1),
      slug: z.string().min(1),
      variants: z
        .array(
          z.object({
            model_uid: z.string().min(1),
            label: z.string().min(1),
            cost_summary: z.string().optional(),
            cost_tier: z.string().optional(),
          }),
        )
        .min(1),
    }),
  ),
});

type Variant = {
  id: string;
  /**
   * Full native variant label ("SWE-2 Medium", "Claude Fable 5.1 Medium",
   * "SWE-1.6 Fast"). The vocabulary the family-pair decoder resolves Fusion
   * halves against — catalog labels, never opaque IDs, decide membership.
   * Optional only so hand-built test catalogs can omit it (such families
   * simply fall out of the label vocabulary).
   */
  label?: string;
  effort: string;
  fast: boolean;
  thinking: boolean;
  context: string;
  /** Provider cost text, surfaced verbatim on composite picker entries. */
  cost?: string;
  /**
   * Exact provider label for composite variants (Fusion pairs and any other
   * non-effort label shape): the full native family-suffix text, Fast/1M
   * markers and whitespace included — stripping a marker would display two
   * distinct configurations identically (a pair and its Fast sibling).
   * The pair itself is the variant's identity — never decomposed into
   * effort/thinking controls.
   */
  composite?: string;
};
export type DevinModelFamily = {
  id: string;
  label: string;
  /** Native catalog family identity; absent in older hand-built catalogs. */
  slug?: string;
  description?: string;
  variants: Variant[];
};
const effortOrder = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];

/**
 * Classify the family-label suffix of one catalog variant.
 *
 * The suffix is provider display text, not a schema: clean effort tiers
 * ("Medium Thinking", "No Thinking", "High") map onto the shared effort
 * ladder, the bare "Thinking" marker stays a thinking-only variant, and
 * everything else — Fusion's "Left Model + Right Model" pairs above all — is
 * classified as a composite variant; the caller keeps the FULL native suffix
 * (Fast/1M markers included) as its label. Nothing unrecognized is flattened
 * to "no effort" or logged as an unknown tier: the pair label IS the choice.
 */
function parseVariantLabel(tail: string): Pick<Variant, "effort" | "thinking" | "composite"> {
  if (tail === "") return { effort: "", thinking: false };
  if (/^thinking$/i.test(tail)) return { effort: "", thinking: true };
  if (/^no thinking$/i.test(tail)) return { effort: "none", thinking: false };
  const thinkingMarker = /\s+thinking$/i.exec(tail);
  const base = (thinkingMarker ? tail.slice(0, thinkingMarker.index) : tail).trim();
  const canonical = base.replace(/[-\s]/g, "").toLowerCase();
  if (canonical && effortOrder.includes(canonical)) {
    // "<tier> Thinking" names the same effort ladder; only the bare
    // "Thinking" marker is the independent thinking toggle.
    return { effort: canonical, thinking: false };
  }
  return { effort: "", thinking: false, composite: tail };
}

/** Family membership comes from the CLI, never from opaque model IDs. */
export function parseDevinModelCatalog(raw: string): DevinModelFamily[] {
  const catalog = catalogSchema.parse(JSON.parse(raw));
  return catalog.families.map((family) => ({
    // Keep a real wire ID as the public ID, including when detection is unavailable later.
    id: family.variants[0]!.model_uid,
    label: family.family_label,
    slug: family.slug,
    // Preserve provider text, including Free and unknown tiers, so the renderer
    // can show honest ranges without inventing a price for missing variants.
    ...(() => {
      const descriptions = family.variants.map(
        (v) => v.cost_summary?.trim() || v.cost_tier?.trim(),
      );
      return descriptions.every(Boolean)
        ? { description: [...new Set(descriptions)].join("\n") }
        : {};
    })(),
    variants: family.variants.map((variant) => {
      if (!variant.label.startsWith(family.family_label)) {
        throw new Error("Unexpected Devin model family label");
      }
      const tail = variant.label.slice(family.family_label.length).trim();
      const fast = /\bFast\b/i.test(tail);
      const context = /\b1M\b/i.test(tail) ? "1m" : "default";
      const stripped = tail.replace(/\b(Fast|1M)\b/gi, "").trim();
      const parsed = parseVariantLabel(stripped);
      const cost = variant.cost_summary?.trim() || variant.cost_tier?.trim();
      return {
        id: variant.model_uid,
        label: variant.label,
        ...parsed,
        // Composite labels keep the FULL native suffix — Fast/1M markers and
        // whitespace included. The marker-stripped text would show a Fusion
        // pair and its Fast sibling as the same label (differing only in a
        // leftover double space); regular variants still fold the markers
        // into the fast/context controls above.
        ...(parsed.composite !== undefined ? { composite: tail } : {}),
        fast,
        context,
        ...(cost ? { cost } : {}),
      };
    }),
  }));
}

export function devinModelCapabilities(
  families: DevinModelFamily[],
): Pick<
  AgentCapability,
  | "models"
  | "efforts"
  | "modelEfforts"
  | "modelDefaultEfforts"
  | "fastModels"
  | "thinkingModels"
  | "contextSizes"
  | "modelContextSizes"
  | "defaultHiddenModels"
> {
  const modelEfforts = Object.fromEntries(
    families.map((f) => [
      f.id,
      // Composite variants carry no effort control: the exact pair is the choice.
      effortOrder.filter((effort) => f.variants.some((v) => !v.composite && v.effort === effort)),
    ]),
  );
  return {
    defaultHiddenModels: devinDefaultHiddenModels(families),
    models: families.flatMap((family) => {
      // Regular variants share the family row; composite pairs surface their
      // own exact label and cost below, so the family aggregate never becomes
      // a hundreds-line list of pair prices.
      const regular = family.variants.filter((v) => !v.composite);
      const allComposite = regular.length === 0;
      const description = (() => {
        if (!allComposite) {
          const costs = regular.map((v) => v.cost?.trim());
          return costs.every(Boolean) ? [...new Set(costs)].join("\n") : undefined;
        }
        return family.variants[0]!.cost?.trim();
      })();
      const entries = [
        {
          id: family.id,
          // A family whose every variant is a composite pair (Fusion) is
          // presented through the pairs' own exact labels — the family id is
          // the first pair's wire UID.
          label: allComposite ? (family.variants[0]!.composite ?? family.label) : family.label,
          ...(description ? { description } : {}),
        },
      ];
      // Every composite variant is its own first-class picker entry so no
      // Fusion pair (or future composite label) is collapsed or lost.
      for (const variant of family.variants) {
        if (!variant.composite || variant.id === family.id) continue;
        entries.push({
          id: variant.id,
          label: variant.composite,
          ...(variant.cost ? { description: variant.cost } : {}),
        });
      }
      return entries;
    }),
    efforts: effortOrder.filter((effort) =>
      Object.values(modelEfforts).some((values) => values.includes(effort)),
    ),
    modelEfforts,
    modelDefaultEfforts: Object.fromEntries(
      families.filter((f) => f.variants[0]!.effort).map((f) => [f.id, f.variants[0]!.effort]),
    ),
    // A family whose every variant is a composite pair (Fusion) is NOT a Fast
    // model: the exact pair encodes the pair's own speed, and the resolver
    // rejects a separate `fast: true` control on it — declaring the family
    // here promised what resolution refuses. The relation-aware projection
    // (modelFamilySelections.ts) supplies the pair's real Fast availability.
    // Families with regular Fast variants keep their declaration.
    fastModels: families
      .filter((f) => f.variants.some((v) => v.fast) && !f.variants.every((v) => v.composite))
      .map((f) => f.id),
    thinkingModels: families.filter((f) => f.variants.some((v) => v.thinking)).map((f) => f.id),
    contextSizes: [
      { id: "default", label: "Default" },
      { id: "1m", label: "1M" },
    ],
    modelContextSizes: Object.fromEntries(
      families.map((f) => [f.id, [...new Set(f.variants.map((v) => v.context))]]),
    ),
  };
}

/** Resolve every control together; private IDs and priority suffixes are provider-owned. */
export function resolveDevinModel(config: ThreadConfig, families: DevinModelFamily[]): string {
  const family = families.find(
    (f) => f.id === config.model || f.variants.some((v) => v.id === config.model),
  );
  if (!family) return config.model;
  const initial = family.variants.find((v) => v.id === config.model) ?? family.variants[0]!;
  // A composite (Fusion pair) is selected verbatim by its exact wire ID: the
  // pair already encodes both models' effort. Laddered controls cannot
  // compose onto it, so a MEANINGFUL control must fail visibly instead of
  // silently dropping the choice — while the composer's inert OFF/default
  // seeds (empty/default effort or context, fast/thinking false) resolve to
  // the exact pair, never reject it.
  if (initial.composite) {
    if (!hasExplicitCompositeControls(config)) return initial.id;
    throw new Error(`Unsupported model configuration for ${family.label}`);
  }
  const effort = config.effort || initial.effort;
  const match = family.variants.find(
    (v) =>
      !v.composite &&
      v.effort === effort &&
      v.fast === (config.fast ?? initial.fast) &&
      v.thinking === (config.thinking ?? initial.thinking) &&
      v.context === (config.contextSize || initial.context),
  );
  if (!match) throw new Error(`Unsupported model configuration for ${family.label}`);
  return match.id;
}

/**
 * ACP sends the exact pair ID at launch and negotiates its independent effort
 * after opening. Keep that effort in the config for strict native validation;
 * unsupported context and thinking controls still fail before spawn. Fast is
 * also validated after opening, against the independent native speed select.
 */
export function resolveDevinAcpLaunchModel(
  families: readonly DevinModelFamily[],
  config: ThreadConfig,
): string {
  const family = families.find(
    (f) => f.id === config.model || f.variants.some((v) => v.id === config.model),
  );
  const initial = family?.variants.find((v) => v.id === config.model) ?? family?.variants[0];
  if (family && initial?.composite && !hasUnsupportedCompositeControls(config)) {
    return initial.id;
  }
  // The live speed selector owns Fast in ACP; do not bake it into argv model IDs.
  const { fast: _fast, ...modelConfig } = config;
  return resolveDevinModel(modelConfig, [...families]);
}

/**
 * Outcome of negotiating the stored model against the live session's
 * accepted `model` config option.
 *
 * - `applied` — a value is pushed to the agent.
 * - `rejected-by-session` — the agent does not offer the requested model, so
 *   no push is made and the agent keeps its own current value. This is a
 *   visible negotiation rejection, never a silent success: the host surfaces
 *   it and lets the shared config-option fold roll the thread config back to
 *   what the agent actually holds.
 * - `no-model-option` — the session advertises no `model` select option, so
 *   model ownership stays with the CLI argv; there is nothing to negotiate.
 */
export type DevinAcpModelNegotiation =
  | {
      status: "applied";
      configId: string;
      value: string;
      currentValue?: string;
    }
  | {
      status: "rejected-by-session";
      /** Resolved catalog UID the user's config asked for. */
      requested: string;
      /** Stored raw thread model id (may equal `requested`). */
      stored: string;
      /** Option values the live session actually accepts. */
      accepted: readonly string[];
      /** The agent's own current value, for the rollback notice. */
      agentValue?: string;
    }
  | { status: "no-model-option" };

/**
 * Private provider-owned choice id for the cloud model menu: "use Devin's own
 * current cloud version". This is an INTENT, never a wire id — it is never
 * forwarded to any CLI argv or `session/new` model field. The ACP resolver
 * resolves it to the live `devin_version` option's own `currentValue` (or
 * pushes nothing when the option is absent), so the session honors whatever
 * cloud version the account actually holds. Non-empty so the shared draft
 * (ThreadConfig.model min 1) and the renderer model pickers accept it.
 */
export const DEVIN_CLOUD_DEFAULT_MODEL_ID = "devin-cloud-native-default";

export function isDevinCloudDefaultModelId(model: string | undefined): boolean {
  return model === DEVIN_CLOUD_DEFAULT_MODEL_ID;
}

/** Laddered controls that cannot compose onto an opaque composite (pair) choice. */
function hasExplicitLadderControls(config: ThreadConfig): boolean {
  return (
    (config.effort !== undefined && config.effort !== "default") ||
    config.fast !== undefined ||
    config.thinking !== undefined ||
    (config.contextSize !== undefined && config.contextSize !== "default")
  );
}

type CatalogVariantEntry = {
  id: string;
  family: DevinModelFamily;
  variant: DevinModelFamily["variants"][number];
};

/** Variant UID → owning family. Family ids are their first variant's UID, so one map serves both. */
function devinVariantIndex(
  families: readonly DevinModelFamily[],
): Map<string, CatalogVariantEntry> {
  const index = new Map<string, CatalogVariantEntry>();
  for (const family of families) {
    for (const variant of family.variants) {
      if (!index.has(variant.id)) index.set(variant.id, { id: variant.id, family, variant });
    }
  }
  return index;
}

/**
 * The catalog UID the stored config folds to, for rejection payloads only —
 * unknown ids fold to themselves, impossible combinations to the stored id
 * (the fold's own throw is handled at the launch lanes; the ACP negotiation
 * reports the session rejection instead).
 */
function catalogFoldRequested(config: ThreadConfig, families: readonly DevinModelFamily[]): string {
  try {
    return resolveDevinModel(config, [...families]);
  } catch {
    return config.model;
  }
}

/**
 * Rank one accepted in-family variant for the stored config. Explicit
 * controls dominate (already filtered); otherwise the plain representative —
 * default context, no fast/thinking marker — wins so an unqualified family
 * choice never lands on a specialty variant by accident. Ties keep menu order.
 */
function rankAcceptedVariant(entry: CatalogVariantEntry, config: ThreadConfig): number {
  const ctx =
    config.contextSize && config.contextSize !== "default" ? config.contextSize : undefined;
  const effortRequested = config.effort !== undefined && config.effort !== "default";
  return (
    (effortRequested && entry.variant.effort === config.effort ? 8 : 0) +
    (ctx ? (entry.variant.context === ctx ? 4 : 0) : entry.variant.context === "default" ? 4 : 0) +
    (config.fast === undefined && !entry.variant.fast ? 2 : 0) +
    (config.thinking === undefined && !entry.variant.thinking ? 1 : 0)
  );
}

/**
 * Pure negotiation of the stored model against the live ACP `model` config
 * option.
 *
 * The session's accepted option values are the ONLY launch space: the
 * CLI catalog's family/effort folding (which bakes effort into variant UIDs
 * like `swe-1-7-max`) must never invent an id the live menu does not offer.
 * Instead the stored family resolves onto the ADVERTISED representative of
 * that same family, with effort carried by the separate `thought_level`
 * control the shared config sync pushes after the model (and verifies). The
 * same carrier carries an opaque Fusion pair's meaningful effort — the live
 * session exposes its own graded thought-level control for the pair and
 * echoes the level into the persisted config (checkpoint L). What
 * the ACP menu has no faithful mapping for — a fast/thinking/context shape no
 * accepted variant or independent selector carries, an effort with neither
 * an id-encoded variant nor a thought-level option, or unsupported thinking/
 * context controls against an opaque Fusion pair — is rejected or thrown visibly, never silently downgraded or
 * dropped.
 */
export function resolveDevinAcpModelNegotiation(
  families: DevinModelFamily[],
  config: ThreadConfig,
  options: unknown,
): DevinAcpModelNegotiation {
  const option = findSelectConfigOption(options, "model");
  if (!option?.id || !config.model) return { status: "no-model-option" };
  const optionId = option.id;
  const independentFast = Boolean(findFastConfigOption(options, DEVIN_ACP_FAST_CONFIG_BINDING));
  const accepted = flattenSelectOptionValues(option.options);
  const ctxWanted =
    config.contextSize && config.contextSize !== "default" ? config.contextSize : undefined;
  const effortWanted =
    config.effort !== undefined && config.effort !== "default" ? config.effort : undefined;
  const applied = (value: string): DevinAcpModelNegotiation => ({
    status: "applied",
    configId: optionId,
    value,
    ...(option.currentValue ? { currentValue: option.currentValue } : {}),
  });
  const reject = (requested: string): DevinAcpModelNegotiation => ({
    status: "rejected-by-session",
    requested,
    stored: config.model,
    accepted,
    ...(option.currentValue ? { agentValue: option.currentValue } : {}),
  });
  const unsupportedPair = (label: string): never => {
    throw new Error(`Unsupported model configuration for ${label}`);
  };
  const index = devinVariantIndex(families);
  const storedEntry = index.get(config.model);
  // 1. The session offers the stored id itself — a negotiated variant, an
  //    opaque Fusion pair, or any raw id the agent advertises. Laddered
  //    controls the accepted id does not itself carry fall through to family
  //    resolution (a faithful sibling may be advertised); a pair never takes
  //    controls without independent carriers, and an unclassifiable id never silently
  //    drops them.
  if (accepted.includes(config.model)) {
    if (storedEntry?.variant.composite) {
      // A meaningful effort rides the session's separate thought-level select
      // (the shared sync validates its membership and pushes it after the
      // model). Fast rides its exact independent speed select; other
      // meaningful controls without carriers fail visibly.
      if (hasExplicitCompositeControls(config) && !compositeControlsCarriable(config, options)) {
        unsupportedPair(storedEntry.family.label);
      }
      return applied(config.model);
    }
    if (!hasExplicitLadderControls(config)) return applied(config.model);
    if (!storedEntry) {
      // Catalog-unknown id: only a separate thought level could carry an
      // effort request; fast/context/thinking have no faithful carrier.
      if (effortWanted !== undefined && !findThoughtLevelConfig(options)) {
        return reject(config.model);
      }
      return applied(config.model);
    }
    const carried =
      (independentFast || config.fast === undefined || storedEntry.variant.fast === config.fast) &&
      (config.thinking === undefined || storedEntry.variant.thinking === config.thinking) &&
      (ctxWanted === undefined || storedEntry.variant.context === ctxWanted);
    const effortCarried =
      effortWanted === undefined ||
      storedEntry.variant.effort === effortWanted ||
      Boolean(findThoughtLevelConfig(options));
    if (carried && effortCarried) return applied(config.model);
  }
  // 2. Unreadable menu: the CLI catalog fold is the only available mapping
  //    (argv-identical semantics); it throws on impossible combinations.
  if (accepted.length === 0) {
    return applied(resolveDevinModel(config, [...families]));
  }
  // 3. Semantic family resolution against ONLY the advertised values. Catalog
  //    knowledge contributes variant attributes (fast/thinking/context/
  //    effort/composite) for accepted members — never extra choices.
  const family = storedEntry?.family;
  if (!family) return reject(config.model);
  const acceptedEntries = accepted.flatMap((id) => {
    const entry = index.get(id);
    return entry && entry.family === family ? [entry] : [];
  });
  // Opaque pair identity: a stored pair is an EXACT choice — a menu that
  // stopped offering it is a rejection, never a substitution with another
  // pair or a laddered variant of the same family.
  if (storedEntry.variant.composite || acceptedEntries.some((entry) => entry.variant.composite)) {
    // Same composite contract as step 1: a carrier-borne effort keeps the
    // exact-choice path (here: the pair is not offered, so a typed session
    // rejection), everything else still throws.
    if (hasExplicitCompositeControls(config) && !compositeControlsCarriable(config, options)) {
      unsupportedPair(family.label);
    }
    return reject(config.model);
  }
  let pool = acceptedEntries.filter((entry) => !entry.variant.composite);
  pool = pool.filter(
    (entry) =>
      (independentFast || config.fast === undefined || entry.variant.fast === config.fast) &&
      (config.thinking === undefined || entry.variant.thinking === config.thinking) &&
      (ctxWanted === undefined || entry.variant.context === ctxWanted),
  );
  if (pool.length === 0) return reject(catalogFoldRequested(config, families));
  if (effortWanted !== undefined) {
    const effortMatches = pool.filter((entry) => entry.variant.effort === effortWanted);
    if (effortMatches.length > 0) {
      pool = effortMatches;
    } else if (!findThoughtLevelConfig(options)) {
      // No id-encoded variant for the requested effort AND no separate
      // thought-level control: the effort cannot be honored — reject instead
      // of silently prompting on a different level.
      return reject(catalogFoldRequested(config, families));
    }
    // Otherwise the effort rides `thought_level`, pushed by the shared sync
    // right after the model and verified against the agent's reply.
  }
  const best = Math.max(...pool.map((entry) => rankAcceptedVariant(entry, config)));
  const ranked = pool.filter((entry) => rankAcceptedVariant(entry, config) === best);
  const current = option.currentValue;
  const pick =
    current !== undefined && ranked.some((entry) => entry.id === current) ? current : ranked[0]!.id;
  return applied(pick);
}

/** The shape the shared ACP `resolveModelConfig` seam consumes. */
export type DevinAcpModelResolver = (
  config: ThreadConfig,
  sessionOptions: unknown,
) => ReturnType<typeof resolveDevinAcpModel>;

/**
 * Provider-owned proof for the shared strict target validation: does the
 * model the session currently acknowledges — the `model` select's own
 * current value in `sessionOptions` — itself carry the requested graded
 * effort? Membership is catalog variant classification; the wire id is
 * looked up in the parsed catalog, never parsed. Consulted only after a
 * model acknowledgement, against the refreshed options, so a switch's
 * deferred carrier check has resolved: a UID-encoded level survives a
 * target inventory with no independent reasoning select, while a composite
 * pair (whose exact identity, not a level, is the choice) and unknown or
 * default requests never claim one — a boolean thinking toggle is not a
 * graded carrier and is not consulted here.
 */
export function devinAcknowledgedModelCarriesEffort(
  families: readonly DevinModelFamily[],
  config: ThreadConfig,
  sessionOptions: unknown,
): boolean {
  if (!config.effort || config.effort === "default") return false;
  const acknowledged = findSelectConfigOption(sessionOptions, "model")?.currentValue;
  if (!acknowledged) return false;
  const entry = devinVariantIndex([...families]).get(acknowledged);
  if (!entry || entry.variant.composite) return false;
  return canonicalizeEffortId(entry.variant.effort) === canonicalizeEffortId(config.effort);
}

export interface DevinAcpModelResolverOptions {
  families: readonly DevinModelFamily[];
  /**
   * Surfaced immediately before the typed rejection throws — a host-side
   * notification hook, never a substitute for the throw itself.
   */
  onRejected?: (
    rejection: Extract<DevinAcpModelNegotiation, { status: "rejected-by-session" }>,
  ) => void;
  /**
   * Cloud relay target. The cloud `model` role is the `devin_version` select
   * (there is no `model` option and no thought level), resolved exclusively
   * through the cloud session-config contracts: the private native-default
   * intent resolves to the option's own live `currentValue` (never an
   * invented id), and an explicit id is pushed only when the live menu
   * advertises it exactly. The local CLI catalog is never consulted.
   */
  cloud?: boolean | undefined;
}

/**
 * Typed rejection for an explicit stored model selection the live session
 * does not offer. `createDevinAcpModelResolver` throws this instead of
 * returning `undefined`: on `undefined` the shared ACP turn path falls back
 * to the legacy `session/set_model` request (which this build answers
 * -32601) and — without strict config selection — swallows that failure and
 * prompts on whatever model the agent happens to hold. A callback alone
 * cannot prevent that silent downgrade, so the rejection must throw; the
 * shared seam wraps it in `AcpConfigSelectionError`.
 */
export class DevinAcpModelSelectionRejectedError extends Error {
  constructor(
    readonly rejection: Extract<DevinAcpModelNegotiation, { status: "rejected-by-session" }>,
  ) {
    super(
      `The Devin session does not offer the selected model ${JSON.stringify(rejection.requested)}` +
        (rejection.agentValue
          ? ` (the agent is currently on ${JSON.stringify(rejection.agentValue)})`
          : ""),
    );
    this.name = "DevinAcpModelSelectionRejectedError";
  }
}

/**
 * Cloud-target model resolution (see {@link DevinAcpModelResolverOptions.cloud}).
 * The `devin_version` option is the model role; both the native-default
 * intent and explicit ids resolve against the LIVE advertised options only.
 */
function resolveDevinCloudModelSelection(
  config: ThreadConfig,
  sessionOptions: unknown,
  onRejected: DevinAcpModelResolverOptions["onRejected"],
): { configId: string; value: string; currentValue?: string } | undefined {
  const view = classifyDevinAcpCloudSessionConfig(sessionOptions).devinVersion;
  if (isDevinCloudDefaultModelId(config.model)) {
    // Omit the model entirely when the relay advertises no version option —
    // the agent keeps its own default (strict selection surfaces the gap
    // when a session somehow carries none).
    if (!view?.currentValue) return undefined;
    // Resolve the intent to the option's own current value: an explicit
    // no-op set that pins the account's ACTUAL cloud version, never an
    // invented id sent as the native model.
    return { configId: view.id, value: view.currentValue, currentValue: view.currentValue };
  }
  const push = resolveDevinAcpCloudVersionConfigValue(config, sessionOptions);
  if (push) return push;
  const rejection = {
    status: "rejected-by-session" as const,
    requested: config.model,
    stored: config.model,
    accepted: view?.optionValues ?? [],
    ...(view?.currentValue ? { agentValue: view.currentValue } : {}),
  };
  onRejected?.(rejection);
  throw new DevinAcpModelSelectionRejectedError(rejection);
}

/**
 * Build the `resolveModelConfig` callback Devin hands to the structured ACP
 * session.
 *
 * Contract: an applied negotiation returns the push value; no stored
 * selection (`no-model-option`) returns `undefined` so the agent keeps its
 * own model; an explicit selection the session does not offer throws
 * {@link DevinAcpModelSelectionRejectedError} — the turn is rejected before
 * any prompt rather than run on a different model. Compose with the shared
 * `strictConfigSelection` session option so later config-option write
 * failures reject the turn the same way instead of being logged and
 * swallowed.
 */
export function createDevinAcpModelResolver({
  families,
  onRejected,
  cloud,
}: DevinAcpModelResolverOptions): DevinAcpModelResolver {
  return (config, sessionOptions) => {
    // An empty stored model carries no explicit selection: pushing nothing
    // lets the agent keep its own model (synthetic configs use model: "").
    if (!config.model) return undefined;
    if (cloud) return resolveDevinCloudModelSelection(config, sessionOptions, onRejected);
    const outcome = resolveDevinAcpModelNegotiation([...families], config, sessionOptions);
    if (outcome.status === "applied") {
      return {
        configId: outcome.configId,
        value: outcome.value,
        ...(outcome.currentValue ? { currentValue: outcome.currentValue } : {}),
      };
    }
    if (outcome.status !== "rejected-by-session") return undefined;
    onRejected?.(outcome);
    throw new DevinAcpModelSelectionRejectedError(outcome);
  };
}

/**
 * Legacy direct resolver (unchanged behavior): resolves the push value or
 * `undefined` when the session does not offer the requested model. New
 * compositions should prefer {@link createDevinAcpModelResolver} so the
 * rejection is surfaced instead of silently retained.
 */
export function resolveDevinAcpModel(
  families: DevinModelFamily[],
  config: ThreadConfig,
  options: unknown,
) {
  const outcome = resolveDevinAcpModelNegotiation(families, config, options);
  if (outcome.status !== "applied") return undefined;
  return {
    configId: outcome.configId,
    value: outcome.value,
    ...(outcome.currentValue ? { currentValue: outcome.currentValue } : {}),
  };
}
