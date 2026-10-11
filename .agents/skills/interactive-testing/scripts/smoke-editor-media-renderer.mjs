// These functions execute inside the existing renderer through its bundled DEV loaders.
export async function setupRenderer({ token, project, ownerToken }) {
  if (window.__poracodeEditorMediaSmoke)
    throw new Error("editor media gate already owns renderer state");
  if (
    window.__poracodeSmokeNative?.version !== 2 ||
    window.poracode?.isDev !== true ||
    window.poracodeHost?.windowKind !== "main"
  )
    throw new Error("UNQUALIFIED: requires the existing managed DEV mock main renderer");
  if (new URL(location.href).searchParams.get("poracodeDebugSession") !== token)
    throw new Error("editor media renderer/session token mismatch");
  if (document.visibilityState !== "visible") throw new Error("editor media renderer is hidden");
  if (
    document.querySelector(".poracode-image-lightbox__close") ||
    document.querySelector('[data-testid="native-media-view"]')
  )
    throw new Error("editor media refuses to interrupt an existing media preview");
  const diagnostics = await window.__poracodeDev.loadEditorDiagnostics();
  const store = diagnostics.files.useFileEditorStore;
  if (Object.values(store.getState().buffers).some((buffer) => buffer.isLoading))
    throw new Error("editor media refuses to interrupt pending editor reads");
  const stores = window.__poracodeDev.stores;
  window.__poracodeEditorMediaSmoke = {
    ownerToken,
    store,
    monaco: diagnostics.monaco,
    originalEditor: store.getState(),
    originalView: stores.app.getState().view,
    originalPanel: stores.panel.getState(),
    context: {
      projectId: project.id,
      projectName: project.name,
      projectLocation: project.location,
      rootLabel: project.name,
    },
    svgExecutions: 0,
    listeners: [],
    players: [],
    events: {},
  };
  stores.panel.setState({ settingsOpen: false });
  stores.app.getState().openDraft(project.id);
  return { desktop: true, compact: document.documentElement.hasAttribute("data-compact-layout") };
}

