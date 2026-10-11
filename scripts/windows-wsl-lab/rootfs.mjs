import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";

import {
  MAX_ROOTFS_BYTES,
  ROOTFS_CACHE_NAME,
  ROOTFS_TIMEOUT_MS,
  TYPED_EXIT_CODES,
  UBUNTU_24_04_ROOTFS_URL,
} from "./constants.mjs";
import { LabError } from "./errors.mjs";

// ── Rootfs acquisition ──────────────────────────────────────────────────────

function sha256OfFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function assertSha256Format(value, label) {
  if (!/^[0-9a-f]{64}$/iu.test(value)) {
    throw new LabError(TYPED_EXIT_CODES.PROVISION_FAILED, `${label} must be a 64-hex sha256`);
  }
}

async function downloadToFile(url, destPath, timeoutMs) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok || !response.body) {
    throw new LabError(
      TYPED_EXIT_CODES.PROVISION_FAILED,
      `rootfs download failed: HTTP ${response.status} for ${url}`,
    );
  }
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_ROOTFS_BYTES) {
    throw new LabError(
      TYPED_EXIT_CODES.PROVISION_FAILED,
      `rootfs content-length ${declaredLength} exceeds cap ${MAX_ROOTFS_BYTES}`,
    );
  }
  const hash = createHash("sha256");
  const handle = await open(`${destPath}.partial`, "w");
  let received = 0;
  try {
    for await (const chunk of response.body) {
      received += chunk.length;
      if (received > MAX_ROOTFS_BYTES) {
        throw new LabError(
          TYPED_EXIT_CODES.PROVISION_FAILED,
          `rootfs download exceeded ${MAX_ROOTFS_BYTES} bytes`,
        );
      }
      hash.update(chunk);
      await handle.write(chunk);
    }
  } finally {
    await handle.close();
  }
  rmSync(destPath, { force: true });
  copyFileSync(`${destPath}.partial`, destPath);
  rmSync(`${destPath}.partial`, { force: true });
  return { sha256: hash.digest("hex"), bytes: received };
}

export async function ensureRootfs(options, stateDir, log) {
  const cachePath = join(stateDir, ROOTFS_CACHE_NAME);
  const sha = options.rootfsSha256;
  if (sha !== undefined) assertSha256Format(sha, "--rootfs-sha256");

  const candidate = options.rootfs;
  if (candidate !== undefined && !/^https?:\/\//iu.test(candidate)) {
    if (!existsSync(candidate)) {
      throw new LabError(
        TYPED_EXIT_CODES.PROVISION_FAILED,
        `--rootfs file not found: ${candidate}`,
      );
    }
    const actual = sha256OfFile(candidate);
    if (sha !== undefined && actual !== sha.toLowerCase()) {
      throw new LabError(
        TYPED_EXIT_CODES.PROVISION_FAILED,
        `rootfs sha256 mismatch: expected ${sha}, got ${actual}`,
      );
    }
    log(`rootfs: using local file ${candidate} (sha256 ${actual.slice(0, 12)}…)`);
    return { path: candidate, sha256: actual };
  }

  const url = candidate ?? UBUNTU_24_04_ROOTFS_URL;
  if (existsSync(cachePath)) {
    const actual = sha256OfFile(cachePath);
    if (sha === undefined || actual === sha.toLowerCase()) {
      log(`rootfs: reusing cached ${ROOTFS_CACHE_NAME} (sha256 ${actual.slice(0, 12)}…)`);
      return { path: cachePath, sha256: actual };
    }
    log("rootfs: cached file does not match expected sha256; redownloading");
  }

  log(`rootfs: downloading ${url}`);
  const { sha256 } = await downloadToFile(url, cachePath, ROOTFS_TIMEOUT_MS);
  if (sha !== undefined && sha256 !== sha.toLowerCase()) {
    rmSync(cachePath, { force: true });
    throw new LabError(
      TYPED_EXIT_CODES.PROVISION_FAILED,
      `rootfs sha256 mismatch: expected ${sha}, got ${sha256}`,
    );
  }
  log(`rootfs: downloaded (sha256 ${sha256.slice(0, 12)}…)`);
  return { path: cachePath, sha256 };
}
