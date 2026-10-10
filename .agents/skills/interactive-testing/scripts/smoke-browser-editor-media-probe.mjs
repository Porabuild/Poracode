import assert from "node:assert/strict";

const PLAYER_CHECKS = [
  "decoded-metadata",
  "play-progress",
  "completed-seek",
  "changed-file-reload",
  "corrupt-recovery",
  "detached-pause",
];
export const MEDIA_CHECKS = {
  image: ["decoded-image", "lightbox", "changed-file-reload"],
  "svg-source-preview": ["source", "unsaved-edit", "inert-preview", "source-roundtrip"],
  audio: PLAYER_CHECKS,
  video: PLAYER_CHECKS,
};

export const normalizeSource = (text) => text.replace(/[\s\u200b]/gu, "");
export const svgSource = (width, height, token) => {
  const payload = `document.documentElement.setAttribute('data-browser-editor-media-${token}','${token}')`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" onload="${payload}">\n<script>${payload}</script>\n<rect width="100%" height="100%" fill="#2070d0" data-browser-editor-media-inline="${token}"/>\n</svg>\n`;
};
export function assertSvgSource(value, content, dirty) {
  assert.equal(value.sourceVisible, true, "visible SVG source is missing");
  assert.equal(normalizeSource(value.sourceText), normalizeSource(content), "SVG source mismatch");
  assert.equal(value.saveDisabled, !dirty, "SVG unsaved UI state mismatch");
}

export function assertBrowserMediaSurface(value, { origin, compact }) {
  assert.equal(value.origin, origin, "wrong browser origin");
  assert.equal(value.hasHost, false, "Electron cannot qualify real web media");
  assert.equal(value.visibility, "visible", "browser document is hidden");
  assert.equal(value.rootVisible, true, "mounted app root is hidden or missing");
  assert.equal(value.compact, compact, "wrong actual data-compact-layout attribute");
  assert.equal(value.width, compact ? 390 : 1280, "wrong web viewport width");
}

export function assertBrowserMediaInputs({ origin, compact, fixtureFiles }) {
  assert.equal(typeof compact, "boolean", "compact expectation must be explicit");
  const url = new URL(origin);
  assert(
    ["http:", "https:"].includes(url.protocol) && url.origin === origin,
    "exact HTTP(S) origin required",
  );
  for (const [kind, ext] of Object.entries({
    image: "png",
    svg: "svg",
    audio: "wav",
    video: "webm",
  })) {
    const path = fixtureFiles?.[kind];
    assert(
      typeof path === "string" &&
        /^[a-zA-Z0-9._ /-]+$/u.test(path) &&
        path.endsWith(`.${ext}`) &&
        path.split("/").every((part) => part && part !== "." && part !== ".."),
      `invalid relative ${kind} fixture`,
    );
  }
  assert.equal(new Set(Object.values(fixtureFiles)).size, 4, "duplicate fixture paths");
}

export function mediaTicket(src) {
  const url = new URL(src);
  assert(["http:", "https:"].includes(url.protocol), "media bypassed the real web grant");
  assert.equal(url.pathname, "/api/files/media", "media bypassed the real media ticket path");
  assert(url.searchParams.get("ticket"), "media ticket is missing");
  return url.searchParams.get("ticket");
}

export function assertDecodedImage(value, width, height) {
  assert.equal(value.image?.complete, true, "image did not complete decoding");
  assert.equal(value.image.width, width, "decoded image width mismatch");
  assert.equal(value.image.height, height, "decoded image height mismatch");
  assert(value.details.includes(`${width} × ${height}`), "rendered image dimensions are missing");
}

