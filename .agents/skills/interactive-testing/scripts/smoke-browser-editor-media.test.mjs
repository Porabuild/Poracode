import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { runBrowserEditorMediaChecks } from "./smoke-browser-editor-media.mjs";
import {
  createBrowserMediaProbe,
  MEDIA_CHECKS,
  finalizeBrowserMediaLedger,
} from "./smoke-browser-editor-media-probe.mjs";

// Protocol/DOM doubles exercise driver admission, not an app, decoder, paired browser or device.
function harness(fault = "", compact = false) {
  const fixtureFiles = {
    image: "private/picture.png",
    svg: "private/drawing.svg",
    audio: "private/tone.wav",
    video: "private/clip.webm",
  };
  const files = new Map();
  const players = [];
  const calls = [];
  const nativeInput = fault.startsWith("native-");
  let nativeInsertions = 0;
  let current = "",
    view = "",
    player = null,
    image = null,
    source = "",
    focused = false;
  let pendingClick,
    grant = 0,
    selectionPending = false,
    selectionReads = 0,
    selectionStart = 0,
    selectionEnd = 0;
  const affected = () => current === "audio";
  const emit = (name) => {
    player.events[name] = (player.events[name] ?? 0) + 1;
  };
  const retire = () => {
    if (!player) return;
    player.connected = false;
    if (fault !== "detached-playing" || !affected()) {
      player.paused = true;
      emit("pause");
    }
    player = null;
  };
  const render = (kind, reload = false) => {
    const position = reload && player ? player.time : 0;
    retire();
    current = kind;
    view = kind;
    image = null;
    const file = files.get(kind);
    if (file.variant === "corrupt") {
      view = "fallback";
      return;
    }
    if (kind === "image")
      image = {
        complete: fault !== "image-decode",
        width: file.width,
        height: file.height,
        src: `http://host.test/api/files/media?ticket=grant-${++grant}`,
      };
    else if (kind === "svg") {
      source = file.content;
      view = "svg-source";
      if (fault === "unsupported-svg") view = "svg-preview";
      if (fault === "missing-svg-ui") view = "svg-absent";
    } else
      player = {
        id: null,
        connected: true,
        kind,
        duration: affected() && fault === "bad-metadata" ? Infinity : file.duration,
        readyState: 4,
        src: `http://host.test/api/files/media?ticket=grant-${++grant}`,
        time: reload && fault === "lost-position" && affected() ? 0 : position,
        paused: true,
        seeking: false,
        muted: false,
        error: null,
        controls: true,
        autoplay: false,
        width: kind === "video" ? 64 : null,
        height: kind === "video" ? 48 : null,
        events: {},
      };
  };
  const read = () => {
    const svgPreview = view === "svg-preview";
    const previewImage = svgPreview
      ? {
          complete: true,
          width: Number(source.match(/width="(\d+)"/u)[1]),
          height: Number(source.match(/height="(\d+)"/u)[1]),
          src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`,
        }
      : image;
    return {
      surface: {
        origin: fault === "wrong-origin" ? "http://elsewhere.test" : "http://web.test",
        hasHost: fault === "electron",
        visibility: fault === "hidden" ? "hidden" : "visible",
        rootVisible: fault !== "hidden-root",
        compact: fault === "wrong-compact" ? !compact : compact,
        width: fault === "wrong-width" ? 800 : compact ? 390 : 1280,
      },
      image: previewImage,
      lightbox: view === "lightbox",
      lightboxImage: view === "lightbox" ? image : null,
      player: player ? { ...player, events: undefined } : null,
      events: { ...(player?.events ?? {}) },
      observedPlayers: players.map(({ id, connected, paused, time, events }) => ({
        id,
        connected,
        paused,
        time,
        events: { ...events },
      })),
      details: previewImage
        ? `${previewImage.width} × ${previewImage.height}`
        : player
          ? `0:0${files.get(current).duration} ${current === "video" ? "64 × 48" : ""}`
          : "",
      fallback: view === "fallback",
      saveDisabled: view.startsWith("svg-") ? source === files.get("svg").content : true,
      sourceVisible: view === "svg-source",
      sourceText: view === "svg-source" ? source : "",
      sourceEditable: view === "svg-source",
      sourceFocused: focused,
      sourceInputKind: nativeInput ? "native-edit-context" : "text-input",
      sourceSelection: nativeInput
        ? {
            text: source,
            start: selectionStart,
            end:
              selectionPending && ++selectionReads < 3
                ? Math.max(selectionStart, selectionEnd - 1)
                : selectionEnd,
          }
        : null,
      mac: false,
      previewControls: view === "svg-source" ? 1 : 0,
      svgExecuted: fault === "svg-active" && svgPreview,
      inlineSvgPayload: false,
    };
  };
  const client = {
    async send(method, params) {
      calls.push({ method, params });
      if (method === "Runtime.evaluate") return { result: { objectId: "private-probe" } };
      if (method === "Runtime.releaseObjectGroup") return {};
      if (method === "Runtime.callFunctionOn") {
        const [action, target] = params.arguments.map((arg) => arg.value);
        if (action === "read") return { result: { value: read() } };
        if (action === "observe") {
          if (!player.id) {
            player.id = players.length + 1;
            players.push(player);
          }
          player.muted = true;
          return { result: { value: read() } };
        }
        if (action === "play") {
          player.paused = false;
          if (!(affected() && ["stalled-play", "bad-waiter"].includes(fault))) player.time += 0.25;
          emit("play");
          if (!(affected() && fault === "missing-play-events")) emit("timeupdate");
        } else if (action === "pause") {
          player.paused = true;
          emit("pause");
        } else if (action === "seek") {
          player.time = target;
          player.seeking = affected() && fault === "incomplete-seek";
          if (!(affected() && fault === "missing-seeked")) emit("seeked");
        } else if (action === "cleanup") {
          for (const p of players) p.paused = true;
          if (fault === "cleanup-exception") throw new Error("probe cleanup threw");
          return { result: { value: { status: fault === "cleanup-status" ? "fail" : "pass" } } };
        }
        return { result: { value: null } };
      }
      if (method === "Input.dispatchKeyEvent" && params.type === "keyDown") {
        selectionPending = true;
        selectionReads = 0;
        if (params.key === "a") {
          selectionStart = 0;
          selectionEnd = source.length;
        } else if (params.key === "ArrowLeft") selectionEnd = selectionStart;
        else if (params.key === "ArrowRight" && params.modifiers === 8) selectionEnd++;
        else if (params.key === "ArrowRight") {
          selectionStart = selectionEnd + 1;
          selectionEnd = selectionStart;
        }
      }
      if (method === "Input.insertText") {
        if (nativeInput) {
          assert(selectionReads >= 3, "replacement preceded native selection delivery");
          assert.match(params.text, /^\d{2}$/, "native typing must edit only dimension digits");
          nativeInsertions++;
          if (
            (fault === "native-forward-interrupted" && nativeInsertions === 2) ||
            (fault === "native-restore-interrupted" && nativeInsertions === 4)
          )
            throw new Error("owned attribute input interrupted");
          if (fault === "native-unrelated-source" && nativeInsertions === 2) {
            source += "<!-- unrelated -->";
            throw new Error("unrelated source changed");
          }
          source = source.slice(0, selectionStart) + params.text + source.slice(selectionEnd);
        } else source = params.text;
      }
      if (method === "Input.dispatchMouseEvent" && params.type === "mouseReleased") {
        if (pendingClick === "Reload preview") render(current, true);
        else if (pendingClick === "Open image preview") view = "lightbox";
        else if (pendingClick === "Close preview") view = "image";
        else if (pendingClick === "Show preview") {
          view = "svg-preview";
          focused = false;
        } else if (pendingClick === "Show source") {
          view = "svg-source";
          focused = false;
        } else if (pendingClick === "source") focused = true;
      }
      return {};
    },
  };
  const options = {
    client,
    origin: "http://web.test",
    compact,
    fixtureFiles,
    outDir: "tmp/parent-owned-artifacts",
    async evaluate(_client, expression) {
      pendingClick =
        [
          "Reload preview",
          "Open image preview",
          "Close preview",
          "Show preview",
          "Show source",
        ].find((label) => expression.includes(JSON.stringify(label))) ?? "source";
      return { x: 20, y: 20 };
    },
    async waitForValue(get, predicate, label) {
      if (fault === "bad-waiter") return get();
      for (let i = 0; i < 5; i++) {
        const value = await get();
        if (predicate(value)) return value;
      }
      throw new Error(`${label}: deadline exceeded in protocol double`);
    },
    async screenshot(_client, path) {
      if (fault === "capture-failure" && path.includes("image-lightbox"))
        throw new Error("capture failed");
    },
    async openFile(path) {
      render(Object.keys(fixtureFiles).find((key) => fixtureFiles[key] === path));
      return { path, via: "ui" };
    },
    async replaceFile(path, request) {
      files.set(request.kind, request);
      const bytes = request.content ?? JSON.stringify(request);
      return {
        path,
        variant: request.variant,
        sizeBytes: Buffer.byteLength(bytes),
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
    },
  };
  return { options, calls, files, players, readSource: () => source };
}

for (const compact of [false, true]) {
  for (const fault of ["native-forward-interrupted", "native-restore-interrupted"]) {
    void test(`${fault} restores the owned intermediate SVG (compact=${compact})`, async () => {
      const h = harness(fault, compact);
      const ledger = await runBrowserEditorMediaChecks(h.options);
      assert.equal(ledger.status, "fail", "the original input failure must remain failed");
      assert(
        ledger.failures.some((row) => row.detail?.includes("owned attribute input interrupted")),
      );
      assert.equal(ledger.cleanup.status, "pass", JSON.stringify(ledger.failures));
      assert.equal(h.readSource(), h.files.get("svg").content);
    });
  }
  void test(`refuses unrelated SVG source after partial edit (compact=${compact})`, async () => {
    const h = harness("native-unrelated-source", compact);
    const ledger = await runBrowserEditorMediaChecks(h.options);
    assert.equal(ledger.status, "fail");
    assert.equal(ledger.cleanup.status, "fail");
    assert(h.readSource().endsWith("<!-- unrelated -->"));
    assert(
      ledger.failures.some((row) => row.detail?.includes("refusing to restore unrelated source")),
    );
  });
}

for (const compact of [false, true]) {
  void test(`waits for native select-all delivery before SVG replacement (compact=${compact})`, async () => {
    const h = harness("native-selection-delivery", compact);
    const ledger = await runBrowserEditorMediaChecks(h.options);
    assert.equal(ledger.status, "pass", JSON.stringify(ledger.failures));
    const receipts = ledger.receipts.filter((row) => row.operation === "svg-attribute-selection");
    assert.equal(receipts.length, 4);
    for (const receipt of receipts) {
      assert.equal(receipt.end - receipt.start, 2);
    }
  });
}

for (const compact of [false, true])
  void test(`${compact ? "compact" : "desktop"} driver oracle admission`, async () => {
    const h = harness("", compact);
    const ledger = await runBrowserEditorMediaChecks(h.options);
    assert.equal(ledger.status, "pass", JSON.stringify(ledger.failures));
    assert.equal(ledger.surfaceMediaQualified, true);
    assert.equal(ledger.allMediaQualified, false);
    assert(ledger.unqualified.some((row) => row.id === "installed-pwa"));
    assert.equal(h.calls.filter(({ params }) => params?.userGesture).length, 4);
    assert.equal(h.calls.filter((call) => call.method === "Runtime.releaseObjectGroup").length, 1);
    assert(
      !JSON.stringify(ledger).includes("ticket=grant-"),
      "ledger must not publish raw media grants",
    );
  });

for (const fault of [
  "image-decode",
  "bad-metadata",
  "stalled-play",
  "bad-waiter",
  "missing-play-events",
  "incomplete-seek",
  "missing-seeked",
  "lost-position",
  "detached-playing",
  "svg-active",
  "capture-failure",
  "cleanup-status",
  "cleanup-exception",
])
  void test(`${fault} rejection includes cleanup`, async () => {
    const h = harness(fault);
    const ledger = await runBrowserEditorMediaChecks(h.options);
    assert.equal(ledger.status, "fail");
    assert.equal(ledger.surfaceMediaQualified, false);
    assert(ledger.failures.length > 0);
    const methods = h.calls.map(({ method, params }) =>
      method === "Runtime.callFunctionOn" ? params.arguments[0].value : method,
    );
    assert(methods.includes("cleanup"));
    assert(methods.includes("Runtime.releaseObjectGroup"));
    assert(h.players.every((player) => player.paused));
    assert.equal(ledger.cleanup.parentFixtureRemoval, "parent-owned");
  });

for (const fault of [
  "hidden",
  "hidden-root",
  "wrong-origin",
  "wrong-compact",
  "wrong-width",
  "electron",
])
  void test(`${fault} rejects the environment before writing any fixture`, async () => {
    const h = harness(fault, true);
    const ledger = await runBrowserEditorMediaChecks(h.options);
    assert.equal(ledger.status, "fail");
    assert.equal(h.files.size, 0);
    assert(h.calls.some((call) => call.method === "Runtime.releaseObjectGroup"));
  });

for (const fault of ["unsupported-svg", "missing-svg-ui"])
  void test(`${fault} stays unqualified`, async () => {
    const ledger = await runBrowserEditorMediaChecks(harness(fault).options);
    assert.equal(ledger.status, "unqualified");
    const svg = ledger.dimensions.find((row) => row.id === "svg-source-preview");
    assert.equal(svg.status, "unqualified");
    assert.deepEqual(svg.missingOracles, MEDIA_CHECKS[svg.id]);
    assert(ledger.unqualified.some((row) => row.id === svg.id && row.required));
    assert(ledger.dimensions.filter((row) => row !== svg).every((row) => row.status === "pass"));
  });

void test("missing required oracles invalidate a premature pass", () => {
  const ledger = finalizeBrowserMediaLedger({
    environment: { status: "pass" },
    cleanup: { status: "pass" },
    failures: [],
    dimensions: Object.keys(MEDIA_CHECKS).map((id) => ({
      id,
      status: "pass",
      checks: [],
    })),
  });
  assert.equal(ledger.status, "unqualified");
  assert.equal(ledger.surfaceMediaQualified, false);
});

function mountedProbe(addFailure = false, pauseFailure = false) {
  const handlers = new Map(),
    attrs = new Map();
  const box = { left: 0, top: 0, right: 300, bottom: 80, width: 300, height: 80 };
  const root = {
    isConnected: true,
    childElementCount: 1,
    closest: () => null,
    checkVisibility: () => true,
    getBoundingClientRect: () => box,
    hasAttribute: (name) => attrs.has(name),
    getAttribute: (name) => attrs.get(name),
    removeAttribute: (name) => attrs.delete(name),
  };
  const player = {
    ...root,
    tagName: "AUDIO",
    currentTime: 0,
    paused: true,
    muted: false,
    addEventListener(name, listener) {
      if (addFailure && name === "pause") throw new Error("listener install failed");
      handlers.set(name, listener);
    },
    removeEventListener(name) {
      handlers.delete(name);
    },
    pause() {
      if (pauseFailure) throw new Error("pause failed");
      this.paused = true;
      handlers.get("pause")?.();
    },
    async play() {
      this.paused = false;
      handlers.get("play")?.();
    },
  };
  const context = {
    document: {
      documentElement: root,
      visibilityState: "visible",
      querySelector: (selector) => (selector === "#root" ? root : null),
      querySelectorAll: (selector) => (selector.includes("native-media-view") ? [player] : []),
    },
    window: {},
    location: { origin: "http://web.test", pathname: "/" },
    navigator: { platform: "MacIntel" },
    innerWidth: 1280,
    innerHeight: 850,
    setTimeout,
    clearTimeout,
  };
  const probe = runInNewContext(`(${createBrowserMediaProbe.toString()})("owned-token")`, context);
  return { probe, player, handlers, attrs, context, root };
}

for (const [kind, attached, readonly, editable] of [
  ["textarea", false, false, true],
  ["textarea", false, true, false],
  ["contenteditable", false, false, true],
  ["native", true, false, true],
  ["native", false, false, false],
  ["native", true, true, false],
]) {
  void test(`source probe admits ${kind} input only when usable (attached=${attached}, readonly=${readonly})`, () => {
    const h = mountedProbe();
    const input = {
      disabled: false,
      readOnly: kind === "textarea" && readonly,
      editContext: attached ? {} : null,
      matches: (selector) => selector === ".native-edit-context" && kind === "native",
      getAttribute: (name) => (name === "aria-readonly" && readonly ? "true" : null),
    };
    const editor = {
      querySelector: (selector) =>
        selector.includes(
          kind === "native"
            ? ".native-edit-context"
            : kind === "textarea"
              ? "textarea.inputarea"
              : "[contenteditable=",
        )
          ? input
          : null,
    };
    const source = {
      ...h.root,
      textContent: "owned source",
      closest: (selector) => (selector === ".monaco-editor" ? editor : null),
    };
    const save = { ...h.root, disabled: true };
    h.context.document.querySelectorAll = (selector) => {
      if (selector === ".monaco-editor .view-lines") return [source];
      if (selector === 'button[aria-label="Save"]') return [save];
      if (selector === 'button[aria-label="Show preview"]') return [h.root];
      return [];
    };
    const state = h.probe.read();
    assert.equal(state.sourceVisible, true);
    assert.equal(state.sourceEditable, editable);
    assert.equal(state.saveDisabled, true);
    assert.equal(state.previewControls, 1);
    h.probe.cleanup();
  });
}

void test("real probe closure removes partially installed listeners after observation failure", () => {
  const h = mountedProbe(true);
  assert.throws(() => h.probe.observe(), /listener install failed/u);
  h.probe.cleanup();
  assert.equal(h.handlers.size, 0);
  assert(!("__poracodeDev" in h.context.window));
});

void test("probe cleanup continues after pause failure, restores mute, removes owned SVG sentinel", () => {
  const h = mountedProbe(false, true);
  h.probe.observe();
  h.attrs.set("data-browser-editor-media-owned-token", "owned-token");
  assert.throws(() => h.probe.cleanup(), /pause failed/u);
  assert.equal(h.handlers.size, 0);
  assert.equal(h.player.muted, false);
  assert.equal(h.attrs.has("data-browser-editor-media-owned-token"), false);
});

void test("probe cleanup refuses to remove a sentinel whose ownership changed", () => {
  const h = mountedProbe();
  h.attrs.set("data-browser-editor-media-owned-token", "someone-else");
  assert.throws(() => h.probe.cleanup(), /ownership changed/u);
  assert.equal(h.attrs.get("data-browser-editor-media-owned-token"), "someone-else");
});
