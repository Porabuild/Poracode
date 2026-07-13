import { looksSignedOut } from "@poracode/agents-usage";

/**
 * Parse the opencode.ai Zen pay-as-you-go balance out of the account dashboard
 * HTML. opencode.ai server-renders its `billing.get` query into the page where
 * the balance is the raw `balance` field in 1e8 units, with no "$" — so we match
 * several serialization shapes. Also exposes a value-masked page-diagnostics
 * helper for the dev logger. Pure string parsing; never logs the balance itself.
 */

function doubleFromBalanceValue(value: unknown): number | undefined {
  if (typeof value === "boolean") return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim().replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function isExplicitBalanceKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return [
    "zenbalance",
    "zencurrentbalance",
    "currentbalance",
    "currentbalanceusd",
    "balanceusd",
    "usdbalance",
  ].includes(normalized);
}

function findZenBalance(value: unknown): number | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const balance = findZenBalance(item);
      if (balance !== undefined) return balance;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  for (const [key, item] of Object.entries(value)) {
    if (isExplicitBalanceKey(key)) {
      const balance = doubleFromBalanceValue(item);
      if (balance !== undefined) return balance;
    }
    const nested = findZenBalance(item);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

/** Matches `"<key>": <number>` style pairs (the keys are word-ish, values numeric). */
const KEYED_NUMBER_RE =
  /["']?([A-Za-z][A-Za-z0-9_]{2,40})["']?\s*:\s*"?\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)"?/g;

/**
 * Find the balance when it is carried as a keyed number in serialized data
 * embedded in the page (e.g. SolidStart hydration), where there is no "$" prefix
 * and a human "balance" label may be nowhere near it — so neither the whole-body
 * `JSON.parse` (the HTML isn't valid JSON) nor the label-proximity patterns
 * catch it. Restricted to the same explicit balance keys as {@link findZenBalance}
 * (e.g. `currentBalanceUsd`), so a bare `balance` that might be cents is ignored.
 */
function balanceFromEmbeddedKeys(text: string): number | undefined {
  for (const [, key, value] of text.matchAll(KEYED_NUMBER_RE)) {
    if (key && value && isExplicitBalanceKey(key)) {
      const parsed = Number(value.replace(/,/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

/** 1e8 raw units per USD in opencode.ai's billing store (see the console's `formatBalance`). */
const OPENCODE_BALANCE_UNITS_PER_USD = 100_000_000;
/** Sibling keys that confirm a bare `balance:` match is the opencode.ai billing object. */
const BILLING_SIBLING_RE = /reloadAmount|monthlyUsage|monthlyLimit|customerID|paymentMethod/i;

/**
 * opencode.ai server-renders its `billing.get` query into the page (SolidStart
 * SSR), where the balance is the raw `balance` field in 1e8 units — $1 =
 * 100,000,000, with no "$" — per the console's `formatBalance`. Match that exact
 * field (a lookbehind rejects `currentBalance`/`balanceUsd`; a nearby billing
 * sibling key guards against an unrelated `balance`) and convert to dollars.
 */
function balanceFromBillingPayload(text: string): number | undefined {
  for (const match of text.matchAll(/(?<![A-Za-z])balance["']?\s*:\s*([0-9]{4,})/gi)) {
    const raw = match[1];
    const at = match.index ?? 0;
    if (!raw) continue;
    const window = text.slice(Math.max(0, at - 200), at + 200);
    if (!BILLING_SIBLING_RE.test(window)) continue;
    const usd = Number(raw) / OPENCODE_BALANCE_UNITS_PER_USD;
    if (Number.isFinite(usd) && usd >= 0 && usd < 1_000_000) {
      return Math.round(usd * 100) / 100;
    }
  }
  return undefined;
}

export function parseZenBalance(text: string): number | undefined {
  try {
    const balance = findZenBalance(JSON.parse(text));
    if (balance !== undefined) return balance;
  } catch {
    // Not a pure-JSON body (e.g. an HTML dashboard); fall through.
  }
  const billing = balanceFromBillingPayload(text);
  if (billing !== undefined) return billing;
  const embedded = balanceFromEmbeddedKeys(text);
  if (embedded !== undefined) return embedded;
  const localized = text.match(
    /(?:current\s+balance|zen\s+balance|現在の残高)[^$]{0,80}\$\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i,
  );
  const nearby =
    localized ?? text.match(/(?:balance|残高)[\s\S]{0,120}?\$\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i);
  if (!nearby?.[1]) return undefined;
  const parsed = Number(nearby[1].replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * A short, value-masked excerpt around the first `balance:` in the body, so the
 * dev log reveals the serialization *shape* (key names, formatting) without
 * writing the actual balance or any account ids: every digit run becomes
 * `<Nd>` and every long id-like token becomes `<id>`.
 */
function balanceStructureExcerpt(body: string): string | undefined {
  const match = /(?<![A-Za-z])balance["']?\s*:/i.exec(body);
  if (!match) return undefined;
  return body
    .slice(Math.max(0, match.index - 60), match.index + 120)
    .replace(/[0-9]+/g, (digits) => `<${digits.length}d>`)
    .replace(/[A-Za-z0-9_]{16,}/g, "<id>");
}

/**
 * Non-sensitive shape of the workspace page, for the dev file logger only, to
 * diagnose why a balance fails to parse without writing account data: HTTP
 * status, body length, the signed-out heuristic, `$`/`balance` token counts, the
 * explicit balance key names present, and a value-masked excerpt. Never includes
 * the balance itself or any id.
 */
export function workspacePageDiagnostics(status: number, body: string): Record<string, unknown> {
  const keys = new Set<string>();
  for (const [, key] of body.matchAll(KEYED_NUMBER_RE)) {
    if (key && isExplicitBalanceKey(key)) keys.add(key);
  }
  return {
    status,
    signedOut: looksSignedOut(body),
    length: body.length,
    dollarCount: (body.match(/\$/g) ?? []).length,
    balanceTokenCount: (body.match(/balance/gi) ?? []).length,
    balanceKeysPresent: [...keys],
    embeddedBalanceMatched: balanceFromEmbeddedKeys(body) !== undefined,
    billingPayloadMatched: balanceFromBillingPayload(body) !== undefined,
    balanceContext: balanceStructureExcerpt(body),
  };
}
