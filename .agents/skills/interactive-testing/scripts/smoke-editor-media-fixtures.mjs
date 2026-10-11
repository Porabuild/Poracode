import assert from "node:assert/strict";
import { constants } from "node:fs";
import { lstat, mkdtemp, open, readFile, realpath, rmdir, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { deflateSync } from "node:zlib";

const STATE_KEY = "__poracodeEditorMediaSmoke";
const MAX_MEDIA_BYTES = 512_000;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const validatedFixtures = new WeakSet();

/** No launch/attachment discovery: the existing managed mock manifest is the write authority. */
export async function validateFixture(fixture, outDir) {
  const project = fixture?.project;
  assert.equal(project?.id, "smoke-project", "editor media requires the isolated smoke-project");
  const location = project.location;
  assert(
    location && ["posix", "windows"].includes(location.kind) && !location.remoteServerId,
    "UNQUALIFIED: remote/WSL fixture writes are outside this local mock gate",
  );
  assert(isAbsolute(location.path), "smoke project path must be absolute");
  const projectDir = resolve(location.path);
  const root = dirname(projectDir);
  const session = JSON.parse(await readFile(join(root, "session.json"), "utf8"));
  assert.equal(session.schemaVersion, 2, "editor media requires managed session schema 2");
  assert.equal(session.mode, "mock", "editor media refuses real-mode sessions");
  assert.equal(session.state, "ready", "editor media requires an already ready managed session");
  assert.equal(resolve(session.root), root, "managed root mismatch");
  assert.equal(resolve(session.projectDir), projectDir, "managed project mismatch");
  assert.equal(basename(projectDir), "project", "managed project must be the session's project");
  assert.equal(
    resolve(session.outDir),
    resolve(outDir),
    "artifact directory must match the managed session",
  );
  const artifactDirectory = await lstat(outDir);
  assert(
    artifactDirectory.isDirectory() && !artifactDirectory.isSymbolicLink(),
    "artifact directory must be real",
  );
  assert.equal(typeof session.token, "string", "managed session token is missing");
  assert(session.token.length >= 16, "managed session token is invalid");
  for (const directory of [root, projectDir, join(projectDir, ".git")]) {
    const info = await lstat(directory);
    assert(info.isDirectory() && !info.isSymbolicLink(), "smoke fixture directories must be real");
  }
  assert.equal(
    await readFile(join(projectDir, "README.md"), "utf8"),
    "# Poracode smoke fixture\n",
    "managed project is not the smoke fixture",
  );
  const validated = {
    session,
    projectDir: await realpath(projectDir),
    projectIdentity: await lstat(projectDir),
  };
  validatedFixtures.add(validated);
  return validated;
}

/** Fresh files only. Reload/cleanup never follows a substituted directory, symlink or hard link. */
export async function ownFixtureFiles(validated) {
  assert(validatedFixtures.has(validated), "media fixture writes require a validated mock session");
  const { projectDir, projectIdentity } = validated;
  const checkProject = async () => {
    const current = await lstat(projectDir);
    assert(
      current.isDirectory() &&
        current.dev === projectIdentity.dev &&
        current.ino === projectIdentity.ino,
      "validated smoke project was replaced",
    );
    assert.equal(
      await realpath(projectDir),
      projectDir,
      "validated smoke project escaped its session",
    );
  };
  await checkProject();
  const directory = await mkdtemp(join(projectDir, "editor-media-smoke-"));
  const owner = await lstat(directory);
  const files = new Map();
  const checkDirectory = async () => {
    await checkProject();
    const current = await lstat(directory);
    assert(
      current.isDirectory() && current.dev === owner.dev && current.ino === owner.ino,
      "owned media fixture directory was replaced",
    );
    assert.equal(await realpath(directory), directory, "owned media directory escaped the fixture");
  };
  const pathFor = (name) => {
    assert(/^[a-z-]+\.(png|svg|wav|webm)$/u.test(name), "invalid owned media filename");
    return join(directory, name);
  };
  return {
    relative: (name) => `${basename(directory)}/${name}`,
    async write(name, bytes) {
      assert(Buffer.byteLength(bytes) <= MAX_MEDIA_BYTES, "media fixture exceeded its byte bound");
      await checkDirectory();
      const path = pathFor(name);
      const before = files.get(name);
      const handle = await open(
        path,
        constants.O_WRONLY |
          constants.O_NOFOLLOW |
          (before ? 0 : constants.O_CREAT | constants.O_EXCL),
        0o600,
      );
      try {
        const info = await handle.stat();
        assert(info.isFile() && info.nlink === 1, "media fixture must be a private regular file");
        if (before)
          assert(
            info.dev === before.dev && info.ino === before.ino,
            "owned media file was replaced",
          );
        else files.set(name, info);
        await handle.truncate(0);
        await handle.writeFile(bytes);
        // A timestamp step proves invalidation even on filesystems with coarse mtimes.
        const modified = Math.max(Date.now(), (before?.mtimeMs ?? 0) + 1_000);
        await handle.utimes(modified / 1_000, modified / 1_000);
        files.set(name, await handle.stat());
      } finally {
        await handle.close();
      }
      return { sizeBytes: Buffer.byteLength(bytes), sha256: sha256(bytes) };
    },
    async cleanup() {
      await checkDirectory();
      const failures = [];
      for (const [name, identity] of files) {
        try {
          const path = pathFor(name);
          const current = await lstat(path);
          assert(
            current.isFile() && current.dev === identity.dev && current.ino === identity.ino,
            "refusing cleanup of a replaced media file",
          );
          await unlink(path);
          files.delete(name);
        } catch (error) {
          failures.push(error);
        }
      }
      try {
        // Deliberately nonrecursive: unrelated files are never deleted.
        await rmdir(directory);
      } catch (error) {
        failures.push(error);
      }
      if (failures.length) throw new AggregateError(failures, "media fixture cleanup failed");
    },
  };
}

export function png(width, height, color) {
  for (const dimension of [width, height])
    assert(
      Number.isInteger(dimension) && dimension >= 1 && dimension <= 128,
      "synthetic PNG dimensions exceed their bounds",
    );
  assert(
    Array.isArray(color) &&
      color.length === 3 &&
      color.every((value) => Number.isInteger(value) && value >= 0 && value <= 255),
    "invalid synthetic PNG color",
  );
  const chunk = (type, data) => {
    const payload = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of payload) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const result = Buffer.alloc(data.length + 12);
    result.writeUInt32BE(data.length);
    payload.copy(result, 4);
    result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
    return result;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const rows = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) Buffer.from(color).copy(rows, y * (1 + width * 3) + 1 + x * 3);
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function wav(seconds) {
  assert(
    Number.isInteger(seconds) && seconds >= 1 && seconds <= 4,
    "synthetic WAV duration exceeds its bounds",
  );
  const rate = 8_000;
  const bytes = Buffer.alloc(44 + rate * seconds * 2);
  bytes.write("RIFF");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(bytes.length - 44, 40);
  for (let sample = 0; sample < rate * seconds; sample++)
    bytes.writeInt16LE(
      Math.round(Math.sin((sample * Math.PI * 2 * 220) / rate) * 400),
      44 + sample * 2,
    );
  return bytes;
}

/** Mux a canvas-encoded VP8 keyframe into finite, indexed WebM; no recorder/device/encoder process. */
export function webm(base64, seconds) {
  assert(
    Number.isInteger(seconds) && seconds >= 1 && seconds <= 4,
    "synthetic WebM duration exceeds its bounds",
  );
  assert(typeof base64 === "string" && base64.length < MAX_MEDIA_BYTES, "invalid synthetic frame");
  const image = Buffer.from(base64, "base64");
  assert.equal(image.toString("ascii", 0, 4), "RIFF", "canvas did not encode WebP");
  assert.equal(image.toString("ascii", 8, 12), "WEBP", "canvas did not encode WebP");
  let frame;
  for (let offset = 12; offset + 8 <= image.length;) {
    const size = image.readUInt32LE(offset + 4);
    assert(offset + 8 + size <= image.length, "truncated WebP frame");
    if (image.toString("ascii", offset, offset + 4) === "VP8 ")
      frame = image.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  assert(frame?.length >= 10, "UNQUALIFIED: canvas did not supply a VP8 keyframe");
  assert.equal(frame[0] & 1, 0, "synthetic VP8 frame is not a keyframe");
  assert.equal(frame.subarray(3, 6).toString("hex"), "9d012a", "invalid VP8 keyframe");
  assert.equal(frame.readUInt16LE(6) & 0x3fff, 64, "synthetic video width mismatch");
  assert.equal(frame.readUInt16LE(8) & 0x3fff, 48, "synthetic video height mismatch");
  const size = (value) => {
    for (let length = 1; length <= 6; length++) {
      if (value >= 2 ** (7 * length) - 1) continue;
      const bytes = Buffer.alloc(length);
      bytes.writeUIntBE(value, 0, length);
      bytes[0] |= 1 << (8 - length);
      return bytes;
    }
    throw new Error("synthetic WebM exceeds its size bound");
  };
  const element = (id, data) => Buffer.concat([Buffer.from(id, "hex"), size(data.length), data]);
  const uint = (id, value) => {
    let length = 1;
    while (value >= 2 ** (8 * length)) length++;
    const data = Buffer.alloc(length);
    data.writeUIntBE(value, 0, length);
    return element(id, data);
  };
  const group = (id, ...children) => element(id, Buffer.concat(children));
  const duration = Buffer.alloc(8);
  duration.writeDoubleBE(seconds * 1_000);
  const info = group(
    "1549a966",
    uint("2ad7b1", 1_000_000),
    element("4489", duration),
    element("4d80", Buffer.from("Poracode smoke")),
    element("5741", Buffer.from("Poracode smoke")),
  );
  const tracks = group(
    "1654ae6b",
    group(
      "ae",
      uint("d7", 1),
      uint("73c5", 1),
      uint("83", 1),
      element("86", Buffer.from("V_VP8")),
      uint("23e383", 250_000_000),
      group("e0", uint("b0", 64), uint("ba", 48)),
    ),
  );
  const blocks = Array.from({ length: seconds * 4 }, (_, index) => {
    const block = Buffer.from([0x81, 0, 0, 0x80]);
    block.writeInt16BE(index * 250, 1);
    return element("a3", Buffer.concat([block, frame]));
  });
  const cluster = group("1f43b675", uint("e7", 0), ...blocks);
  const cues = group(
    "1c53bb6b",
    group("bb", uint("b3", 0), group("b7", uint("f7", 1), uint("f1", info.length + tracks.length))),
  );
  const header = group(
    "1a45dfa3",
    uint("4286", 1),
    uint("42f7", 1),
    uint("42f2", 4),
    uint("42f3", 8),
    element("4282", Buffer.from("webm")),
    uint("4287", 2),
    uint("4285", 2),
  );
  const bytes = Buffer.concat([header, group("18538067", info, tracks, cluster, cues)]);
  assert(bytes.length <= MAX_MEDIA_BYTES, "synthetic WebM exceeds its byte bound");
  return bytes;
}

export function svg(width, height) {
  // All active payloads are local sentinels: no links, external resources or navigation.
  const sentinel = `window.${STATE_KEY}.svgExecutions++`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" onload="${sentinel}"><script>${sentinel}</script><rect width="100%" height="100%" fill="#2070d0"/><foreignObject width="1" height="1"><div xmlns="http://www.w3.org/1999/xhtml" data-editor-media-inline="forbidden">inert</div></foreignObject></svg>\n`;
}
