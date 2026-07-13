import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_REMOTE_ACCESS_HOST,
  DEFAULT_REMOTE_ACCESS_PORT,
  detectLanIpv4Address,
  remoteAccessAdvertisedHost,
  remoteAccessHost,
  remoteAccessPairingAppUrl,
  remoteAccessPort,
} from "./config";

const ENV_KEYS = [
  "PORACODE_REMOTE_ACCESS_ADVERTISED_HOST",
  "PORACODE_REMOTE_ACCESS_HOST",
  "PORACODE_REMOTE_ACCESS_PAIRING_APP_URL",
  "PORACODE_REMOTE_ACCESS_PORT",
] as const;

afterEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

function ipv4(address: string, internal = false) {
  return {
    address,
    cidr: `${address}/24`,
    family: "IPv4" as const,
    internal,
    mac: "00:00:00:00:00:00",
    netmask: "255.255.255.0",
  };
}

describe("remote access config", () => {
  it("uses built-in host, port, and pairing defaults", () => {
    expect(remoteAccessHost()).toBe(DEFAULT_REMOTE_ACCESS_HOST);
    expect(remoteAccessPort()).toBe(DEFAULT_REMOTE_ACCESS_PORT);
    expect(remoteAccessPairingAppUrl()).toBeUndefined();
  });

  it("accepts explicit overrides", () => {
    process.env.PORACODE_REMOTE_ACCESS_ADVERTISED_HOST = "mobile-test.poracode.local";
    process.env.PORACODE_REMOTE_ACCESS_HOST = "192.168.1.20";
    process.env.PORACODE_REMOTE_ACCESS_PORT = "49999";
    process.env.PORACODE_REMOTE_ACCESS_PAIRING_APP_URL = "https://preview.poracodeapp.com";

    expect(remoteAccessAdvertisedHost()).toBe("mobile-test.poracode.local");
    expect(remoteAccessHost()).toBe("192.168.1.20");
    expect(remoteAccessPort()).toBe(49999);
    expect(remoteAccessPairingAppUrl()).toBe("https://preview.poracodeapp.com");
  });

  it("detects a preferred LAN IPv4 address across interface naming styles", () => {
    expect(
      detectLanIpv4Address({
        lo0: [ipv4("127.0.0.1", true)],
        "vEthernet (WSL)": [ipv4("172.25.80.1")],
        "Wi-Fi": [ipv4("192.168.1.42")],
      }),
    ).toBe("192.168.1.42");
  });

  it("prefers Linux physical network interfaces over container bridges", () => {
    expect(
      detectLanIpv4Address({
        docker0: [ipv4("172.17.0.1")],
        wlan0: [ipv4("10.1.2.3")],
      }),
    ).toBe("10.1.2.3");
  });

  it("advertises the LAN address when binding to every interface", () => {
    expect(
      remoteAccessAdvertisedHost({
        bindHost: "0.0.0.0",
        interfaces: {
          en0: [ipv4("10.0.0.25")],
        },
      }),
    ).toBe("10.0.0.25");
  });
});
