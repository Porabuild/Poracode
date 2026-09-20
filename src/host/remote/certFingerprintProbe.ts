import { connect as tlsConnect, type PeerCertificate } from "node:tls";

/**
 * V6 A.1: observes the leaf certificate a TLS server actually presents.
 *
 * `rejectUnauthorized` is false so a self-signed LAN listener can be pinned
 * against the QR/mDNS fingerprint *before* the pairing credential is spent.
 * Callers compare the returned hex digest to the claimed `#fp=` value; a
 * mismatch refuses the exchange. Plain HTTP URLs return `null` (nothing to
 * pin). Probe failures also return `null` so a transport outage is not
 * misreported as a fingerprint mismatch.
 */
export async function probeTlsCertificateFingerprint(url: string | URL): Promise<string | null> {
  const target = typeof url === "string" ? new URL(url) : url;
  if (target.protocol !== "https:") return null;
  const port = target.port ? Number(target.port) : 443;
  if (!Number.isFinite(port) || port <= 0) return null;
  const hostname = target.hostname;
  try {
    return await new Promise<string | null>((resolve, reject) => {
      const socket = tlsConnect(
        {
          host: hostname,
          port,
          servername: hostname,
          rejectUnauthorized: false,
        },
        () => {
          const certificate = socket.getPeerCertificate() as PeerCertificate;
          socket.end();
          const fingerprint256 = certificate.fingerprint256;
          if (!fingerprint256) {
            resolve(null);
            return;
          }
          resolve(fingerprint256.replaceAll(":", "").toLowerCase());
        },
      );
      socket.setTimeout(5_000, () => {
        socket.destroy();
        reject(new Error("TLS certificate probe timed out."));
      });
      socket.on("error", reject);
    });
  } catch {
    return null;
  }
}