export function assertDecodedMedia(value, { kind, duration, previousSrc, retainedTime }) {
  const player = value.player;
  assert.equal(player?.kind, kind, "mounted native player is missing or wrong");
  assert(
    player.readyState >= 2 && Number.isFinite(player.duration) && player.duration > 0,
    "media has no finite decoded metadata",
  );
  assert(Math.abs(player.duration - duration) < 0.1, "decoded duration mismatch");
  assert.equal(player.error, null, "native decoder reported an error");
  assert.equal(player.controls, true, "native controls are missing");
  assert.equal(player.autoplay, false, "player has autoplay enabled");
  assert.equal(player.paused, true, "player unexpectedly autoplayed");
  assert(value.details.includes(`0:0${duration}`), "rendered duration is missing");
  assert.equal(value.saveDisabled, true, "binary media enabled text save");
  const ticket = mediaTicket(player.src);
  if (kind === "video") {
    assert.equal(player.width, 64, "decoded video width mismatch");
    assert.equal(player.height, 48, "decoded video height mismatch");
    assert(value.details.includes("64 × 48"), "rendered video dimensions are missing");
  }
  if (previousSrc) assert.notEqual(ticket, mediaTicket(previousSrc), "reload reused the old grant");
  if (retainedTime !== undefined) {
    assert.equal(player.seeking, false, "reload seek has not completed");
    assert(Math.abs(player.time - retainedTime) < 0.08, "reload lost the paused seek position");
  }
}

export function assertPlaybackProgress(before, after) {
  assert.equal(after.player?.id, before.player?.id, "playback changed player identity");
  assert.equal(after.player?.paused, false, "player never started");
  assert.equal(after.player.muted, true, "qualification playback must be muted");
  assert(
    Number.isFinite(after.player.time) && after.player.time - before.player.time >= 0.12,
    "playback time did not advance",
  );
  assert(after.events.play > (before.events.play ?? 0), "native play event was not observed");
  assert(after.events.timeupdate > (before.events.timeupdate ?? 0), "missing native timeupdate");
}

export function assertCompletedSeek(before, after, target = 0.8) {
  assert.equal(after.player?.id, before.player?.id, "seek changed player identity");
  assert.equal(after.player?.paused, true, "seek did not stay paused");
  assert.equal(after.player.seeking, false, "native seek did not complete");
  assert(
    Number.isFinite(after.player.time) && Math.abs(after.player.time - target) < 0.08,
    "native seek position mismatch",
  );
  assert(after.events.seeked > (before.events.seeked ?? 0), "native seeked event was not observed");
}

export function assertDetachedPause(before, after) {
  assert(before.player?.id && !before.player.paused, "detachment requires a playing player");
  const detached = after.observedPlayers.find((player) => player.id === before.player.id);
  assert(detached, "previously playing player was not observed after detachment");
  assert.equal(detached.connected, false, "previous player did not detach through UI navigation");
  assert.equal(detached.paused, true, "detached native player kept playing");
  assert(detached.events.pause > (before.events.pause ?? 0), "detached player emitted no pause");
}

/** Pure coverage admission: dispatch receipts never satisfy a required DOM oracle. */
export function finalizeBrowserMediaLedger(ledger) {
  const dimensions = ledger.dimensions.map((row) => {
    const missing = MEDIA_CHECKS[row.id].filter(
      (id) => !row.checks.some((check) => check.id === id && check.status === "pass"),
    );
    return {
      ...row,
      status: row.status === "pass" && missing.length ? "unqualified" : row.status,
      missingOracles: missing,
    };
  });
  const failed = ledger.failures.length > 0 || dimensions.some((row) => row.status === "fail");
  const qualified =
    !failed &&
    ledger.environment?.status === "pass" &&
    ledger.cleanup.status === "pass" &&
    dimensions.every((row) => row.status === "pass");
  return {
    ...ledger,
    dimensions,
    status: failed ? "fail" : qualified ? "pass" : "unqualified",
    surfaceMediaQualified: qualified,
    allMediaQualified: false, // One invocation cannot qualify the required paired surface or PWA/device gates.
    unqualified: [
      ...[
        "paired-web-desktop-and-compact",
        "installed-pwa",
        "physical-mobile",
        "safari-ios",
        "native-ios-android",
        "normal-background",
        "native-player-pointer-controls",
        "pwa-lifecycle-offline-upgrade",
        "real-codec-breadth",
        "svg-disk-autosave-audit",
      ].map((id) => ({
        id,
        requiredFor: id.startsWith("paired-") ? "paired-media" : "external-gate",
        detail: "unreached by one visible browser DOM/API run",
      })),
      ...dimensions
        .filter((row) => row.status === "unqualified")
        .map((row) => ({
          id: row.id,
          required: true,
          detail: row.detail,
          missingOracles: row.missingOracles,
        })),
    ],
  };
}

