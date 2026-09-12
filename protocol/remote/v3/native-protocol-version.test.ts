import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  remoteEnvironmentDescriptorSchema,
  PORACODE_REMOTE_PROTOCOL_VERSION,
} from "../../../src/shared/remote/protocol";

const root = new URL("../../../", import.meta.url);
const platforms = [
  {
    name: "iOS",
    directory: "ios/App/App/Protocol/",
    extension: "swift",
    constant: "remoteProtocolVersion",
    bindingConstant: "expectedProtocolVersion",
  },
  {
    name: "Android",
    directory: "android/app/src/main/kotlin/com/poracode/app/protocol/",
    extension: "kt",
    constant: "REMOTE_PROTOCOL_VERSION",
    bindingConstant: "PROTOCOL_VERSION",
  },
];

function assignment(path: string, name: string): string | undefined {
  const source = readFileSync(new URL(path, root), "utf8");
  return source.match(new RegExp(`\\b${name}\\s*=\\s*([\\w.]+)`))?.[1];
}

describe("native app protocol compatibility declarations", () => {
  it("rejects a pre-daily-window host before decoding its usage responses", () => {
    const environment = JSON.parse(
      readFileSync(new URL("protocol/remote/v3/fixtures/environment.json", root), "utf8"),
    );
    expect(remoteEnvironmentDescriptorSchema.safeParse(environment).success).toBe(true);
    expect(
      remoteEnvironmentDescriptorSchema.safeParse({ ...environment, protocolVersion: 10 }).success,
    ).toBe(false);
  });
  it("keeps the Android pre-build guard aligned with the wire protocol", () => {
    const source = readFileSync(new URL("android/app/build.gradle.kts", root), "utf8");
    expect(source.match(/version\("protocolVersion",\s*(\d+)\)/)?.[1]).toBe(
      String(PORACODE_REMOTE_PROTOCOL_VERSION),
    );
  });

  it.each(platforms)("keeps $name compatible with its generated bindings", (platform) => {
    const { directory, extension, constant, bindingConstant } = platform;
    expect(assignment(`${directory}ProtocolConstants.${extension}`, constant)).toBe(
      String(PORACODE_REMOTE_PROTOCOL_VERSION),
    );
    expect([String(PORACODE_REMOTE_PROTOCOL_VERSION), `ProtocolConstants.${constant}`]).toContain(
      assignment(`${directory}GeneratedRemoteV3Contract.${extension}`, bindingConstant),
    );
  });
});
