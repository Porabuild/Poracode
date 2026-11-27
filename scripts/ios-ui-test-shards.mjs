#!/usr/bin/env node
// Pure planning helpers for evidence-based iOS UI test sharding. The compiled
// test inventory comes from `xcodebuild -enumerate-tests` (flat JSON) and is
// the authoritative list of enabled mock cases. This module only parses,
// normalizes, sorts, and partitions that inventory — no simulator or Xcode
// work lives here, so the planner is fully unit-testable.

export const IOS_UI_SHARD_ENV = "NATIVE_E2E_IOS_SHARD";

/**
 * Parse NATIVE_E2E_IOS_SHARD strictly as a one-based `index/count` selector.
 * Returns null when omitted/empty (the unsharded journey — including the
 * real-peer qualification — keeps running the full selector set). Throws on
 * any malformed value so a bad env fails before any tool is spawned.
 */
export function parseIosUiShard(rawValue) {
  const text = rawValue == null ? "" : String(rawValue).trim();
  if (text === "") return null;
  const match = /^([1-9]\d*)\/([1-9]\d*)$/.exec(text);
  if (!match) {
    throw new Error(
      `${IOS_UI_SHARD_ENV} must be "index/count" (one-based, e.g. "1/4"), received "${rawValue}"`,
    );
  }
  const index = Number(match[1]);
  const count = Number(match[2]);
  if (
    !Number.isSafeInteger(index) ||
    !Number.isSafeInteger(count) ||
    index < 1 ||
    count < 1 ||
    index > count
  ) {
    throw new Error(`${IOS_UI_SHARD_ENV} must satisfy 1 <= index <= count, received "${rawValue}"`);
  }
  return { index, count };
}

/**
 * Normalize one compiled test identifier: strip a single trailing `()` (the
 * flat enumeration appends it to method identifiers) and require exactly three
 * nonempty slash-separated components — target/class/method — with no
 * whitespace or parentheses. A class-only selector (e.g.
 * `NativeE2ETests/NativeFamilyJourneyUITests`) would make `-only-testing`
 * widen a shard past its assigned method and break the disjoint coverage
 * guarantee, so malformed discovery is rejected rather than silently trusted.
 */
function normalizeIdentifier(raw) {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error("compiled test inventory has a non-string or empty enabled test identifier");
  }
  const trimmed = raw.trim();
  const normalized = trimmed.endsWith("()") ? trimmed.slice(0, -2) : trimmed;
  if (normalized === "") {
    throw new Error("compiled test inventory has an empty normalized test identifier");
  }
  if (!/^[^\s/()]+\/[^\s/()]+\/[^\s/()]+$/.test(normalized)) {
    throw new Error(
      `compiled test inventory has a malformed test identifier (expected target/class/method): "${normalized}"`,
    );
  }
  return normalized;
}

/**
 * Parse an `xcodebuild -enumerate-tests` flat JSON inventory and return the
 * deterministically sorted, normalized list of enabled test identifiers.
 * disabledTests are ignored. Rejects an absent/malformed inventory, a
 * non-empty `errors` array, no enabled tests, duplicate normalized IDs, and
 * any identifier that is not exactly a target/class/method leaf. Accepts
 * either the raw JSON string or a parsed object.
 */
export function parseCompiledTestIdentifiers(rawInventory) {
  let inventory = rawInventory;
  if (typeof inventory === "string") {
    try {
      inventory = JSON.parse(inventory);
    } catch (error) {
      throw new Error(
        `compiled test inventory is not valid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }
  }
  if (!inventory || typeof inventory !== "object" || Array.isArray(inventory)) {
    throw new Error("compiled test inventory is missing or is not a JSON object");
  }
  if (!Array.isArray(inventory.errors)) {
    throw new Error("compiled test inventory is missing its errors array");
  }
  if (inventory.errors.length > 0) {
    throw new Error(
      `compiled test inventory reported ${inventory.errors.length} enumeration error(s)`,
    );
  }
  if (!Array.isArray(inventory.values) || inventory.values.length === 0) {
    throw new Error("compiled test inventory is missing its values array");
  }
  const identifiers = [];
  for (const value of inventory.values) {
    if (!value || !Array.isArray(value.enabledTests)) {
      throw new Error("compiled test inventory value is missing its enabledTests array");
    }
    for (const test of value.enabledTests) {
      identifiers.push(normalizeIdentifier(test?.identifier));
    }
  }
  if (identifiers.length === 0) {
    throw new Error("compiled test inventory has no enabled tests");
  }
  identifiers.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (let i = 1; i < identifiers.length; i += 1) {
    if (identifiers[i] === identifiers[i - 1]) {
      throw new Error(
        `compiled test inventory has a duplicate normalized identifier: ${identifiers[i]}`,
      );
    }
  }
  return identifiers;
}

/**
 * Build the shard plan from a compiled inventory. `shard` is a parsed
 * { index, count }. Identifiers are assigned round-robin from the sorted list:
 * position i goes to shard `index` when `(i % count) === index - 1`, so the
 * `count` shards are disjoint and exhaustive. An empty selection (a valid
 * config that matches no tests) is rejected rather than silently running the
 * broad selector set. Returns the sorted full list plus this shard's slice.
 */
export function planIosUiShard(rawInventory, shard) {
  if (
    !shard ||
    !Number.isSafeInteger(shard.index) ||
    !Number.isSafeInteger(shard.count) ||
    shard.index < 1 ||
    shard.count < 1 ||
    shard.index > shard.count
  ) {
    throw new Error(
      "iOS UI test shard must be a one-based { index, count } with 1 <= index <= count",
    );
  }
  const identifiers = parseCompiledTestIdentifiers(rawInventory);
  const assignedIdentifiers = identifiers.filter(
    (_identifier, position) => position % shard.count === shard.index - 1,
  );
  if (assignedIdentifiers.length === 0) {
    throw new Error(
      `iOS UI test shard ${shard.index}/${shard.count} selected no tests from ${identifiers.length} enabled tests`,
    );
  }
  return {
    totalIdentifiers: identifiers.length,
    identifiers,
    assignedIdentifiers,
  };
}
