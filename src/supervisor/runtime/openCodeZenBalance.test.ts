import { describe, expect, it } from "vitest";
import { parseZenBalance } from "./openCodeZenBalance";

/**
 * The opencode.ai console server-renders its `billing.get` query into the page.
 * The balance is the raw `balance` field in 1e8 units ($1 = 100,000,000), per
 * the console's `formatBalance` (amount / 100000000). These cases lock the
 * conversion and the guard that keeps an unrelated `balance` from matching.
 */
describe("parseZenBalance", () => {
  it("reads the SSR'd billing balance (1e8 units) as dollars", () => {
    const body =
      `<script>window._$HY={};</script>...` +
      `{customerID:"cus_abc",balance:900000000,reload:!1,reloadAmount:2000000000,` +
      `monthlyLimit:null,monthlyUsage:512300000}...`;
    expect(parseZenBalance(body)).toBe(9);
  });

  it("handles fractional balances", () => {
    const body = `{customerID:"cus_x",paymentMethodLast4:"4242",balance:753000000,reloadAmount:1000000000}`;
    expect(parseZenBalance(body)).toBe(7.53);
  });

  it("ignores a bare balance with no billing siblings nearby", () => {
    expect(parseZenBalance(`{"items":[{"balance":900000000}]}`)).toBeUndefined();
  });

  it("does not confuse currentBalanceUsd (already dollars) with the raw field", () => {
    expect(parseZenBalance(`{"currentBalanceUsd": 9}`)).toBe(9);
  });

  it("still reads a visible 'Current balance $X' label", () => {
    expect(parseZenBalance(`<span>Current balance <b>$12.34</b></span>`)).toBe(12.34);
  });

  it("returns undefined when there is no balance anywhere", () => {
    expect(parseZenBalance(`<html><body>signed in, nothing here</body></html>`)).toBeUndefined();
  });
});
