import { randomBytes } from "node:crypto";
import { configured } from "../../../../lib/feedback";

export async function GET() {
  // Packaged Electron and local standalone clients are trusted local documents,
  // not authenticated app identities. Turnstile and intake quotas still apply.
  const nonce = randomBytes(16).toString("base64");
  const siteKey = JSON.stringify(
    configured() ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY : "",
  ).replaceAll("<", "\\u003c");
  return new Response(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;background:#24242b;color:#aaa;font:12px system-ui}#challenge{min-height:65px}</style></head><body><div id="challenge"></div><script nonce="${nonce}">
let parentOrigin = null, rendered = false, widget, widgetSize;
function size() { return innerWidth < 300 ? "compact" : "normal"; }
function ready() { parent.postMessage({type:"poracode.feedback.verification.ready",height:size() === "compact" ? 140 : 65}, "*"); }
function trusted(origin) {
  if (origin === "null" || origin === "https://poracode.com") return true;
  try { const u = new URL(origin); return u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname); } catch { return false; }
}
function report(token, error = false) {
  if (parentOrigin !== null) parent.postMessage({type:"poracode.feedback.verification",token,error}, parentOrigin === "null" ? "*" : parentOrigin);
}
function render() {
  if (rendered || parentOrigin === null || !window.turnstile) return;
  const sitekey = ${siteKey};
  if (!sitekey) { report("", true); return; }
  rendered = true;
  widgetSize = size();
  widget = turnstile.render("#challenge", {sitekey,action:"feedback",theme:"dark",size:widgetSize,callback:token=>report(token),"expired-callback":()=>report(""),"error-callback":()=>report("",true)});
}
window.addEventListener("message", event => {
  if (event.source !== parent || !trusted(event.origin) || event.data?.type !== "poracode.feedback.verify") return;
  parentOrigin = event.origin;
  render();
});
window.feedbackChallengeReady = render;
window.addEventListener("resize", () => { if (rendered && size() !== widgetSize) { turnstile.remove(widget); rendered = false; report(""); render(); } ready(); });
ready();
</script><script nonce="${nonce}" src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&amp;onload=feedbackChallengeReady" defer></script></body></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}' https://challenges.cloudflare.com; style-src 'unsafe-inline'; frame-src https://challenges.cloudflare.com; connect-src https://challenges.cloudflare.com; img-src data: https://challenges.cloudflare.com; base-uri 'none'; form-action 'none'; frame-ancestors 'self' file: http://localhost:* http://127.0.0.1:* https://poracode.com`,
      },
    },
  );
}
