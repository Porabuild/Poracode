import { describe, expect, it } from "vitest";
import { writeInitTlsMaterial, type InitTlsWriteDeps } from "./initTlsWrite";

function recorder(failOn?: string) {
  const events: string[] = [];
  const deps: InitTlsWriteDeps = {
    mkdir: (path) => void events.push(`mkdir ${path}`),
    restrict: (path) => {
      events.push(`restrict ${path}`);
      if (failOn === "restrict") throw new Error("icacls failed");
    },
    createPrivateFile: (path) => void events.push(`create ${path}`),
    writeFile: (path) => void events.push(`write ${path}`),
    remove: (path) => void events.push(`remove ${path}`),
  };
  return { events, deps };
}

const base = { certPath: "/p/tls/server.crt", keyPath: "/p/tls/server.key", cert: "C", key: "K" };

describe("writeInitTlsMaterial", () => {
  it("restricts the owned key directory and the key file before any key bytes are written", () => {
    const { events, deps } = recorder();
    writeInitTlsMaterial({ ...base, restrictKeyDirectory: true }, deps);
    const keyWrite = events.indexOf("write /p/tls/server.key");
    expect(events.indexOf("restrict /p/tls")).toBeLessThan(
      events.indexOf("create /p/tls/server.key"),
    );
    expect(events.indexOf("restrict /p/tls/server.key")).toBeLessThan(keyWrite);
    expect(events.indexOf("create /p/tls/server.key")).toBeLessThan(keyWrite);
  });

  it("never restricts a user-supplied key directory", () => {
    const { events, deps } = recorder();
    writeInitTlsMaterial({ ...base, keyPath: "/user/k.pem", restrictKeyDirectory: false }, deps);
    expect(events).not.toContain("restrict /user");
    expect(events.indexOf("restrict /user/k.pem")).toBeLessThan(
      events.indexOf("write /user/k.pem"),
    );
  });

  it("removes the empty key file and writes no key when restriction fails", () => {
    const { events, deps } = recorder("restrict");
    expect(() => writeInitTlsMaterial({ ...base, restrictKeyDirectory: false }, deps)).toThrow(
      "icacls failed",
    );
    expect(events).not.toContain("write /p/tls/server.key");
    expect(events).toContain("remove /p/tls/server.key");
  });
});
