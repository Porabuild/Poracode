/** Both independently deployed Windows helpers require a native GUI image. */
export function isWindowsGuiExecutable(
  bytes: Uint8Array,
  target: "win32-x64" | "win32-arm64",
  maxBytes: number,
) {
  if (bytes.length < 64 || bytes.length > maxBytes) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(0, true) !== 0x5a4d) return false;
  const pe = view.getUint32(0x3c, true);
  if (pe < 64 || pe > bytes.length - 94) return false;
  const optionalSize = view.getUint16(pe + 20, true);
  return (
    view.getUint32(pe, true) === 0x00004550 &&
    view.getUint16(pe + 4, true) === (target === "win32-x64" ? 0x8664 : 0xaa64) &&
    optionalSize >= 70 &&
    pe + 24 + optionalSize <= bytes.length &&
    view.getUint16(pe + 24, true) === 0x20b &&
    view.getUint16(pe + 24 + 68, true) === 2
  );
}
