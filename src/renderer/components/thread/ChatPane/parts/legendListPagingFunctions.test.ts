import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

// Exercise the pinned dependency's actual core functions. Native scroll events
// may coalesce a layout adjustment with the next gesture; jsdom's scrollTo
// fixture delivers both events, so the mounted suite cannot model that loss.
const require = createRequire(import.meta.url);
const source = readFileSync(require.resolve("@legendapp/list/react"), "utf8");
function section(start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}
const functions = [
  section("var HYSTERESIS_MULTIPLIER", "// src/core/recalculateSettledScroll.ts"),
  section("function requestAdjust(ctx,", "// src/core/mvcp.ts"),
  section("function updateScroll(ctx,", "// src/core/scrollTo.ts"),
  section("var ScrollAdjustHandler = class", "// src/core/updateContentInsetEndAdjustment.ts"),
].join("\n");

function observe(options: {
  consumeAdjustment?: boolean;
  offset: number;
  maximum: number;
  scrolling?: boolean;
  pendingNativeAdjustment?: boolean;
}) {
  return runInNewContext(`
    const EDGE_POSITION_EPSILON = 1;
    const ReactDOM = {flushSync: fn => fn()};
    function getContentSize(ctx) { return ctx.state.totalSize; }
    function getContentInsetEnd() { return 0; }
    function set$(ctx, key, value) { ctx.values.set(key, value); }
    function peek$(ctx, key) { return ctx.values.get(key); }
    function resolvePendingNativeMVCPAdjust() { return false; }
    function updateAdaptiveRender() {}
    function getScrollVelocity() { return 0; }
    function isInMVCPActiveMode() { return false; }
    function scheduleFullDrawDistancePrewarm() {}
    function doMaintainScrollAtEnd() {}
    ${functions}
    let calls = 0;
    const ctx = {values: new Map([['readyToRender', true]]), state: {
      props: {data: Array.from({length: 11}, (_, id) => ({id})),
        onStartReachedThreshold: .75, onEndReachedThreshold: .5,
        maintainScrollAtEndThreshold: 0, onStartReached() { calls++; }},
      refScroller: {current: {getMaxScrollOffset() { return ${options.maximum}; }}},
      scroll: 0, scrollLength: 692, totalSize: 23976, queuedInitialLayout: true,
      didFinishInitialScroll: true, edgeReachedGate: 'prepared',
      isStartReached: false, isEndReached: false, scrollHistory: [],
      lastScrollAdjustForHistory: 0
    }};
    ctx.state.scrollAdjustHandler = new ScrollAdjustHandler(ctx);
    requestAdjust(ctx, 11868);
    ctx.state.scrollingTo = ${options.scrolling ? "{}" : "undefined"};
    ctx.state.pendingNativeMVCPAdjust = ${options.pendingNativeAdjustment ? "{}" : "undefined"};
    ${options.consumeAdjustment ? "updateScroll(ctx, 11868, false, {fromNativeScrollEvent: true});" : ""}
    updateScroll(ctx, ${options.offset}, false, {fromNativeScrollEvent: true});
    ({calls, scroll: ctx.state.scroll,
      adjustment: ctx.state.scrollAdjustHandler.getAdjust()});
  `) as { calls: number; scroll: number; adjustment: number };
}

describe("actual LegendList coalesced paging events", () => {
  it.each([false, true])(
    "recognizes user movement with adjustment event delivered: %s",
    (consume) => {
      expect(observe({ consumeAdjustment: consume, offset: 0, maximum: 23284 })).toEqual({
        calls: 1,
        scroll: 0,
        adjustment: 11868,
      });
    },
  );

  it.each([11868, 10200, 0])(
    "does not treat a correction clamped to %s as user input",
    (maximum) => {
      expect(observe({ offset: maximum, maximum }).calls).toBe(0);
    },
  );

  it.each(["scrolling", "pendingNativeAdjustment"] as const)("preserves the %s guard", (guard) => {
    expect(observe({ offset: 0, maximum: 23284, [guard]: true }).calls).toBe(0);
  });
});
