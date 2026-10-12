import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { clickCdpLabel } from "./poracode-cdp-actions.mjs";
import {
  validateFixture,
  ownFixtureFiles,
  png,
  wav,
  webm,
  svg,
} from "./smoke-editor-media-fixtures.mjs";
import {
  setupRenderer,
  rendererAction,
  rendererRead,
  cleanupRenderer,
} from "./smoke-editor-media-renderer.mjs";

const WAIT_MS = 8_000;
const detail = (error) => (error instanceof Error ? error.message : String(error));

/**
 * Deterministic desktop integration through real editor reads, media tickets and UI.
 * Today's Electron client cannot cover paired compact: always reject with a coverage ledger
 * (also written as editor-media-coverage.json), so the parent cannot stamp a blanket PASS.
 * Synthetic PCM/VP8 decode is not real codec/provider/device or native-control input evidence.
 */
export async function mockEditorMediaGate({
  client,
  evaluate,
  waitForValue,
  bridgeInvoke,
  screenshot,
  outDir,
  fixture,
}) {
  const coverage = {
    schemaVersion: 1,
    gate: "editor-media",
    status: "unqualified",
    surface: "managed DEV mock Electron desktop",
    dimensions: ["image", "svg-source-preview", "audio", "video"].map((id) => ({
      id,
      status: "unqualified",
      detail: "not exercised",
      checks: [],
    })),
    unqualified: [
      {
        id: "paired-compact-pwa",
        required: true,
        detail:
          "Electron disables compact layout; requires a separately authorized paired browser/PWA gate",
      },
      {
        id: "real-codecs-provider-device",
        required: false,
        detail: "synthetic bounded PNG/PCM/VP8 only; no credentials, devices or provider involved",
      },
      {
        id: "native-player-pointer-controls",
        required: false,
        detail:
          "play/pause/seek use native DOM APIs on the mounted UI; browser shadow controls are not driven",
      },
    ],
    cleanup: { renderer: "not-needed", files: "not-needed" },
    fixtures: [],
  };
  const errors = [];
  const ownerToken = randomUUID();
  let owned;
  let rendererOwned = false;
  let artifactsAllowed = false;
  const expression = (fn, ...args) =>
    `(${fn.toString()})(${args.map((arg) => JSON.stringify(arg)).join(",")})`;
  const run = (fn, ...args) => evaluate(client, expression(fn, ...args), true);
  const action = (name, value = null) => run(rendererAction, name, value, ownerToken);
  const read = () => run(rendererRead, ownerToken);
  const wait = async (predicate, label, allowFailure = false) => {
    const started = Date.now();
    return waitForValue(
      async () => {
        const value = await read();
        if (!allowFailure && Date.now() - started > 300 && (value.player?.error || value.fallback))
          throw new Error(`${label}: media failed to decode`);
        if (Date.now() - started > WAIT_MS)
          throw new Error(`${label}: bounded media deadline exceeded`);
        return value;
      },
      (value) => (allowFailure || !(value.player?.error || value.fallback)) && predicate(value),
      label,
    );
  };
  const click = (label) => clickCdpLabel({ client, evaluate, label });
  const write = async (name, bytes) => {
    const metadata = await owned.write(name, bytes);
    coverage.fixtures.push({ path: owned.relative(name), ...metadata });
  };
  const openFile = async (name, expectedStatus) => {
    const path = owned.relative(name);
    const bridged = await bridgeInvoke(client, "readProjectFile", {
      projectLocation: fixture.project.location,
      path,
    });
    assert.equal(bridged.status, expectedStatus, `${name}: real preload file read failed`);
    const opened = await action("open", path);
    assert.equal(opened.status, expectedStatus, `${name}: real editor file read failed`);
    await wait(
      (value) => value.activePath === path && value.buffer?.status === expectedStatus,
      `${name} editor buffer`,
      true,
    );
    return path;
  };
  const decodedImage = (width, height) =>
    wait(
      (value) =>
        value.image?.complete &&
        value.image.width === width &&
        value.image.height === height &&
        value.details.includes(`${width} × ${height}`),
      "decoded image and rendered dimensions",
    );
  const record = (id, check) => coverage.dimensions.find((row) => row.id === id).checks.push(check);
  const dimension = async (id, exercise) => {
    const row = coverage.dimensions.find((candidate) => candidate.id === id);
    try {
      row.detail = await exercise();
      row.status = "pass";
    } catch (error) {
      row.status = detail(error).includes("UNQUALIFIED:") ? "unqualified" : "fail";
      row.detail = detail(error);
      errors.push(error);
      try {
        await screenshot(client, join(outDir, `editor-media-${id}-failure.png`));
      } catch (captureError) {
        errors.push(captureError);
      }
    }
  };
  try {
    const validated = await validateFixture(fixture, outDir);
    const { session } = validated;
    artifactsAllowed = true;
    // Mark the cleanup obligation before the call: a setup exception may follow a mutation.
    rendererOwned = true;
    const surface = await run(setupRenderer, {
      token: session.token,
      project: fixture.project,
      ownerToken,
    });
    assert.equal(surface.desktop, true);
    assert.equal(surface.compact, false, "Electron cannot qualify a compact/PWA media surface");
    owned = await ownFixtureFiles(validated);
    coverage.cleanup = { renderer: "pending", files: "pending" };
    await dimension("image", async () => {
      await write("picture.png", png(24, 16, [32, 112, 208]));
      await openFile("picture.png", "binary");
      const initial = await decodedImage(24, 16);
      assert.equal(initial.saveDisabled, true, "image must not enable a text save");
      assert.equal(
        new URL(initial.image.src).pathname,
        "/api/files/media",
        "image bypassed the real media ticket path",
      );
      record("image", "decoded 24 × 16 PNG through real media ticket; binary save disabled");
      await click("Open image preview");
      await wait(
        (value) =>
          value.lightbox &&
          value.lightboxImage?.complete &&
          value.lightboxImage.width === 24 &&
          value.lightboxImage.height === 16 &&
          value.lightboxImage.src === initial.image.src,
        "decoded image lightbox opened",
      );
      await screenshot(client, join(outDir, "editor-media-image-lightbox.png"));
      await click("Close preview");
      await wait((value) => !value.lightbox, "image lightbox closed");
      record("image", "opened and closed image lightbox through guarded pointer input");
      await write("picture.png", png(32, 20, [208, 48, 32]));
      await click("Reload preview");
      const reloaded = await decodedImage(32, 20);
      assert.notEqual(reloaded.image.src, initial.image.src, "image reload reused the old grant");
      record("image", "changed PNG reloaded to 32 × 20 with a new media source");
      await screenshot(client, join(outDir, "editor-media-image-reloaded.png"));
      await write("picture.png", Buffer.from("invalid synthetic PNG"));
      await click("Reload preview");
      await wait((value) => value.fallback && !value.image, "corrupt image fallback", true);
      await write("picture.png", png(40, 24, [32, 160, 64]));
      await click("Reload preview");
      await decodedImage(40, 24);
      record("image", "corrupt image fallback and recovery decoded 40 × 24");
      return "real binary read, decoded PNG dimensions, lightbox, changed-file reload, corrupt-file fallback and recovery";
    });
    await dimension("svg-source-preview", async () => {
      const original = svg(18, 12);
      const edited = svg(36, 18);
      const changed = svg(40, 24);
      await write("drawing.svg", original);
      const path = await openFile("drawing.svg", "ready");
      await wait(
        (value) => value.sourceVisible && value.sourceValue === original && !value.image,
        "real SVG source model",
      );
      record("svg-source-preview", "real file read and visible Monaco SVG source model");
      await action("edit");
      await client.send("Input.insertText", { text: edited });
      await wait(
        (value) =>
          value.buffer?.isDirty && value.sourceValue === edited && value.buffer.content === edited,
        "SVG edits reached the real editor buffer",
      );
      const onDisk = await bridgeInvoke(client, "readProjectFile", {
        projectLocation: fixture.project.location,
        path,
      });
      assert.equal(onDisk.content, original, "SVG preview must not auto-save unsaved edits");
      await click("Show preview");
      const preview = await decodedImage(36, 18);
      assert(
        preview.image.src.startsWith("data:image/svg+xml;"),
        "SVG is not rendered as an inert image",
      );
      assert.equal(preview.svgExecutions, 0, "SVG executed its active payload");
      assert.equal(preview.inlineSvgPayload, false, "SVG payload entered the live DOM");
      record(
        "svg-source-preview",
        "Monaco input reached unsaved buffer; inert 36 × 18 preview executed no sentinels and did not auto-save",
      );
      await screenshot(client, join(outDir, "editor-media-svg-unsaved-preview.png"));
      await click("Show source");
      await wait(
        (value) => value.sourceVisible && value.sourceValue === edited && value.buffer.isDirty,
        "SVG source restored without losing unsaved edits",
      );
      await write("drawing.svg", changed);
      await action("refresh", path);
      await wait(
        (value) => value.sourceValue === changed && !value.buffer.isDirty,
        "changed SVG reloaded through the real file reader",
      );
      await click("Show preview");
      const refreshed = await decodedImage(40, 24);
      assert.equal(refreshed.svgExecutions, 0);
      assert.equal(refreshed.inlineSvgPayload, false);
      record(
        "svg-source-preview",
        "source/preview round-trip retained edits; disk refresh decoded changed 40 × 24 SVG",
      );
      await screenshot(client, join(outDir, "editor-media-svg-reloaded.png"));
      return "real Monaco source input, unsaved inert SVG preview/source round-trip, no script/inline payload execution, disk refresh and changed preview";
    });
    for (const kind of ["audio", "video"])
      await dimension(kind, async () => {
        const name = kind === "audio" ? "tone.wav" : "clip.webm";
        const initialBytes = kind === "audio" ? wav(2) : webm(await action("frame", "#2070d0"), 2);
        const changedBytes = kind === "audio" ? wav(3) : webm(await action("frame", "#d03020"), 3);
        await write(name, initialBytes);
        await openFile(name, "binary");
        const ready = await wait(
          (value) =>
            value.player?.kind === kind &&
            value.player.readyState >= 2 &&
            Math.abs(value.player.duration - 2) < 0.1 &&
            value.details.includes("0:02") &&
            (kind !== "video" || value.details.includes("64 × 48")),
          `${kind} decoded finite metadata`,
        );
        assert.equal(ready.player.paused, true, `${kind} autoplayed on open`);
        assert.equal(ready.player.autoplay, false);
        assert.equal(ready.player.controls, true);
        assert.equal(ready.saveDisabled, true);
        assert.equal(new URL(ready.player.src).pathname, "/api/files/media");
        if (kind === "video") {
          assert.equal(ready.player.width, 64);
          assert.equal(ready.player.height, 48);
        }
        record(
          kind,
          "decoded two-second synthetic media through real ticket; native controls, no autoplay, binary save disabled",
        );
        await action("observe");
        const played = await client.send("Runtime.evaluate", {
          expression: expression(rendererAction, "play", null, ownerToken),
          returnByValue: true,
          awaitPromise: true,
          userGesture: true,
        });
        if (played.exceptionDetails)
          throw new Error(
            played.exceptionDetails.exception?.description ?? played.exceptionDetails.text,
          );
        await wait(
          (value) =>
            !value.player?.paused &&
            value.player.time >= 0.12 &&
            value.events.play > 0 &&
            value.events.timeupdate > 0,
          `${kind} actual playback advancement`,
        );
        await action("pause");
        const paused = await read();
        assert.equal(paused.player.paused, true);
        assert(
          paused.player.seekable.some(([start, end]) => start <= 0.8 && end >= 0.8),
          `${kind} did not expose a seekable range`,
        );
        const seekEvents = paused.events.seeked ?? 0;
        await action("seek", 0.8);
        await wait(
          (value) =>
            value.player?.paused &&
            !value.player.seeking &&
            Math.abs(value.player.time - 0.8) < 0.1 &&
            value.events.seeked > seekEvents,
          `${kind} completed native seek`,
        );
        record(
          kind,
          "muted playback advanced and emitted native events; pause and 0.8-second seek completed",
        );
        await screenshot(client, join(outDir, `editor-media-${kind}-seek.png`));
        await write(name, changedBytes);
        await click("Reload preview");
        const reloaded = await wait(
          (value) =>
            value.player?.readyState >= 2 &&
            Math.abs(value.player.duration - 3) < 0.1 &&
            value.player.src !== ready.player.src &&
            value.details.includes("0:03"),
          `${kind} changed-file reload`,
        );
        await action("observe");
        await action("pause");
        record(kind, "changed file decoded with three-second duration and a new media source");
        await screenshot(client, join(outDir, `editor-media-${kind}-reloaded.png`));
        await write(name, Buffer.from(`invalid synthetic ${kind}`));
        await click("Reload preview");
        await wait(
          (value) => value.fallback && !value.player,
          `${kind} corrupt-file fallback`,
          true,
        );
        await write(name, initialBytes);
        await click("Reload preview");
        await wait(
          (value) =>
            value.player?.readyState >= 2 &&
            Math.abs(value.player.duration - 2) < 0.1 &&
            value.player.paused,
          `${kind} recovered from corrupt file`,
        );
        await action("observe");
        record(kind, "corrupt media fallback and recovery decoded the original two-second file");
        assert.equal(
          (await read()).detachedPlayersPaused,
          true,
          `${kind} continued playback after unmount`,
        );
        assert.equal(reloaded.player.paused, true, `${kind} reload unexpectedly autoplayed`);
        assert(
          Math.abs(reloaded.player.time - 0.8) < 0.1,
          `${kind} reload lost the paused seek position`,
        );
        record(kind, "reload retained paused seek position; detached players paused");
        return "real mounted native player decoded bounded synthetic media; no autoplay, muted play/time advancement, pause, completed seek, changed-file reload retaining paused position, corrupt-file fallback/recovery and detached-player pause";
      });
  } catch (error) {
    errors.push(error);
  } finally {
    // Independent obligations: renderer disconnection must never strand owned files.
    if (rendererOwned) {
      try {
        coverage.cleanup.renderer = await run(cleanupRenderer, ownerToken);
      } catch (error) {
        coverage.cleanup.renderer = "fail";
        errors.push(error);
      }
    }
    if (owned) {
      try {
        await owned.cleanup();
        coverage.cleanup.files = "pass";
      } catch (error) {
        coverage.cleanup.files = "fail";
        errors.push(error);
      }
    }
    coverage.status = errors.length ? "fail" : "unqualified";
    coverage.errors = errors.map(detail);
    if (artifactsAllowed) {
      try {
        await writeFile(
          join(outDir, "editor-media-coverage.json"),
          JSON.stringify(coverage, null, 2) + "\n",
        );
      } catch (error) {
        errors.push(error);
        coverage.status = "fail";
        coverage.errors.push(detail(error));
      }
    }
  }
  const summary = coverage.dimensions.map((row) => `${row.id}=${row.status}`).join(", ");
  const unqualified = coverage.unqualified
    .map((row) => `UNQUALIFIED ${row.id}: ${row.detail}`)
    .join("; ");
  const error = new AggregateError(
    errors,
    `editor-media ${coverage.status}: ${summary}; ${coverage.errors.join("; ")}; ${unqualified}`,
  );
  error.code = errors.length ? "EDITOR_MEDIA_FAILED" : "EDITOR_MEDIA_UNQUALIFIED";
  error.coverage = coverage;
  throw error;
}
