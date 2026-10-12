import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { crc32, inflateSync } from "node:zlib";
import { mockEditorMediaGate } from "./smoke-editor-media.mjs";

const scratch = resolve("tmp/v2-editor-media-20261010");
const key = "__poracodeEditorMediaSmoke";

async function fixture(t, patch = {}) {
  await mkdir(scratch, { recursive: true });
  const root = await mkdtemp(join(scratch, "unit-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const projectDir = join(root, "project");
  const outDir = join(root, "artifacts");
  await mkdir(join(projectDir, ".git"), { recursive: true });
  await mkdir(outDir);
  await writeFile(join(projectDir, "README.md"), "# Poracode smoke fixture\n");
  await writeFile(join(projectDir, "hello.txt"), "untouched fixture data\n");
  const session = {
    schemaVersion: 2,
    mode: "mock",
    state: "ready",
    root,
    projectDir,
    outDir,
    token: "editor-media-unit-session-token",
    ...patch,
  };
  await writeFile(join(root, "session.json"), JSON.stringify(session));
  return {
    root,
    projectDir,
    outDir,
    session,
    fixture: {
      project: {
        id: "smoke-project",
        name: "Smoke Project",
        location: { kind: "posix", path: projectDir },
      },
    },
  };
}

/**
 * Unit-only DOM/native-media double. Runs the actual serialized driver in a VM,
 * reads its on-disk fixtures, and dispatches its pointer/media/input events.
 * Fake decode/timing below is control/cleanup evidence, never app qualification.
 */
function harness(owned, options = {}) {
  const originalEditor = {
    rootContext: { projectId: "previous" },
    overlayMode: null,
    tabs: ["previous.txt"],
    activePath: "previous.txt",
    previewTab: null,
    markdownPreviewPath: null,
    buffers: { "previous.txt": { content: "original dirty text", isDirty: true } },
    refreshToken: 7,
  };
  const originalView = { type: "draft", projectId: "previous" };
  const originalPanel = { settingsOpen: true, notesPanelOpen: true };
  let editor = originalEditor;
  let view = originalView;
  let panel = originalPanel;
  let current;
  let image;
  let player;
  let fallback = false;
  let lightbox = false;
  let preview = false;
  let source;
  let generation = 0;
  let hit;
  let evaluations = 0;
  const allPlayers = [];
  const calls = [];
  const frames = [];
  const model = {
    getValue: () => editor.buffers[editor.activePath]?.content,
    getFullModelRange: () => ({ all: true }),
  };

  class Element extends EventTarget {
    constructor(label = "", disabled = false) {
      super();
      this.label = label;
      this.disabled = disabled;
      this.isConnected = true;
    }
    getClientRects() {
      return options.hiddenControls && this.label ? [] : [{ width: 80, height: 24 }];
    }
    getBoundingClientRect() {
      return { x: 80, y: 80, width: options.hiddenControls && this.label ? 0 : 80, height: 24 };
    }
    getAttribute(name) {
      return name === "aria-label" ? this.label : null;
    }
    matches(selector) {
      return selector === ":disabled" && this.disabled;
    }
    closest() {
      return null;
    }
    contains(element) {
      return element === this;
    }
    scrollIntoView() {
      hit = this;
    }
    click() {
      return this.press?.();
    }
  }
  class Media extends Element {
    constructor(kind, duration, src, time = 0) {
      super();
      this.tagName = kind.toUpperCase();
      this.duration = duration;
      this.src = src;
      this.currentSrc = src;
      this.paused = true;
      this.controls = true;
      this.autoplay = false;
      this.readyState = 4;
      this.seeking = false;
      this.error = null;
      this.time = time;
      this.muted = false;
      this.videoWidth = kind === "video" ? 64 : undefined;
      this.videoHeight = kind === "video" ? 48 : undefined;
      this.seekable = { length: 1, start: () => 0, end: () => duration };
      this.listenerCount = 0;
    }
    get currentTime() {
      return this.time;
    }
    set currentTime(value) {
      this.time = value;
      if (!options.missingSeekEvent) this.dispatchEvent(new Event("seeked"));
    }
    async play() {
      if (options.rejectedPlayback) throw new Error("synthetic playback rejected");
      this.paused = false;
      if (!options.noPlaybackProgress) this.time += 0.25;
      if (!options.noVideoEvents || this.tagName !== "VIDEO") {
        this.dispatchEvent(new Event("play"));
        this.dispatchEvent(new Event("timeupdate"));
      }
    }
    pause() {
      this.paused = true;
      this.dispatchEvent(new Event("pause"));
    }
    addEventListener(...args) {
      this.listenerCount++;
      super.addEventListener(...args);
    }
    removeEventListener(...args) {
      this.listenerCount--;
      super.removeEventListener(...args);
    }
  }

  const readPath = async (path) => {
    const bytes = await readFile(join(owned.projectDir, path));
    if (path.endsWith(".png") && bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") {
      const compressed = [];
      for (let offset = 8; offset < bytes.length;) {
        const length = bytes.readUInt32BE(offset);
        const type = bytes.toString("ascii", offset + 4, offset + 8);
        assert.equal(
          crc32(bytes.subarray(offset + 4, offset + 8 + length)),
          bytes.readUInt32BE(offset + 8 + length),
          "PNG fixture CRC must be valid",
        );
        if (type === "IDAT") compressed.push(bytes.subarray(offset + 8, offset + 8 + length));
        offset += 12 + length;
      }
      const pixels = inflateSync(Buffer.concat(compressed));
      assert.equal(pixels.length, bytes.readUInt32BE(20) * (bytes.readUInt32BE(16) * 3 + 1));
      assert(
        pixels.some((byte) => byte !== 0),
        "PNG fixture must contain colored pixels",
      );
    }
    if (path.endsWith(".wav") && bytes.toString("ascii", 0, 4) === "RIFF") {
      assert.equal(bytes.readUInt32LE(4), bytes.length - 8);
      assert.equal(bytes.toString("ascii", 8, 16), "WAVEfmt ");
      assert.equal(bytes.readUInt16LE(20), 1);
      assert.equal(bytes.readUInt16LE(22), 1);
      assert.equal(bytes.readUInt32LE(24), 8_000);
      assert.equal(bytes.readUInt16LE(34), 16);
      assert.equal(bytes.readUInt32LE(40), bytes.length - 44);
    }
    return {
      path,
      status: path.endsWith(".svg") ? "ready" : "binary",
      modifiedAtMs: 1,
      ...(path.endsWith(".svg") ? { content: bytes.toString() } : {}),
    };
  };
  const render = async (reload = false) => {
    const oldTime = reload && options.retainPosition !== false ? (player?.time ?? 0) : 0;
    if (player) {
      player.isConnected = false;
      if (options.pauseOnUnmount !== false) player.pause();
    }
    player = null;
    image = null;
    fallback = false;
    source = null;
    if (!current) return;
    const bytes = await readFile(join(owned.projectDir, current));
    const src = `http://127.0.0.1:12345/api/files/media?ticket=unit-${++generation}`;
    if (current.endsWith(".svg")) {
      if (preview) {
        const content = model.getValue();
        image = new Element();
        image.complete = true;
        image.naturalWidth = Number(/width="(\d+)"/u.exec(content)[1]);
        image.naturalHeight = Number(/height="(\d+)"/u.exec(content)[1]);
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`;
        if (options.activeSvg) context[key].svgExecutions++;
      } else source = new Element();
    } else if (current.endsWith(".png")) {
      if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") fallback = true;
      else {
        image = new Element();
        image.complete = true;
        image.naturalWidth = bytes.readUInt32BE(16);
        image.naturalHeight = bytes.readUInt32BE(20);
        image.src = src;
      }
    } else {
      const kind = current.endsWith(".wav") ? "audio" : "video";
      const valid =
        kind === "audio"
          ? bytes.toString("ascii", 0, 4) === "RIFF"
          : bytes.subarray(0, 4).toString("hex") === "1a45dfa3";
      if (!valid) fallback = true;
      else {
        // Check the mux contains the finite Duration element and VP8 track declaration.
        const durationOffset = bytes.indexOf(Buffer.from([0x44, 0x89, 0x88]));
        const duration =
          kind === "audio"
            ? bytes.readUInt32LE(40) / 16_000
            : bytes.readDoubleBE(durationOffset + 3) / 1_000;
        if (kind === "video") assert(bytes.includes(Buffer.from("V_VP8")));
        player = new Media(kind, duration, src, oldTime);
        if (options.failedMedia) player.error = { code: 3, message: "decoder failed" };
        allPlayers.push(player);
      }
    }
  };
  const store = {
    getState() {
      return { ...editor, ...actions };
    },
    setState(patch) {
      editor = { ...editor, ...patch };
    },
  };
  const actions = {
    clearSession() {
      current = null;
      editor = {
        ...editor,
        rootContext: null,
        overlayMode: null,
        tabs: [],
        activePath: null,
        buffers: {},
        markdownPreviewPath: null,
      };
      if (player) {
        player.isConnected = false;
        player.pause();
      }
      player = null;
      image = null;
      fallback = false;
    },
    setRootContext(context) {
      editor = { ...editor, rootContext: context };
    },
    async openFile(path, mode) {
      const result = await readPath(path);
      current = path;
      preview = false;
      editor = {
        ...editor,
        tabs: [path],
        activePath: path,
        overlayMode: mode,
        buffers: {
          [path]: {
            ...result,
            content: result.content ?? "",
            savedContent: result.content ?? "",
            isDirty: false,
          },
        },
      };
      await render();
      return result;
    },
    discardFileChanges(path) {
      const buffer = editor.buffers[path];
      editor = {
        ...editor,
        buffers: {
          ...editor.buffers,
          [path]: { ...buffer, content: buffer.savedContent, isDirty: false },
        },
      };
    },
    async refreshOpenBuffers() {
      const result = await readPath(current);
      editor = {
        ...editor,
        buffers: {
          [current]: {
            ...result,
            content: result.content,
            savedContent: result.content,
            isDirty: false,
          },
        },
      };
      await render();
    },
  };
  const sourceEditor = {
    getModel: () => model,
    getDomNode: () => source,
    focus() {},
    setSelection() {},
  };
  const button = (label, press, disabled = false) => {
    const element = new Element(
      label,
      disabled || (options.disabledReload && label === "Reload preview"),
    );
    element.press = press;
    return element;
  };
  const buttons = () => {
    const result = [button("Save", () => {}, !editor.buffers[current]?.isDirty)];
    if (current?.endsWith(".svg"))
      result.push(
        button(preview ? "Show source" : "Show preview", async () => {
          preview = !preview;
          editor.markdownPreviewPath = preview ? current : null;
          await render();
        }),
      );
    else if (current) result.push(button("Reload preview", () => render(true)));
    if (image)
      result.push(
        button("Open image preview", () => {
          lightbox = true;
        }),
      );
    if (lightbox)
      result.push(
        button("Close preview", () => {
          lightbox = false;
        }),
      );
    if (options.ambiguousControls)
      result.push(...result.filter((element) => element.label === "Reload preview"));
    return result;
  };
  const document = {
    visibilityState: "visible",
    documentElement: { hasAttribute: () => false },
    body: {
      get innerText() {
        return fallback ? "This media preview is unavailable." : "";
      },
    },
    elementFromPoint: () => (options.occludedControls ? null : hit),
    querySelectorAll: (selector) => (selector === "button,[role=button],a" ? buttons() : []),
    querySelector(selector) {
      if (selector === '[data-testid="image-file-view"] img') return image;
      if (
        selector ===
        '[data-testid="native-media-view"] audio, [data-testid="native-media-view"] video'
      )
        return player;
      if (selector === '[data-testid="media-details"]')
        return {
          textContent: image
            ? `${image.naturalWidth} × ${image.naturalHeight}`
            : player
              ? `${player.tagName === "VIDEO" ? "64 × 48 · " : ""}0:0${player.duration}`
              : "",
        };
      if (selector === 'button[aria-label="Save"]') return buttons()[0];
      if (selector === ".poracode-image-lightbox__close")
        return lightbox
          ? button("Close preview", () => {
              lightbox = false;
            })
          : null;
      if (selector === ".poracode-image-lightbox__image") return lightbox ? image : null;
      return null;
    },
    createElement(tag) {
      assert.equal(tag, "canvas");
      // Header-complete fake keyframe; VM tests do not claim it is decodable.
      const frame = Buffer.from([0, 0, 0, 0x9d, 0x01, 0x2a, 64, 0, 48, 0, 0]);
      const webp = Buffer.alloc(20 + frame.length + 1);
      webp.write("RIFF");
      webp.writeUInt32LE(webp.length - 8, 4);
      webp.write("WEBPVP8 ", 8);
      webp.writeUInt32LE(frame.length, 16);
      frame.copy(webp, 20);
      frames.push(webp);
      return {
        getContext: () => ({ fillRect() {} }),
        toDataURL: () => `data:image/webp;base64,${webp.toString("base64")}`,
      };
    },
  };
  const context = vm.createContext({
    URL,
    Event,
    HTMLElement: Element,
    document,
    location: {
      href: `http://127.0.0.1:12345/?poracodeDebugSession=${options.token ?? owned.session.token}`,
    },
    innerWidth: 1024,
    innerHeight: 768,
    getComputedStyle: () => ({
      display: "block",
      visibility: "visible",
      opacity: "1",
      pointerEvents: "auto",
    }),
    setTimeout,
    clearTimeout,
  });
  context.window = context;
  context.poracode = { isDev: true };
  context.poracodeHost = { windowKind: "main" };
  context.__poracodeSmokeNative = { version: options.smokeVersion ?? 2 };
  context.__poracodeDev = {
    loadEditorDiagnostics: async () => ({
      files: { useFileEditorStore: store },
      monaco: { editor: { getEditors: () => (source ? [sourceEditor] : []) } },
    }),
    stores: {
      app: {
        getState: () => ({
          view,
          openDraft(projectId) {
            view = { type: "draft", projectId };
          },
        }),
        setState: (patch) => {
          view = patch.view;
        },
      },
      panel: {
        getState: () => panel,
        setState: (patch) => {
          panel = { ...panel, ...patch };
        },
      },
    },
  };
  const evaluate = async (_client, expression) => {
    evaluations++;
    if (options.disconnectCleanup && expression.includes("async function cleanupRenderer"))
      throw new Error("renderer disconnected during cleanup");
    return vm.runInContext(expression, context);
  };
  const client = {
    async send(method, payload) {
      calls.push({ method, payload });
      if (method === "Runtime.evaluate") {
        try {
          return { result: { value: await evaluate(client, payload.expression) } };
        } catch (error) {
          return { exceptionDetails: { text: error.message } };
        }
      }
      if (method === "Input.dispatchMouseEvent" && payload.type === "mouseReleased")
        await hit.press();
      if (method === "Input.insertText") {
        const buffer = editor.buffers[current];
        editor = {
          ...editor,
          buffers: {
            ...editor.buffers,
            [current]: { ...buffer, content: payload.text, isDirty: true },
          },
        };
      }
    },
  };
  return {
    context,
    allPlayers,
    frames,
    calls,
    args: {
      client,
      evaluate,
      fixture: owned.fixture,
      outDir: owned.outDir,
      bridgeInvoke: async (_client, method, payload) => {
        assert.equal(method, "readProjectFile");
        return readPath(payload.path);
      },
      screenshot: async () => {
        if (options.failedScreenshot) throw new Error("screenshot failed");
      },
      waitForValue: async (read, predicate, label) => {
        for (let count = 0; count < 4; count++) {
          const result = await read();
          if (predicate(result)) return result;
        }
        throw new Error(`unit deadline: ${label}`);
      },
    },
    get evaluations() {
      return evaluations;
    },
    assertRestored() {
      assert.equal(context[key], undefined);
      assert.deepEqual(view, originalView);
      assert.deepEqual(panel, originalPanel);
      for (const name of Object.keys(originalEditor))
        assert.deepEqual(editor[name], originalEditor[name]);
      assert(
        allPlayers.every((media) => media.paused && media.listenerCount === 0),
        "all owned media/listeners must be stopped/removed",
      );
    },
  };
}

async function resultOf(args) {
  try {
    await mockEditorMediaGate(args);
    assert.fail("a desktop-only gate cannot qualify required paired compact coverage");
  } catch (error) {
    assert(error.coverage, error.message);
    return error;
  }
}
async function assertFilesRestored(owned) {
  assert.deepEqual((await readdir(owned.projectDir)).sort(), [".git", "README.md", "hello.txt"]);
  assert.equal(
    await readFile(join(owned.projectDir, "hello.txt"), "utf8"),
    "untouched fixture data\n",
  );
}

void test("driver exercises all desktop dimensions but refuses a blanket PASS for paired compact", async (t) => {
  const owned = await fixture(t);
  const driver = harness(owned);
  const result = await resultOf(driver.args);
  assert.equal(result.code, "EDITOR_MEDIA_UNQUALIFIED");
  assert.deepEqual(
    result.coverage.dimensions.map((row) => row.status),
    ["pass", "pass", "pass", "pass"],
  );
  assert(result.coverage.dimensions.every((row) => row.checks.length >= 3));
  assert.equal(
    result.coverage.unqualified.find((row) => row.id === "paired-compact-pwa").required,
    true,
  );
  assert.deepEqual(result.coverage.cleanup, { renderer: "pass", files: "pass" });
  assert(
    driver.calls
      .filter((call) => call.method === "Runtime.evaluate")
      .every((call) => call.payload.userGesture === true),
  );
  assert.equal(driver.calls.filter((call) => call.method === "Input.insertText").length, 1);
  const artifact = JSON.parse(
    await readFile(join(owned.outDir, "editor-media-coverage.json"), "utf8"),
  );
  assert.equal(artifact.status, "unqualified");
  assert(!JSON.stringify(artifact).includes("?ticket="), "ledger must not retain media grant URLs");
  assert(
    artifact.fixtures.every(
      (file) => file.sizeBytes <= 512_000 && /^[a-f0-9]{64}$/u.test(file.sha256),
    ),
  );
  driver.assertRestored();
  await assertFilesRestored(owned);
});

void test("decode failure cannot pass because media controls and APIs exist", async (t) => {
  const owned = await fixture(t);
  const driver = harness(owned, { failedMedia: true });
  const result = await resultOf(driver.args);
  assert.equal(result.code, "EDITOR_MEDIA_FAILED");
  assert(
    result.coverage.dimensions
      .filter((row) => ["audio", "video"].includes(row.id))
      .every((row) => row.status === "fail" && row.checks.length === 0),
  );
  assert(
    !driver.calls.some((call) => call.method === "Runtime.evaluate"),
    "failed media must never start playback",
  );
  driver.assertRestored();
  await assertFilesRestored(owned);
});

void test("lost reload position fails both media dimensions after recovery checks run", async (t) => {
  const owned = await fixture(t);
  const driver = harness(owned, { retainPosition: false });
  const result = await resultOf(driver.args);
  for (const row of result.coverage.dimensions.filter((candidate) =>
    ["audio", "video"].includes(candidate.id),
  )) {
    assert.equal(row.status, "fail");
    assert.match(row.detail, /lost the paused seek position/u);
    assert(row.checks.some((check) => check.includes("corrupt media fallback and recovery")));
  }
  driver.assertRestored();
  await assertFilesRestored(owned);
});

void test("rejected playback fails and all listeners/files are cleaned", async (t) => {
  const owned = await fixture(t);
  const driver = harness(owned, { rejectedPlayback: true });
  const result = await resultOf(driver.args);
  assert(
    result.coverage.dimensions
      .filter((row) => ["audio", "video"].includes(row.id))
      .every((row) => row.status === "fail" && row.detail.includes("playback rejected")),
  );
  driver.assertRestored();
  await assertFilesRestored(owned);
});

for (const option of ["noPlaybackProgress", "missingSeekEvent"])
  void test(`${option} cannot qualify native playback/seek`, async (t) => {
    const owned = await fixture(t);
    const driver = harness(owned, { [option]: true });
    const result = await resultOf(driver.args);
    assert(
      result.coverage.dimensions
        .filter((row) => ["audio", "video"].includes(row.id))
        .every((row) => row.status === "fail"),
    );
    driver.assertRestored();
    await assertFilesRestored(owned);
  });

void test("audio events cannot falsely satisfy the next video playback assertion", async (t) => {
  const owned = await fixture(t);
  const driver = harness(owned, { noVideoEvents: true });
  const result = await resultOf(driver.args);
  assert.equal(result.coverage.dimensions.find((row) => row.id === "audio").status, "pass");
  const video = result.coverage.dimensions.find((row) => row.id === "video");
  assert.equal(video.status, "fail");
  assert.match(video.detail, /actual playback advancement/u);
  driver.assertRestored();
  await assertFilesRestored(owned);
});

void test("disabled reload and occluded controls fail guarded pointer targeting", async (t) => {
  for (const options of [{ disabledReload: true }, { occludedControls: true }]) {
    const owned = await fixture(t);
    const driver = harness(owned, options);
    const result = await resultOf(driver.args);
    assert(
      result.coverage.dimensions.some((row) =>
        /cannot click.*(?:disabled|occluded)/u.test(row.detail),
      ),
    );
    if (options.occludedControls)
      assert(!driver.calls.some((call) => call.method === "Input.dispatchMouseEvent"));
    driver.assertRestored();
    await assertFilesRestored(owned);
  }
});

for (const option of ["hiddenControls", "ambiguousControls"])
  void test(`${option} cannot dispatch unsafe pointer input`, async (t) => {
    const owned = await fixture(t);
    const driver = harness(owned, { [option]: true });
    const result = await resultOf(driver.args);
    assert.equal(result.code, "EDITOR_MEDIA_FAILED");
    if (option === "hiddenControls")
      assert(!driver.calls.some((call) => call.method === "Input.dispatchMouseEvent"));
    else assert(result.coverage.dimensions.some((row) => row.detail.includes("ambiguous:")));
    driver.assertRestored();
    await assertFilesRestored(owned);
  });

void test("active SVG payload fails inertness checks", async (t) => {
  const owned = await fixture(t);
  const driver = harness(owned, { activeSvg: true });
  const result = await resultOf(driver.args);
  assert.equal(
    result.coverage.dimensions.find((row) => row.id === "svg-source-preview").status,
    "fail",
  );
  assert.match(result.message, /SVG executed its active payload/u);
  driver.assertRestored();
  await assertFilesRestored(owned);
});

void test("screenshot and renderer cleanup failures still remove every owned fixture file", async (t) => {
  const owned = await fixture(t);
  const driver = harness(owned, { failedScreenshot: true, disconnectCleanup: true });
  const result = await resultOf(driver.args);
  assert.equal(result.coverage.cleanup.renderer, "fail");
  assert.equal(result.coverage.cleanup.files, "pass");
  assert(result.errors.some((error) => error.message.includes("renderer disconnected")));
  await assertFilesRestored(owned);
  // The disconnected renderer is honestly unclean; no claimed listener cleanup.
  assert(driver.context[key]);
});

void test("wrong session token or native mock boundary refuses renderer mutation", async (t) => {
  for (const options of [{ token: "wrong-token" }, { smokeVersion: 1 }]) {
    const owned = await fixture(t);
    const driver = harness(owned, options);
    const result = await resultOf(driver.args);
    assert.equal(result.code, "EDITOR_MEDIA_FAILED");
    assert.equal(result.coverage.cleanup.files, "not-needed");
    driver.assertRestored();
    await assertFilesRestored(owned);
  }
});

void test("an already-owned renderer is never cleaned by a second gate", async (t) => {
  const owned = await fixture(t);
  const driver = harness(owned);
  const original = { ownerToken: "another-gate", untouched: true };
  driver.context[key] = original;
  const result = await resultOf(driver.args);
  assert.match(result.message, /already owns renderer/u);
  assert.equal(driver.context[key], original);
  assert.equal(result.coverage.cleanup.renderer, "not-needed");
  await assertFilesRestored(owned);
});

void test("real/stopped/old-schema sessions and arbitrary project paths are read-only refusals", async (t) => {
  for (const patch of [
    { mode: "real" },
    { state: "stopped" },
    { schemaVersion: 1 },
    { projectDir: scratch },
  ]) {
    const owned = await fixture(t, patch);
    const driver = harness(owned);
    await resultOf(driver.args);
    assert.equal(driver.evaluations, 0);
    await assertFilesRestored(owned);
    assert.deepEqual(await readdir(owned.outDir), []);
  }
  const owned = await fixture(t);
  const driver = harness(owned);
  driver.args.fixture.project.id = "user-project";
  await resultOf(driver.args);
  assert.equal(driver.evaluations, 0);
  await assertFilesRestored(owned);
});

void test("symlinked managed project cannot receive fixture writes", async (t) => {
  const owned = await fixture(t);
  const actual = join(owned.root, "other-project");
  await rm(owned.projectDir, { recursive: true });
  await mkdir(actual);
  await writeFile(join(actual, "keep.txt"), "user file");
  await symlink(actual, owned.projectDir, "dir");
  const driver = harness(owned);
  await resultOf(driver.args);
  assert.equal(driver.evaluations, 0);
  assert.deepEqual(await readdir(actual), ["keep.txt"]);
});