export async function rendererAction(action, value, ownerToken) {
  const state = window.__poracodeEditorMediaSmoke;
  if (!state || state.ownerToken !== ownerToken)
    throw new Error("editor media renderer ownership is missing");
  const store = state.store;
  if (action === "open") {
    store.getState().clearSession();
    store.getState().setRootContext(state.context);
    return store.getState().openFile(value, "fullscreen");
  }
  if (action === "edit") {
    const buffer = store.getState().buffers[store.getState().activePath];
    const editors = state.monaco.editor
      .getEditors()
      .filter(
        (editor) =>
          editor.getModel()?.getValue() === buffer.content &&
          editor.getDomNode()?.getClientRects().length,
      );
    if (editors.length !== 1) throw new Error("SVG source editor is missing or ambiguous");
    const editor = editors[0];
    editor.focus();
    editor.setSelection(editor.getModel().getFullModelRange());
  } else if (action === "refresh") {
    store.getState().discardFileChanges(value);
    await store.getState().refreshOpenBuffers();
  } else if (action === "frame") {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 48;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("UNQUALIFIED: canvas encoding is unavailable");
    context.fillStyle = value;
    context.fillRect(0, 0, 64, 48);
    const url = canvas.toDataURL("image/webp", 0.8);
    if (!url.startsWith("data:image/webp;base64,"))
      throw new Error("UNQUALIFIED: synthetic VP8 encoding is unavailable");
    return url.slice(url.indexOf(",") + 1);
  } else {
    const player = document.querySelector(
      '[data-testid="native-media-view"] audio, [data-testid="native-media-view"] video',
    );
    if (!player || !player.getClientRects().length)
      throw new Error("mounted native media player is missing");
    if (action === "observe") {
      if (!state.players.includes(player)) {
        state.players.push(player);
        const events = {};
        state.events = events;
        for (const event of ["play", "pause", "timeupdate", "seeked", "error"]) {
          const listener = () => {
            events[event] = (events[event] ?? 0) + 1;
          };
          player.addEventListener(event, listener);
          state.listeners.push(() => player.removeEventListener(event, listener));
        }
      }
      player.muted = true;
    } else if (action === "pause") player.pause();
    else if (action === "seek") player.currentTime = value;
    else if (action === "play") {
      let timer;
      try {
        await Promise.race([
          player.play(),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("native playback deadline exceeded")), 4_000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    } else throw new Error(`unknown editor media action: ${action}`);
  }
}

export function rendererRead(ownerToken) {
  const state = window.__poracodeEditorMediaSmoke;
  if (!state || state.ownerToken !== ownerToken)
    throw new Error("editor media renderer ownership is missing");
  const editor = state.store.getState();
  const buffer = editor.buffers[editor.activePath];
  const image = document.querySelector('[data-testid="image-file-view"] img');
  const lightboxImage = document.querySelector(".poracode-image-lightbox__image");
  const player = document.querySelector(
    '[data-testid="native-media-view"] audio, [data-testid="native-media-view"] video',
  );
  const visible = (element) => Boolean(element?.getClientRects().length);
  const source = state.monaco.editor
    .getEditors()
    .find(
      (candidate) =>
        visible(candidate.getDomNode()) && candidate.getModel()?.getValue() === buffer?.content,
    );
  return {
    activePath: editor.activePath,
    buffer: buffer
      ? {
          status: buffer.status,
          content: buffer.content,
          isDirty: buffer.isDirty,
          modifiedAtMs: buffer.modifiedAtMs,
        }
      : null,
    sourceVisible: Boolean(source),
    sourceValue: source?.getModel()?.getValue(),
    image: visible(image)
      ? {
          complete: image.complete,
          width: image.naturalWidth,
          height: image.naturalHeight,
          src: image.src,
        }
      : null,
    player: visible(player)
      ? {
          kind: player.tagName.toLowerCase(),
          src: player.currentSrc || player.src,
          readyState: player.readyState,
          duration: player.duration,
          time: player.currentTime,
          paused: player.paused,
          seeking: player.seeking,
          error: player.error ? { code: player.error.code, message: player.error.message } : null,
          controls: player.controls,
          autoplay: player.autoplay,
          muted: player.muted,
          width: player.videoWidth ?? null,
          height: player.videoHeight ?? null,
          seekable: Array.from({ length: player.seekable.length }, (_, index) => [
            player.seekable.start(index),
            player.seekable.end(index),
          ]),
        }
      : null,
    events: { ...state.events },
    details: document.querySelector('[data-testid="media-details"]')?.textContent ?? "",
    fallback: document.body.innerText.includes("This media preview is unavailable."),
    saveDisabled: document.querySelector('button[aria-label="Save"]')?.disabled,
    svgExecutions: state.svgExecutions,
    inlineSvgPayload: Boolean(document.querySelector('[data-editor-media-inline="forbidden"]')),
    lightbox: Boolean(document.querySelector(".poracode-image-lightbox__close")),
    lightboxImage: visible(lightboxImage)
      ? {
          complete: lightboxImage.complete,
          width: lightboxImage.naturalWidth,
          height: lightboxImage.naturalHeight,
          src: lightboxImage.src,
        }
      : null,
    detachedPlayersPaused: state.players
      .filter((candidate) => !candidate.isConnected)
      .every((candidate) => candidate.paused),
  };
}

export async function cleanupRenderer(ownerToken) {
  const state = window.__poracodeEditorMediaSmoke;
  if (!state || state.ownerToken !== ownerToken) return "not-needed";
  const failures = [];
  const attempt = (action) => {
    try {
      action();
    } catch (error) {
      failures.push(String(error));
    }
  };
  attempt(() => document.querySelector(".poracode-image-lightbox__close")?.click());
  for (const remove of state.listeners) attempt(remove);
  for (const player of state.players) attempt(() => player.pause());
  attempt(() => state.store.getState().clearSession());
  const stores = window.__poracodeDev.stores;
  attempt(() => stores.app.setState({ view: state.originalView }));
  attempt(() => stores.panel.setState(state.originalPanel));
  attempt(() => state.store.setState(state.originalEditor));
  delete window.__poracodeEditorMediaSmoke;
  if (failures.length)
    throw new Error(`editor media renderer cleanup failed: ${failures.join("; ")}`);
  return "pass";
}
