import { describe, expect, it } from "vitest";
import { generateSelfSignedTlsMaterial } from "@/host/remote/server/tlsMaterial";
import {
  hasRemoteCertificatePinForHost,
  matchesRemoteCertificatePin,
  registerRemoteCertificatePin,
  removeRemoteCertificatePin,
  chromiumCertificateVerdict,
  recordChromiumCertificateVerdict,
} from "./remoteCertificatePins";

describe("remote Chromium certificate pins", () => {
  it("binds a pin to its session, hostname, and port for the URL-aware error gate", () => {
    const session = {};
    const leaf = generateSelfSignedTlsMaterial();
    const other = generateSelfSignedTlsMaterial();
    registerRemoteCertificatePin(session, "https://host.test:4433/", leaf.fingerprint);
    expect(hasRemoteCertificatePinForHost(session, "host.test")).toBe(true);
    expect(matchesRemoteCertificatePin(session, "wss://host.test:4433/socket", leaf.cert)).toBe(
      true,
    );
    expect(matchesRemoteCertificatePin(session, "wss://host.test:4434/socket", leaf.cert)).toBe(
      false,
    );
    expect(matchesRemoteCertificatePin({}, "wss://host.test:4433/socket", leaf.cert)).toBe(false);
    expect(matchesRemoteCertificatePin(session, "wss://other.test:4433/socket", leaf.cert)).toBe(
      false,
    );
    expect(matchesRemoteCertificatePin(session, "wss://host.test:4433/socket", other.cert)).toBe(
      false,
    );
    registerRemoteCertificatePin(session, "https://host.test:4434/", other.fingerprint);
    expect(matchesRemoteCertificatePin(session, "wss://host.test:4434/socket", other.cert)).toBe(
      true,
    );
    expect(matchesRemoteCertificatePin(session, "wss://host.test:4434/socket", leaf.cert)).toBe(
      false,
    );
    removeRemoteCertificatePin(session, "https://host.test:4433/");
    expect(matchesRemoteCertificatePin(session, "wss://host.test:4433/socket", leaf.cert)).toBe(
      false,
    );
    expect(matchesRemoteCertificatePin(session, "wss://host.test:4434/socket", other.cert)).toBe(
      true,
    );
  });
  it("preserves only Chromium's exact hostname and leaf verdict, failing unknown values closed", () => {
    const session = {};
    const leaf = generateSelfSignedTlsMaterial();
    expect(chromiumCertificateVerdict(session, "https://host.test", leaf.cert)).toBe(false);
    recordChromiumCertificateVerdict(session, "host.test", leaf.cert, true);
    expect(chromiumCertificateVerdict(session, "https://host.test", leaf.cert)).toBe(true);
    expect(chromiumCertificateVerdict(session, "https://other.test", leaf.cert)).toBe(false);
    expect(chromiumCertificateVerdict({}, "https://host.test", leaf.cert)).toBe(false);
    recordChromiumCertificateVerdict(session, "host.test", leaf.cert, false);
    expect(chromiumCertificateVerdict(session, "https://host.test", leaf.cert)).toBe(false);
  });
});
