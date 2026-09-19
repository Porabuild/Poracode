/**
 * Browser-safe synchronous SHA-256 (FIPS 180-4) for the shared contract
 * executors. `node:crypto` cannot enter the renderer bundle (the PWA client
 * runs in mobile browsers), and WebCrypto's `crypto.subtle.digest` is async
 * while the pairing fingerprint rides through synchronous guards — so the
 * executor needs one dependency-free synchronous implementation that produces
 * byte-identical digests on Node, Electron, and the browser.
 *
 * Cross-checked against `node:crypto` in `sha256.test.ts` (fixed NIST vectors
 * plus randomized input of every length class, including multi-block and
 * near-boundary message sizes).
 */

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

const H0 = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
] as const;

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

export function sha256Hex(input: string | Uint8Array): string {
  const bytes: Uint8Array = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const bitLength = bytes.length * 8;
  // Padded message: 0x80, zeros, 64-bit big-endian bit length.
  const paddedLength = ((bytes.length + 8) >> 6) * 64 + 64;
  const message = new Uint8Array(paddedLength);
  message.set(bytes);
  message[bytes.length] = 0x80;
  const high = Math.floor(bitLength / 0x1_0000_0000);
  const low = bitLength >>> 0;
  message[paddedLength - 8] = (high >>> 24) & 0xff;
  message[paddedLength - 7] = (high >>> 16) & 0xff;
  message[paddedLength - 6] = (high >>> 8) & 0xff;
  message[paddedLength - 5] = high & 0xff;
  message[paddedLength - 4] = (low >>> 24) & 0xff;
  message[paddedLength - 3] = (low >>> 16) & 0xff;
  message[paddedLength - 2] = (low >>> 8) & 0xff;
  message[paddedLength - 1] = low & 0xff;

  let h0: number = H0[0];
  let h1: number = H0[1];
  let h2: number = H0[2];
  let h3: number = H0[3];
  let h4: number = H0[4];
  let h5: number = H0[5];
  let h6: number = H0[6];
  let h7: number = H0[7];

  const w = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      const j = offset + i * 4;
      w[i] =
        ((message[j]! << 24) |
          (message[j + 1]! << 16) |
          (message[j + 2]! << 8) |
          message[j + 3]!) >>>
        0;
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + K[i]! + w[i]!) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((word) => word.toString(16).padStart(8, "0"))
    .join("");
}