/** Evaluated as a CDP remote object. Its closure owns references/listeners; no app/global state is installed. */
export function createBrowserMediaProbe(token) {
  const sentinel = `data-browser-editor-media-${token}`;
  if (document.documentElement.hasAttribute(sentinel))
    throw new Error("SVG sentinel already exists");
  const observed = [];
  let cleaned = false;
  const playerSelector =
    '[data-testid="native-media-view"] audio,[data-testid="native-media-view"] video';
  const visible = (element, appRoot = false) => {
    if (!element?.isConnected || element.closest(appRoot ? "[hidden]" : "[hidden],[inert]"))
      return false;
    const rect = element.getBoundingClientRect();
    if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.right > 0 &&
      rect.bottom > 0 &&
      rect.left < innerWidth &&
      rect.top < innerHeight
    );
  };
  const one = (selector) => {
    const matches = [...document.querySelectorAll(selector)].filter((element) => visible(element));
    if (matches.length > 1) throw new Error(`ambiguous mounted media/source: ${selector}`);
    return matches[0];
  };
  const imageData = (image) =>
    image
      ? {
          src: image.currentSrc || image.src,
          complete: image.complete,
          width: image.naturalWidth,
          height: image.naturalHeight,
        }
      : null;
  const playerData = (player) =>
    player
      ? {
          id: observed.find((row) => row.element === player)?.id ?? null,
          kind: player.tagName.toLowerCase(),
          src: player.currentSrc || player.src,
          readyState: player.readyState,
          duration: player.duration,
          time: player.currentTime,
          paused: player.paused,
          seeking: player.seeking,
          muted: player.muted,
          controls: player.controls,
          autoplay: player.autoplay,
          error: player.error ? { code: player.error.code, message: player.error.message } : null,
          width: player.videoWidth ?? null,
          height: player.videoHeight ?? null,
        }
      : null;
  const mountedPlayer = () => {
    if (cleaned) throw new Error("media probe has been cleaned");
    const player = one(playerSelector);
    if (!player) throw new Error("mounted native player is missing or hidden");
    return player;
  };
  const read = () => {
    const player = one(playerSelector);
    const source = one(".monaco-editor .view-lines");
    const input = source
      ?.closest(".monaco-editor")
      ?.querySelector(
        'textarea.inputarea,[contenteditable="true"][role="textbox"],.native-edit-context[role="textbox"]',
      );
    const save = one('button[aria-label="Save"]');
    return {
      surface: {
        origin: location.origin,
        pathname: location.pathname,
        hasHost: "poracodeHost" in window,
        visibility: document.visibilityState,
        rootVisible:
          visible(document.querySelector("#root"), true) &&
          Boolean(document.querySelector("#root")?.childElementCount),
        compact: document.documentElement.hasAttribute("data-compact-layout"),
        width: innerWidth,
        height: innerHeight,
        standalone: document.documentElement.hasAttribute("data-mobile-standalone"),
        coarse: document.documentElement.hasAttribute("data-coarse-input"),
      },
      image: imageData(one('[data-testid="image-file-view"] img')),
      lightbox: Boolean(one(".poracode-image-lightbox__close")),
      lightboxImage: imageData(one(".poracode-image-lightbox__image")),
      player: playerData(player),
      events: { ...(observed.find((row) => row.element === player)?.events ?? {}) },
      observedPlayers: observed.map((row) => ({
        id: row.id,
        connected: row.element.isConnected,
        paused: row.element.paused,
        time: row.element.currentTime,
        events: { ...row.events },
      })),
      details: one('[data-testid="media-details"]')?.textContent ?? "",
      fallback: [...document.querySelectorAll("div")].some(
        (element) =>
          element.childElementCount === 0 &&
          visible(element) &&
          ["This media preview is unavailable.", "This SVG can't be displayed."].includes(
            element.textContent,
          ),
      ),
      saveDisabled: save
        ? Boolean(save.disabled || save.getAttribute("aria-disabled") === "true")
        : null,
      sourceVisible: Boolean(source),
      sourceText: source?.textContent ?? "",
      sourceEditable: Boolean(
        input &&
        !input.disabled &&
        !input.readOnly &&
        input.getAttribute("aria-readonly") !== "true" &&
        (!input.matches(".native-edit-context") || input.editContext != null),
      ),
      sourceFocused: Boolean(document.activeElement?.closest(".monaco-editor")),
      sourceInputKind: input?.matches(".native-edit-context")
        ? "native-edit-context"
        : "text-input",
      sourceSelection: input?.editContext
        ? {
            text: input.editContext.text,
            start: input.editContext.selectionStart,
            end: input.editContext.selectionEnd,
          }
        : null,
      mac: /Mac/i.test(navigator.platform),
      previewControls: document.querySelectorAll('button[aria-label="Show preview"]').length,
      svgExecuted: document.documentElement.hasAttribute(sentinel),
      inlineSvgPayload: Boolean(
        document.querySelector(`[data-browser-editor-media-inline="${token}"]`),
      ),
    };
  };
  return {
    read,
    observe() {
      const player = mountedPlayer();
      if (!observed.some((row) => row.element === player)) {
        const row = {
          id: observed.length + 1,
          element: player,
          muted: player.muted,
          events: {},
          listeners: [],
        };
        observed.push(row); // Register cleanup ownership before any mutation/listener installation.
        for (const name of ["play", "pause", "timeupdate", "seeked", "error"]) {
          const listener = () => {
            row.events[name] = (row.events[name] ?? 0) + 1;
          };
          row.listeners.push([name, listener]);
          player.addEventListener(name, listener);
        }
      }
      player.muted = true;
      return read();
    },
    async play() {
      const player = mountedPlayer();
      if (!observed.some((row) => row.element === player) || !player.muted)
        throw new Error("muted player observation is required before play");
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
    },
    pause() {
      mountedPlayer().pause();
    },
    seek(time) {
      const player = mountedPlayer();
      let seekable = false;
      for (let i = 0; i < player.seekable.length; i++)
        seekable ||= player.seekable.start(i) <= time && time <= player.seekable.end(i);
      if (!player.paused || !Number.isFinite(time) || !seekable)
        throw new Error("paused seekable native player is required");
      player.currentTime = time;
    },
    cleanup() {
      const failures = [];
      let listenersRemoved = 0;
      const attempt = (action) => {
        try {
          action();
        } catch (error) {
          failures.push(String(error));
        }
      };
      for (const row of observed) {
        for (const [name, listener] of row.listeners)
          attempt(() => {
            row.element.removeEventListener(name, listener);
            listenersRemoved++;
          });
        row.listeners.length = 0;
        attempt(() => row.element.pause());
        attempt(() => {
          row.element.muted = row.muted;
        });
      }
      attempt(() => {
        if (!document.documentElement.hasAttribute(sentinel)) return;
        if (document.documentElement.getAttribute(sentinel) !== token)
          throw new Error("SVG sentinel ownership changed");
        document.documentElement.removeAttribute(sentinel);
      });
      cleaned = true;
      if (failures.length) throw new Error(`media probe cleanup failed: ${failures.join("; ")}`);
      return { status: "pass", listenersRemoved, playersPaused: observed.length };
    },
  };
}
