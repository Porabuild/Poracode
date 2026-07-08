import type { CdpSession } from "./cdp/cdpClient";
import { evalJs } from "./cdp/tools";

/**
 * Agent "presence" overlay: a page-injected brand cursor that glides smoothly to
 * the element the agent is about to act on, plus a click ripple. It makes agent
 * activity visible (like Claude/Codex). Installed and animated via CDP
 * `Runtime.evaluate`, so the SAME code drives both the embedded browser and the
 * external Chrome — both expose a {@link CdpSession}.
 *
 * The cursor is a single persistent `<div>` (position:fixed, pointer-events:none,
 * max z-index) that transitions its transform; moving it re-triggers the glide.
 */

// Glide duration (ms). Kept short so callers can AWAIT it (cursor lands, THEN
// the action fires — "move then click") without adding noticeable latency. The
// injected transition duration is driven by this same value.
const GLIDE_MS = 180;

// Hard ceiling (ms) on how long an awaited glide may delay the action it
// precedes. A normal *visible* glide settles in ~GLIDE_MS + a CDP round-trip
// (~250ms); this cap only ever trips on a genuinely wedged page. It also shields
// the embedded transport, whose `send` has no timeout of its own. See
// glideBounded — the visibility gate below already makes hidden pages resolve
// instantly, so this is a backstop, not the common path.
const GLIDE_WAIT_CAP_MS = 600;

// Idempotent installer + ripple, defined once per call (cheap; no globals to
// leak across navigations since a reload wipes them and we re-install on use).
// The transition duration is (re)set per glide in cursorGlideExpr so tuning
// GLIDE_MS is enough — the persistent element keeps whatever it was created with.
const INSTALL = `
function __pcCursor(){
  const ID="__poracode_cursor__";
  let el=document.getElementById(ID);
  if(!el){
    el=document.createElement("div"); el.id=ID; el.setAttribute("aria-hidden","true");
    el.style.cssText="position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;will-change:transform;transform:translate(-80px,-80px)";
    el.innerHTML='<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 2.5l14 7-6 1.7L8.8 17 4 2.5z" fill="#7d6cf6" stroke="#ffffff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    (document.body||document.documentElement).appendChild(el);
  }
  return el;
}
function __pcRipple(x,y){
  const d=document.createElement("div"); d.setAttribute("aria-hidden","true");
  d.style.cssText="position:fixed;left:"+x+"px;top:"+y+"px;z-index:2147483646;pointer-events:none;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:rgba(125,108,246,.45);transform:scale(1);opacity:.9;transition:transform .5s ease-out,opacity .5s ease-out";
  (document.body||document.documentElement).appendChild(d);
  requestAnimationFrame(function(){ d.style.transform="scale(3.5)"; d.style.opacity="0"; });
  setTimeout(function(){ try{ d.remove(); }catch(e){} }, 560);
}`;

/** JS that ensures the cursor, glides it to `targetExpr`'s center, then ripples.
 *  `targetExpr` must evaluate to the element (or null). Resolves after the glide
 *  lands so callers can await it and fire the action right as the cursor arrives.
 *
 *  Returns IMMEDIATELY when the page is hidden: a presence cursor nobody can see
 *  is pointless, and hidden tabs pause requestAnimationFrame + throttle timers —
 *  so awaiting a glide there would otherwise stall the action (external Chrome's
 *  workspace is a background tab; the internal webview goes hidden when the app
 *  window is minimized). The rAF wait below is also capped so a mid-glide hide
 *  can't wedge it. */
export function cursorGlideExpr(targetExpr: string, glideMs = GLIDE_MS): string {
  return `(async () => {
    ${INSTALL}
    if (document.hidden) return { ok: false, hidden: true };
    const el = ${targetExpr};
    if (!el) return { ok: false };
    const c = __pcCursor();
    try { el.scrollIntoView({ block: "center", inline: "center" }); } catch (e) {}
    await new Promise(function (res) {
      var done = false;
      function go() { if (!done) { done = true; res(null); } }
      requestAnimationFrame(go);
      setTimeout(go, 50);
    });
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    c.style.transition = "transform " + ${glideMs} + "ms cubic-bezier(.22,.61,.36,1)";
    c.style.transform = "translate(" + (x - 2) + "px," + (y - 1) + "px)";
    await new Promise(function (res) { setTimeout(res, ${glideMs}); });
    __pcRipple(x, y);
    return { ok: true, x: x, y: y };
  })()`;
}

/** Run a glide eval but never let it delay its caller past GLIDE_WAIT_CAP_MS.
 *  The glide is a best-effort visual; the action it precedes must fire promptly
 *  even if the eval stalls (a wedged/visible page, or a transport with no
 *  timeout of its own). Never throws. The eval keeps running in the page after a
 *  cap-out; we simply stop awaiting it. */
function glideBounded(run: () => Promise<unknown>): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const timer = setTimeout(finish, GLIDE_WAIT_CAP_MS);
    run()
      .catch(() => {})
      .finally(() => {
        clearTimeout(timer);
        finish();
      });
  });
}

/** Glide the presence cursor to a CSS selector (best-effort; never throws).
 *  Await this BEFORE the action so the cursor lands first ("move then click");
 *  the glide is short (GLIDE_MS) and hard-capped (GLIDE_WAIT_CAP_MS) so it can
 *  never stall the action. */
export async function glideCursorToSelector(cdp: CdpSession, selector: string): Promise<void> {
  await glideBounded(() =>
    evalJs(cdp, cursorGlideExpr(`document.querySelector(${JSON.stringify(selector)})`)),
  );
}

/** Glide the presence cursor to a snapshot/find @e ref (best-effort). */
export async function glideCursorToRef(cdp: CdpSession, ref: string): Promise<void> {
  await glideBounded(() =>
    evalJs(
      cdp,
      cursorGlideExpr(`(window.__lcRefs && window.__lcRefs.get(${JSON.stringify(ref)}))`),
    ),
  );
}
