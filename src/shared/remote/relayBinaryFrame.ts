/**
 * Binary WebSocket payload envelope for relay protocol 3.
 *
 * Byte 0 is the frame kind (1 = binary WebSocket message), bytes 1–2 are the
 * big-endian UTF-8 channel-id length, followed by the id and untouched payload.
 * Text/control messages retain their JSON framing. This avoids both lossy
 * UTF-8 coercion and base64 expansion for binary application messages.
 */
const BINARY_WEBSOCKET_KIND = 1;
/** Fixed envelope prefix: kind byte + 2-byte big-endian id length. */
export const RELAY_BINARY_FRAME_HEADER_BYTES = 3;
/** Channel-id bound the envelope's 2-byte length field can carry (UTF-8 bytes). */
export const RELAY_BINARY_FRAME_MAX_CHANNEL_ID_BYTES = 128;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

export interface RelayBinaryFrame {
  readonly id: string;
  /** A view into the input frame; the caller must not mutate its backing bytes. */
  readonly data: Uint8Array;
}

export function encodeRelayBinaryFrame(id: string, data: Uint8Array): Uint8Array {
  const idBytes = encoder.encode(id);
  if (
    idBytes.length === 0 ||
    idBytes.length > RELAY_BINARY_FRAME_MAX_CHANNEL_ID_BYTES ||
    decoder.decode(idBytes) !== id
  ) {
    throw new Error("Invalid relay binary channel id.");
  }
  const frame = new Uint8Array(RELAY_BINARY_FRAME_HEADER_BYTES + idBytes.length + data.byteLength);
  frame[0] = BINARY_WEBSOCKET_KIND;
  frame[1] = idBytes.length >>> 8;
  frame[2] = idBytes.length & 0xff;
  frame.set(idBytes, RELAY_BINARY_FRAME_HEADER_BYTES);
  frame.set(data, RELAY_BINARY_FRAME_HEADER_BYTES + idBytes.length);
  return frame;
}

/** Transport payload limits must be enforced before calling this decoder. */
export function decodeRelayBinaryFrame(frame: Uint8Array): RelayBinaryFrame | null {
  if (frame.byteLength < RELAY_BINARY_FRAME_HEADER_BYTES || frame[0] !== BINARY_WEBSOCKET_KIND)
    return null;
  const idLength = (frame[1]! << 8) | frame[2]!;
  if (
    idLength === 0 ||
    idLength > RELAY_BINARY_FRAME_MAX_CHANNEL_ID_BYTES ||
    RELAY_BINARY_FRAME_HEADER_BYTES + idLength > frame.byteLength
  ) {
    return null;
  }
  try {
    const id = decoder.decode(
      frame.subarray(RELAY_BINARY_FRAME_HEADER_BYTES, RELAY_BINARY_FRAME_HEADER_BYTES + idLength),
    );
    return { id, data: frame.subarray(RELAY_BINARY_FRAME_HEADER_BYTES + idLength) };
  } catch {
    return null;
  }
}
