export function buildPickerScript(tabId: string, commitOrigin: string): string {
  const payload = JSON.stringify({ tabId, commitOrigin });
  return `(() => {
  if (window.__lcPickerActive) {
    return Promise.resolve({ kind: "cancelled" });
  }
  window.__lcPickerActive = true;
  const ctx = ${payload};
  return new Promise((resolve) => {

  const host = document.createElement("div");
  host.setAttribute("data-lc-picker", "");
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = \`
    .hl { position: absolute; border: 2px solid #38bdf8; background: rgba(56,189,248,0.18); border-radius: 2px; transition: all 70ms ease-out; pointer-events: none; box-sizing: border-box; }
    .scrim { position: absolute; inset: 0; cursor: crosshair; pointer-events: auto; background: transparent; }
    .banner { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); padding: 6px 10px; font: 12px/1.2 ui-sans-serif, system-ui, sans-serif; background: rgba(15,23,42,0.92); color: #e2e8f0; border-radius: 999px; pointer-events: none; }
    .sel { position: absolute; padding: 4px 8px; font: 11px/1.3 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: rgba(15,23,42,0.94); color: #38bdf8; border-radius: 4px; pointer-events: none; max-width: 480px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; box-shadow: 0 1px 4px rgba(0,0,0,0.4); }
  \`;
  shadow.appendChild(style);
  const scrim = document.createElement("div");
  scrim.className = "scrim";
  shadow.appendChild(scrim);
  const hl = document.createElement("div");
  hl.className = "hl";
  hl.style.display = "none";
  shadow.appendChild(hl);
  const selLabel = document.createElement("div");
  selLabel.className = "sel";
  selLabel.style.display = "none";
  shadow.appendChild(selLabel);
  const banner = document.createElement("div");
  banner.className = "banner";
  banner.textContent = "Click to pick element - Esc to cancel";
  shadow.appendChild(banner);
  document.documentElement.appendChild(host);

  let done = false;

  function teardown() {
    window.__lcPickerActive = false;
    host.remove();
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("__poracode_picker_cancel", onCancel, true);
    scrim.removeEventListener("mousemove", onMove, true);
    scrim.removeEventListener("click", onClick, true);
  }

  function send(result) {
    if (done) return;
    done = true;
    teardown();
    resolve(result);
  }

  function isAutoLikeClass(c) {
    if (!c) return true;
    if (c.length > 24) return true;
    if (/^[a-z0-9_-]+$/i.test(c) && /[0-9]/.test(c) && /[a-zA-Z]/.test(c) && c.length >= 6) {
      const digits = (c.match(/[0-9]/g) || []).length;
      if (digits / c.length > 0.25) return true;
    }
    return false;
  }

  function cssEscape(s) {
    if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s);
    return s.replace(/[^a-zA-Z0-9_-]/g, "\\\\$&");
  }

  function shortestSelector(el) {
    if (!el || el.nodeType !== 1) return "";
    if (el.id && !/^\\d/.test(el.id)) {
      const sel = "#" + cssEscape(el.id);
      try { if (document.querySelectorAll(sel).length === 1) return sel; } catch {}
    }
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node.tagName.toLowerCase() !== "html") {
      let part = node.tagName.toLowerCase();
      const classes = Array.from(node.classList || []).filter((c) => !isAutoLikeClass(c)).slice(0, 3);
      if (classes.length > 0) {
        part += "." + classes.map(cssEscape).join(".");
      }
      const parent = node.parentElement;
      if (parent) {
        const sibs = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
        if (sibs.length > 1) {
          const idx = sibs.indexOf(node) + 1;
          part += ":nth-of-type(" + idx + ")";
        }
      }
      parts.unshift(part);
      const candidate = parts.join(" > ");
      try {
        if (document.querySelectorAll(candidate).length === 1) {
          return candidate;
        }
      } catch {}
      node = parent;
      if (parts.length > 8) break;
    }
    return parts.join(" > ");
  }

  function pickAt(x, y) {
    const els = document.elementsFromPoint(x, y) || [];
    for (const el of els) {
      if (el === host) continue;
      if (el.getRootNode && el.getRootNode() === shadow) continue;
      return el;
    }
    return null;
  }

  let current = null;

  function positionSelectorLabel(r) {
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    const labelRect = selLabel.getBoundingClientRect();
    const labelH = labelRect.height || 22;
    const gap = 4;
    let top;
    if (r.bottom + gap + labelH <= vh) {
      top = r.bottom + gap;
    } else if (r.top - gap - labelH >= 0) {
      top = r.top - gap - labelH;
    } else {
      top = Math.max(0, Math.min(vh - labelH, r.top + gap));
    }
    const labelW = labelRect.width || 0;
    const left = Math.max(4, Math.min(r.left, Math.max(4, vw - labelW - 4)));
    selLabel.style.top = top + "px";
    selLabel.style.left = left + "px";
  }

  function onMove(e) {
    const el = pickAt(e.clientX, e.clientY);
    if (!el || el === current) return;
    current = el;
    const r = el.getBoundingClientRect();
    hl.style.display = "block";
    hl.style.left = r.left + "px";
    hl.style.top = r.top + "px";
    hl.style.width = r.width + "px";
    hl.style.height = r.height + "px";
    const sel = shortestSelector(el) || el.tagName.toLowerCase();
    selLabel.textContent = sel;
    selLabel.style.display = "block";
    positionSelectorLabel(r);
  }

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const el = current || pickAt(e.clientX, e.clientY);
    if (!el) {
      send({ kind: "cancelled" });
      return;
    }
    const rect = el.getBoundingClientRect();
    const selector = shortestSelector(el) || el.tagName.toLowerCase();
    send({
      kind: "picked",
      selector: selector.slice(0, 1024),
      rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      dpr: window.devicePixelRatio || 1,
      url: location.href,
      title: document.title || "",
    });
  }

  function onKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      send({ kind: "cancelled" });
    }
  }

  function onCancel() {
    send({ kind: "cancelled" });
  }

  document.addEventListener("keydown", onKey, true);
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("__poracode_picker_cancel", onCancel, true);
  scrim.addEventListener("mousemove", onMove, true);
  scrim.addEventListener("click", onClick, true);
  });
})();`;
}
