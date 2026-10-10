import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { clickCdpElements, clickCdpLabel } from "./poracode-cdp-actions.mjs";
import {
  MEDIA_CHECKS,
  assertBrowserMediaSurface,
  assertBrowserMediaInputs,
  assertDecodedImage,
  assertDecodedMedia,
  assertPlaybackProgress,
  assertCompletedSeek,
  assertDetachedPause,
  mediaTicket,
  finalizeBrowserMediaLedger,
  createBrowserMediaProbe,
  normalizeSource,
  svgSource,
  assertSvgSource,
} from "./smoke-browser-editor-media-probe.mjs";
import {
  ownedSvgDimensionSources,
  replaceNativeSvgDimensions,
} from "./smoke-browser-editor-source-input.mjs";

const detail = (error) => (error instanceof Error ? error.message : String(error));
const hash = (text) => createHash("sha256").update(text).digest("hex");
const unqualified = (message) => Object.assign(new Error(message), { code: "UNQUALIFIED" });

/**
 * Parent owns pairing, browser/host/CDP lifecycle, English UI, fixture ownership and teardown.
 * fixtureFiles = {image, svg, audio, video}: distinct project-relative PNG/SVG/WAV/WEBM paths.
 * openFile(path) must use real UI and return {path, via:"ui"}; this is a receipt, never an oracle.
 * replaceFile(path, {kind,variant,width?,height?,duration?,content?}) writes ONLY parent-owned
 * private fixtures and returns {path,variant,sizeBytes,sha256}. Variants: initial/changed/corrupt/
 * recovered. PNG: initial 24x16, changed 32x20; WAV and 64x48 WEBM: 2s/3s/invalid/2s.
 * SVG content is supplied verbatim. Parent owns fixture removal after the paired runs.
 * evaluate(client, expression) supports the guarded pointer helper. waitForValue(get,predicate,
 * label) must poll and reject on a bounded deadline (<=8s); its return is rechecked here.
 * screenshot(client,path) captures through the parent's existing session. No files/JSON are
 * written directly. DOM observations are recorded separately from all callback receipts.
 * Call once at 1280px/compact=false and once at 390px/compact=true; combine in the parent.
 */
