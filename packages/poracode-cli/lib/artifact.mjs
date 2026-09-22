/**
 * Artifact acquisition: download the pinned release asset or stage an
 * operator-provided local tarball. Either way the bytes must match the pinned
 * sha256 before they are extracted; there is no unverified fast path.
 *
 * The download is streamed to disk under a hard byte cap and an optional
 * AbortSignal so a hostile or broken endpoint cannot exhaust memory and a
 * cancelled launcher stops reading promptly.
 */
import { createHash } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  existsSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { checksumMismatch, downloadFailed, PoracodeLauncherError } from "./errors.mjs";

/** Hard cap for a pinned runtime artifact (the qualified tarball is ~20-40 MiB). */
export const RUNTIME_ARTIFACT_MAX_BYTES = 512 * 1024 * 1024;

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function assertSha256(bytes, entry, source) {
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== entry.sha256) throw checksumMismatch(source, entry.sha256, actual);
  return actual;
}

function assertWithinCap(entry, size, maxBytes) {
  if (size > maxBytes) {
    throw downloadFailed(
      entry.url,
      new Error(`artifact is ${size} bytes, above the ${maxBytes}-byte limit`),
    );
  }
}

export async function downloadArtifact(entry, destination, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxBytes = options.maxBytes ?? RUNTIME_ARTIFACT_MAX_BYTES;
  const signal = options.signal;
  if (!entry.url.startsWith("https://")) {
    throw new Error(`Refusing to download a runtime over a non-https URL: ${entry.url}`);
  }
  let response;
  try {
    response = await fetchImpl(entry.url, {
      redirect: "follow",
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    throw downloadFailed(entry.url, error);
  }
  if (!response.ok) {
    throw downloadFailed(entry.url, new Error(`HTTP ${response.status}`));
  }
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isSafeInteger(declared) && declared > maxBytes)
    assertWithinCap(entry, declared, maxBytes);

  const reader = response.body?.getReader?.();
  if (!reader) {
    const bytes = Buffer.from(await response.arrayBuffer());
    assertWithinCap(entry, bytes.length, maxBytes);
    assertSha256(bytes, entry, entry.url);
    writeFileSync(destination, bytes, { mode: 0o600 });
    return { sha256: entry.sha256, bytes: bytes.length, source: entry.url };
  }

  const hash = createHash("sha256");
  let total = 0;
  const fd = openSync(destination, "w", 0o600);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        if (reader.cancel) await reader.cancel().catch(() => {});
        assertWithinCap(entry, total, maxBytes);
      }
      hash.update(value);
      writeSync(fd, value);
    }
  } catch (error) {
    closeSync(fd);
    rmSync(destination, { force: true });
    throw error;
  }
  closeSync(fd);
  const actual = hash.digest("hex");
  if (actual !== entry.sha256) {
    rmSync(destination, { force: true });
    throw checksumMismatch(entry.url, entry.sha256, actual);
  }
  return { sha256: entry.sha256, bytes: total, source: entry.url };
}

export function stageLocalArtifact(localPath, entry, destination) {
  if (!existsSync(localPath)) {
    throw new PoracodeLauncherError(
      "PORACODE_ARTIFACT_OVERRIDE_MISSING",
      `PORACODE_SERVER_TARBALL does not exist: ${localPath}`,
    );
  }
  copyFileSync(localPath, destination);
  const actual = assertSha256(readFileSync(destination), entry, localPath);
  return { sha256: actual, source: localPath };
}
