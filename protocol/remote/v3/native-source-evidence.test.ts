import { describe, expect, it } from "vitest";
import { iosSourceIsCompiled, isNativeDeviceTest } from "./native-source-evidence";

const rootId = "F20000000000000000000001";
const source = "ios/App/App/Features/BoundedCatalog/Transport/Client.swift";
function project(
  options: { member?: string; path?: string; tree?: string; extras?: string; name?: string } = {},
) {
  return `
504EC3031FED79650016851F /* App */ = {
  isa = PBXNativeTarget;
  name = ${options.name ?? "App"};
  productType = "com.apple.product-type.application";
  fileSystemSynchronizedGroups = (${options.member ?? rootId} /* folder */);
};
${rootId} /* folder */ = {
  isa = PBXFileSystemSynchronizedRootGroup;
  path = ${options.path ?? "App/Features/BoundedCatalog"};
  sourceTree = ${options.tree ?? "SOURCE_ROOT"};
  ${options.extras ?? ""}
};`;
}

describe("native production source evidence", () => {
  it("recognizes attached SOURCE_ROOT folders, including quoted paths", () => {
    expect(iosSourceIsCompiled(project(), source)).toBe(true);
    expect(iosSourceIsCompiled(project({ path: '"App/Features/BoundedCatalog"' }), source)).toBe(
      true,
    );
  });
  it.each([
    { member: "F30000000000000000000001" },
    { name: "AppTests" },
    { path: "App/Features/BoundedCatalogNeighbor" },
    { tree: '"<group>"' },
    { extras: "exceptions = (F40000000000000000000001);" },
    { extras: "explicitFileTypes = {};" },
    { path: '"$(SOURCE_ROOT)/App"' },
  ])("rejects unproven folder ownership/configuration: %j", (options) => {
    expect(iosSourceIsCompiled(project(options), source)).toBe(false);
  });
  it("requires a directory boundary and normalized source path", () => {
    expect(
      iosSourceIsCompiled(project(), source.replace("BoundedCatalog/", "BoundedCatalogOther/")),
    ).toBe(false);
    expect(iosSourceIsCompiled(project(), source.replace("Transport/", "../"))).toBe(false);
  });
  it("does not let target metadata shadow the native target", () => {
    const metadata = `
504EC3031FED79650016851F = {
  CreatedOnToolsVersion = 9.2;
};`;
    expect(iosSourceIsCompiled(project() + metadata, source)).toBe(true);
  });
  it("retains explicit source-phase evidence", () => {
    expect(iosSourceIsCompiled("ABC /* Client.swift in Sources */", source)).toBe(true);
  });
  it("keeps device evidence platform-specific and excludes unit tests/traversal", () => {
    expect(isNativeDeviceTest("ios/App/NativeE2ETests/Journey.swift", "ios")).toBe(true);
    expect(isNativeDeviceTest("android/app/src/androidTest/Journey.kt", "android")).toBe(true);
    expect(isNativeDeviceTest("ios/App/NativeE2ETests/Journey.swift", "android")).toBe(false);
    expect(isNativeDeviceTest("ios/App/AppTests/Journey.swift", "ios")).toBe(false);
    expect(isNativeDeviceTest("android/app/src/androidTest/../test/Journey.kt", "android")).toBe(
      false,
    );
  });
});