export async function runBrowserEditorMediaChecks({
  client,
  evaluate,
  waitForValue,
  screenshot,
  outDir,
  origin,
  compact,
  openFile,
  replaceFile,
  fixtureFiles,
}) {
  const token = randomUUID();
  const group = `browser-editor-media-${token}`;
  const labelPrefix = compact ? "compact-web" : "desktop-web";
  const ledger = {
    schemaVersion: 1,
    gate: "browser-editor-media",
    surface: labelPrefix,
    environment: { status: "unqualified" },
    dimensions: Object.keys(MEDIA_CHECKS).map((id) => ({
      id,
      required: true,
      status: "unqualified",
      detail: "not exercised",
      checks: [],
    })),
    receipts: [],
    screenshots: [],
    failures: [],
    cleanup: { status: "pending" },
  };
  let objectId;
  let svgEdited = false;
  const originalSvg = svgSource(18, 12, token);
  const editedSvg = svgSource(36, 18, token);
  const editedSrc = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(editedSvg)}`;
  const failure = (id, error) => ledger.failures.push({ id, detail: detail(error) });
  const resultValue = (result) => {
    const error = result.exceptionDetails;
    if (error) throw new Error(error.exception?.description ?? error.text);
    return result.result?.value;
  };
  const call = async (method, ...args) => {
    const value = resultValue(
      await client.send("Runtime.callFunctionOn", {
        objectId,
        functionDeclaration: "function(method, ...args) { return this[method](...args); }",
        arguments: [method, ...args].map((arg) => ({ value: arg })),
        returnByValue: true,
        awaitPromise: true,
        userGesture: method === "play",
      }),
    );
    if (method === "cleanup")
      assert.equal(value?.status, "pass", "probe cleanup was not confirmed");
    return value;
  };
  const read = async () => {
    const value = await call("read");
    assertBrowserMediaSurface(value.surface, { origin, compact });
    return value;
  };
  const wait = async (oracle, label, allowFailure = false) => {
    const deadline = Date.now() + 8_000;
    const value = await waitForValue(
      async () => {
        assert(Date.now() < deadline, `${label}: bounded media deadline exceeded`);
        const current = await read();
        if (!allowFailure && (current.player?.error || current.fallback))
          throw new Error(`${label}: media failed to decode`);
        return current;
      },
      (current) => {
        try {
          oracle(current);
          return true;
        } catch {
          return false;
        }
      },
      label,
    );
    oracle(value);
    return value;
  };
  const click = (label) => clickCdpLabel({ client, evaluate, label });
  const capture = async (name) => {
    const path = join(outDir, `browser-editor-media-${labelPrefix}-${name}.png`);
    await screenshot(client, path);
    ledger.screenshots.push(path);
  };
  const record = (id, check, evidence) =>
    ledger.dimensions
      .find((row) => row.id === id)
      .checks.push({ id: check, status: "pass", evidence });
  const evidence = ({ player, image, events }) => {
    const { src, ...decoded } = player ?? image;
    return { ...decoded, sourceSha256: hash(src), ...(player ? { events } : {}) };
  };
  const svgCheck = (check, proof) => record("svg-source-preview", check, proof);
  const decodedMedia = (kind, duration, extra = {}) =>
    wait(
      (value) => assertDecodedMedia(value, { kind, duration, ...extra }),
      `${kind} decoded/reload metadata`,
    );
  const play = async () => {
    const before = await call("observe");
    await call("play");
    return wait((value) => assertPlaybackProgress(before, value), "native playback progress");
  };
  const replace = async (kind, variant) => {
    const request = { kind, variant };
    if (variant !== "corrupt") {
      if (kind === "image")
        [request.width, request.height] = variant === "changed" ? [32, 20] : [24, 16];
      else if (kind === "svg") request.content = originalSvg;
      else {
        request.duration = variant === "changed" ? 3 : 2;
        if (kind === "video") {
          request.width = 64;
          request.height = 48;
        }
      }
    }
    const receipt = await replaceFile(fixtureFiles[kind], request);
    assert.equal(receipt?.path, fixtureFiles[kind], "replacement receipt path mismatch");
    assert.equal(receipt.variant, variant, "replacement receipt variant mismatch");
    assert(
      Number.isInteger(receipt.sizeBytes) && receipt.sizeBytes > 0 && receipt.sizeBytes <= 512_000,
      "replacement size is invalid",
    );
    assert(/^[a-f0-9]{64}$/u.test(receipt.sha256), "replacement hash is missing");
    if (kind === "svg")
      assert.equal(receipt.sha256, hash(originalSvg), "SVG fixture content mismatch");
    const { path, sizeBytes, sha256 } = receipt;
    ledger.receipts.push({ operation: "replace", kind, path, variant, sizeBytes, sha256 });
  };
  const open = async (kind) => {
    await read();
    const receipt = await openFile(fixtureFiles[kind]);
    assert.equal(receipt?.path, fixtureFiles[kind], "UI open receipt path mismatch");
    assert.equal(receipt.via, "ui", "file must be opened through real UI");
    ledger.receipts.push({ operation: "open", path: receipt.path, via: receipt.via });
  };
  const dimension = async (id, exercise) => {
    const row = ledger.dimensions.find((candidate) => candidate.id === id);
    try {
      await exercise();
      row.status = "pass";
      row.detail = "required DOM/media oracles reached";
    } catch (error) {
      row.status = error?.code === "UNQUALIFIED" ? "unqualified" : "fail";
      row.detail = detail(error);
      if (row.status === "fail") failure(id, error);
      try {
        await capture(`${id}-${row.status}`);
      } catch (captureError) {
        failure(`${id}-screenshot`, captureError);
      }
    }
  };
  const decodedImage = (width, height) =>
    wait((value) => assertDecodedImage(value, width, height), "decoded image dimensions");
  const closeLightbox = async () => {
    if (!(await read()).lightbox) return;
    await click("Close preview");
    await wait((value) => assert(!value.lightbox), "lightbox cleanup");
  };
  const inputSvg = async (content) => {
    await clickCdpElements({
      client,
      evaluate,
      elementsExpression: '[...document.querySelectorAll(".monaco-editor .view-lines")]',
      label: "SVG source editor",
    });
    const focused = await read();
    assert(focused.sourceEditable && focused.sourceFocused, "SVG input not focused/editable");
    if (focused.sourceInputKind === "native-edit-context") {
      await replaceNativeSvgDimensions({
        client,
        read,
        wait,
        content,
        originalSvg,
        editedSvg,
        receipts: ledger.receipts,
      });
      return;
    }
    const keys = {
      key: "a",
      code: "KeyA",
      windowsVirtualKeyCode: 65,
      modifiers: focused.mac ? 4 : 2,
    };
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", ...keys });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", ...keys });
    await client.send("Input.insertText", { text: content });
  };
  const restoreSvg = async () => {
    if (!svgEdited) return;
    const current = await read();
    if (!current.sourceVisible) {
      assert.equal(current.image?.src, editedSrc, "refusing to restore unrelated SVG UI");
      await click("Show source");
      await wait((value) => assertSvgSource(value, editedSvg, true), "SVG source for cleanup");
    }
    const source = await read();
    assert(
      ownedSvgDimensionSources(originalSvg, editedSvg)
        .map(normalizeSource)
        .includes(normalizeSource(source.sourceText)),
      "refusing to restore unrelated source",
    );
    await inputSvg(originalSvg);
    await wait((value) => assertSvgSource(value, originalSvg, false), "SVG input cleanup");
    svgEdited = false;
  };
  try {
    assertBrowserMediaInputs({ origin, compact, fixtureFiles });
    const created = await client.send("Runtime.evaluate", {
      expression: `(${createBrowserMediaProbe.toString()})(${JSON.stringify(token)})`,
      objectGroup: group,
      returnByValue: false,
    });
    resultValue(created);
    objectId = created.result?.objectId;
    assert(objectId, "CDP media probe did not return a remote object");
    const surfaceState = await read();
    assert(
      !surfaceState.player && !surfaceState.image && !surfaceState.lightbox,
      "refusing to interrupt an existing media preview",
    );
    ledger.environment = { status: "pass", evidence: surfaceState.surface };
    await dimension("image", async () => {
      await replace("image", "initial");
      await open("image");
      const initial = await decodedImage(24, 16);
      const ticket = mediaTicket(initial.image.src);
      record("image", "decoded-image", evidence(initial));
      await click("Open image preview");
      await wait((value) => {
        assert(value.lightbox && value.lightboxImage?.complete, "decoded lightbox is missing");
        assert.equal(value.lightboxImage.width, 24);
        assert.equal(value.lightboxImage.height, 16);
        assert.equal(value.lightboxImage.src, initial.image.src);
      }, "decoded image lightbox");
      await capture("image-lightbox");
      await click("Close preview");
      await wait((value) => assert.equal(value.lightbox, false), "lightbox closed");
      record("image", "lightbox", { opened: true, closed: true, width: 24, height: 16 });
      await replace("image", "changed");
      await click("Reload preview");
      const changed = await decodedImage(32, 20);
      assert.notEqual(mediaTicket(changed.image.src), ticket, "image reload reused the old grant");
      record("image", "changed-file-reload", evidence(changed));
      await capture("image-reloaded");
    });
    await closeLightbox();
    await dimension("svg-source-preview", async () => {
      await replace("svg", "initial");
      await open("svg");
      const source = await wait(
        (value) => assert(value.sourceVisible || value.image || value.fallback),
        "SVG source surface",
        true,
      ).catch(async (error) => {
        await read(); // Environment violations must remain failures.
        throw unqualified(`UNQUALIFIED: SVG controls unavailable: ${detail(error)}`);
      });
      const { sourceVisible, sourceEditable, previewControls, saveDisabled } = source;
      if (!sourceVisible || !sourceEditable || previewControls !== 1 || saveDisabled === null)
        throw unqualified("UNQUALIFIED: real SVG source/edit/preview controls are unavailable");
      await wait((value) => assertSvgSource(value, originalSvg, false), "initial SVG source");
      svgCheck("source", { sourceSha256: hash(originalSvg) });
      svgEdited = true;
      await inputSvg(editedSvg);
      await wait((value) => assertSvgSource(value, editedSvg, true), "unsaved SVG source input");
      svgCheck("unsaved-edit", { sourceSha256: hash(editedSvg), saveEnabled: true });
      await click("Show preview");
      const preview = await decodedImage(36, 18);
      assert.equal(preview.image.src, editedSrc, "preview lost unsaved/inert SVG content");
      assert(
        !preview.svgExecuted && !preview.inlineSvgPayload,
        "SVG active payload executed or entered the live DOM",
      );
      svgCheck("inert-preview", { width: 36, height: 18, executed: false, inlinePayload: false });
      await capture("svg-unsaved-preview");
      await click("Show source");
      await wait((value) => assertSvgSource(value, editedSvg, true), "SVG source round-trip");
      svgCheck("source-roundtrip", { sourceSha256: hash(editedSvg), saveEnabled: true });
    });
    await restoreSvg();
    for (const kind of ["audio", "video"])
      await dimension(kind, async () => {
        await replace(kind, "initial");
        await open(kind);
        const initial = await decodedMedia(kind, 2);
        record(kind, "decoded-metadata", evidence(initial));
        const playing = await play();
        record(kind, "play-progress", evidence(playing));
        await call("pause");
        const paused = await wait(
          (value) =>
            assert(value.player?.paused && value.events.pause > (playing.events.pause ?? 0)),
          `${kind} native pause`,
        );
        await call("seek", 0.8);
        const seek = await wait(
          (value) => assertCompletedSeek(paused, value),
          `${kind} completed 0.8-second seek`,
        );
        record(kind, "completed-seek", evidence(seek));
        await capture(`${kind}-seek`);
        await replace(kind, "changed");
        await click("Reload preview");
        const reloaded = await decodedMedia(kind, 3, {
          previousSrc: initial.player.src,
          retainedTime: 0.8,
        });
        record(kind, "changed-file-reload", evidence(reloaded));
        await capture(`${kind}-reloaded`);
        await replace(kind, "corrupt");
        await click("Reload preview");
        await wait(
          (value) => assert(value.fallback && !value.player),
          `${kind} corrupt-file fallback`,
          true,
        );
        await replace(kind, "recovered");
        await click("Reload preview");
        const recovered = await decodedMedia(kind, 2);
        record(kind, "corrupt-recovery", evidence(recovered));
        const detachBefore = await play();
        await replace("image", "initial");
        await open("image");
        await decodedImage(24, 16);
        const detached = await wait(
          (value) => assertDetachedPause(detachBefore, value),
          `${kind} detached player paused`,
        );
        record(kind, "detached-pause", {
          playerId: detachBefore.player.id,
          detachedPlayers: detached.observedPlayers,
        });
      });
  } catch (error) {
    failure("driver", error);
  } finally {
    const cleanupErrors = [];
    const attempt = async (id, action) => {
      try {
        return await action();
      } catch (error) {
        cleanupErrors.push(id);
        failure(id, error);
      }
    };
    if (objectId) {
      await attempt("svg-input-cleanup", restoreSvg);
      await attempt("lightbox-cleanup", closeLightbox);
      ledger.cleanup.probe = await attempt("probe-cleanup", () => call("cleanup"));
    }
    await attempt("remote-object-release", () =>
      client.send("Runtime.releaseObjectGroup", { objectGroup: group }),
    );
    ledger.cleanup.status = cleanupErrors.length ? "fail" : "pass";
    ledger.cleanup.parentFixtureRemoval = "parent-owned";
  }
  return finalizeBrowserMediaLedger(ledger);
}
