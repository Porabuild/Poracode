import Foundation
import XCTest
@testable import App

final class RichChatFilePolicyTests: XCTestCase {
  private let posix = ProjectLocation.posix(path: "/repo/app")
  private let windows = ProjectLocation.windows(path: "C:\\repo\\app")
  private let wsl = ProjectLocation.wsl(
    distro: "Ubuntu",
    linuxPath: "/repo/app",
    uncPath: "//wsl.localhost/Ubuntu/repo/app"
  )

  // MARK: - Source safety

  func testSafeSourcesAcceptLocalRefs() {
    XCTAssertTrue(RichChatFilePolicy.isSafeFileSource("out/a.zip"))
    XCTAssertTrue(RichChatFilePolicy.isSafeFileSource("/abs/out.zip"))
    XCTAssertTrue(RichChatFilePolicy.isSafeFileSource("C:\\repo\\out.zip"))
    XCTAssertTrue(RichChatFilePolicy.isSafeFileSource("\\\\server\\share\\out.zip"))
    XCTAssertTrue(RichChatFilePolicy.isSafeFileSource("file:///repo/out.zip"))
    XCTAssertTrue(RichChatFilePolicy.isSafeFileSource("poracode-local://local/repo/out.zip"))
  }

  func testSafeSourcesRejectWebAndOpaqueSchemes() {
    XCTAssertFalse(RichChatFilePolicy.isSafeFileSource("https://host/out.zip"))
    XCTAssertFalse(RichChatFilePolicy.isSafeFileSource("javascript:alert(1)"))
    XCTAssertFalse(RichChatFilePolicy.isSafeFileSource("data:text/plain,hi"))
    XCTAssertFalse(RichChatFilePolicy.isSafeFileSource("poracode-local://other/out.zip"))
    XCTAssertFalse(RichChatFilePolicy.isSafeFileSource("out\u{1}.zip"))
    XCTAssertFalse(RichChatFilePolicy.isSafeFileSource(""))
  }

  // MARK: - localPath

  func testLocalPathDecodesSchemesOnce() {
    XCTAssertEqual(
      "/repo/out file.zip",
      RichChatFilePolicy.localPath(from: "file:///repo/out%20file.zip")
    )
    // %2520 decodes exactly once -> literal %20 remains
    XCTAssertEqual(
      "/repo/a%20b.zip",
      RichChatFilePolicy.localPath(from: "file:///repo/a%2520b.zip")
    )
    XCTAssertEqual(
      "/repo/out.zip",
      RichChatFilePolicy.localPath(from: "poracode-local://local/repo/out.zip")
    )
    // file:// authority survives as UNC host
    XCTAssertEqual(
      "//server/share/out.zip",
      RichChatFilePolicy.localPath(from: "file://server/share/out.zip")
    )
    // file:///C:/x -> drive path, not /C:/x
    XCTAssertEqual(
      "C:/repo/out.zip",
      RichChatFilePolicy.localPath(from: "file:///C:/repo/out.zip")
    )
    // Bare paths keep literal %20
    XCTAssertEqual("out a%20b.zip", RichChatFilePolicy.localPath(from: "out a%20b.zip"))
  }

  func testLocalPathRejectsMalformedAndUnsafe() {
    XCTAssertNil(RichChatFilePolicy.localPath(from: "file:///repo/%2e%2e/etc.zip"))
    XCTAssertNil(RichChatFilePolicy.localPath(from: "file:///repo/a%2.zip"))
    XCTAssertNil(RichChatFilePolicy.localPath(from: "file:///repo/%zz.zip"))
    XCTAssertNil(RichChatFilePolicy.localPath(from: "file:///repo/%c0%ae/etc.zip"))
    XCTAssertNil(RichChatFilePolicy.localPath(from: "poracode-local://local"))
    XCTAssertNil(RichChatFilePolicy.localPath(from: "poracode-local://foreign/repo/out.zip"))
  }

  func testPercentDecodeIsStrictUtf8() {
    XCTAssertEqual("café out.zip", RichChatFilePolicy.percentDecodeOnce("café%20out.zip"))
    XCTAssertNil(RichChatFilePolicy.percentDecodeOnce("a%ff%fe.zip"))
    XCTAssertNil(RichChatFilePolicy.percentDecodeOnce("out%2"))
    XCTAssertNil(RichChatFilePolicy.percentDecodeOnce("out%"))
  }

  // MARK: - Artifact gate

  func testArtifactGateMatchesSharedSet() {
    XCTAssertTrue(RichChatFilePolicy.isArtifactPath("out/release.zip"))
    XCTAssertTrue(RichChatFilePolicy.isArtifactPath("out/report.pdf"))
    XCTAssertTrue(RichChatFilePolicy.isArtifactPath("out/data.csv"))
    XCTAssertFalse(RichChatFilePolicy.isArtifactPath("out/app.ts"))
    XCTAssertFalse(RichChatFilePolicy.isArtifactPath("out/README.md"))
    // Bare path dotfile `.zip` stays inert
    XCTAssertFalse(RichChatFilePolicy.isArtifactPath(".zip"))
    XCTAssertFalse(RichChatFilePolicy.isArtifactPath("out/file.png"))
  }

  // MARK: - markdownLink / markdownFileRef

  func testMarkdownLinkParsesStandaloneForms() {
    let link1 = RichChatFilePolicy.markdownLink(in: "[zip](out/a.zip)")
    XCTAssertEqual("zip", link1?.label)
    XCTAssertEqual("out/a.zip", link1?.destination)
    let link2 = RichChatFilePolicy.markdownLink(in: "[f](<out/a b.zip>)")
    XCTAssertEqual("f", link2?.label)
    XCTAssertEqual("out/a b.zip", link2?.destination)
    let link3 = RichChatFilePolicy.markdownLink(in: "[f](out/a%20b.zip)")
    XCTAssertEqual("f", link3?.label)
    XCTAssertEqual("out/a%20b.zip", link3?.destination)
    XCTAssertNil(RichChatFilePolicy.markdownLink(in: "[f](out/a.zip) trailing"))
    XCTAssertNil(RichChatFilePolicy.markdownLink(in: "text [f](out/a.zip)"))
    XCTAssertNil(RichChatFilePolicy.markdownLink(in: "![img](out/a.png)"))
    let link4 = RichChatFilePolicy.markdownLink(in: "[f](<out.zip>)")
    XCTAssertEqual("f", link4?.label)
    XCTAssertEqual("out.zip", link4?.destination)
  }

  func testMarkdownFileRefDecodesDestinationOnce() {
    let ref = RichChatFilePolicy.markdownFileRef(src: "out%20dir/report.pdf")
    XCTAssertEqual("out dir/report.pdf", ref?.path)
    XCTAssertEqual("report.pdf", ref?.fileName)
    // Encoded traversal rejects after decoding
    XCTAssertNil(RichChatFilePolicy.markdownFileRef(src: "%2e%2e/etc/passwd.zip"))
    // %2520 decodes once: literal %20 remains, not a space
    let literal = RichChatFilePolicy.markdownFileRef(src: "out%2520a.zip")
    XCTAssertEqual("out%20a.zip", literal?.path)
  }

  // MARK: - typedFileRef

  func testTypedFileRefBypassesArtifactGateButNotSafety() {
    let ref = RichChatFilePolicy.typedFileRef(path: "/repo/out.bin", name: "build.bin")
    XCTAssertEqual("/repo/out.bin", ref?.path)
    XCTAssertEqual("build.bin", ref?.fileName)
    XCTAssertTrue(ref?.isTypedFile == true)
    XCTAssertNil(RichChatFilePolicy.typedFileRef(path: "../out.zip", name: nil))
    XCTAssertNil(RichChatFilePolicy.typedFileRef(path: "https://host/out.zip", name: nil))
    XCTAssertNil(RichChatFilePolicy.typedFileRef(path: "a/../out.zip", name: nil))
  }

  // MARK: - resolve

  func testResolveClassifiesAccessCorrectly() throws {
    XCTAssertEqual(
      .project(relativePath: "out/a.zip"),
      try RichChatFilePolicy.resolve("out/a.zip", location: posix)
    )
    XCTAssertEqual(
      .project(relativePath: "out/a.zip"),
      try RichChatFilePolicy.resolve("/repo/app/out/a.zip", location: posix)
    )
    XCTAssertEqual(
      .project(relativePath: "out/a.zip"),
      try RichChatFilePolicy.resolve("c:/repo/app/out/a.zip", location: windows)
    )
    XCTAssertEqual(
      .external(path: "/other/a.zip"),
      try RichChatFilePolicy.resolve("/other/a.zip", location: posix)
    )
    XCTAssertEqual(
      .external(path: "//server/share/a.zip"),
      try RichChatFilePolicy.resolve("\\\\server\\share\\a.zip", location: windows)
    )
  }

  func testResolveWslComparesLinuxAndUncRoots() throws {
    XCTAssertEqual(
      .project(relativePath: "out/a.zip"),
      try RichChatFilePolicy.resolve("/repo/app/out/a.zip", location: wsl)
    )
    XCTAssertEqual(
      .project(relativePath: "out/a.zip"),
      try RichChatFilePolicy.resolve(
        "//wsl.localhost/Ubuntu/repo/app/out/a.zip", location: wsl)
    )
  }

  func testResolveRejectsTraversalAndSpecialPaths() {
    XCTAssertThrowsError(try RichChatFilePolicy.resolve("../out.zip", location: posix)) { error in
      XCTAssertEqual(error as? RichChatFilePolicyError, .traversal)
    }
    XCTAssertThrowsError(
      try RichChatFilePolicy.resolve("/repo/app/../out.zip", location: posix)
    ) { error in
      XCTAssertEqual(error as? RichChatFilePolicyError, .traversal)
    }
    XCTAssertThrowsError(try RichChatFilePolicy.resolve("/", location: posix)) { error in
      XCTAssertEqual(error as? RichChatFilePolicyError, .rootIsNotFile)
    }
    let remote = ProjectLocation.posix(path: "/repo/app", remoteServerId: "srv-2")
    XCTAssertThrowsError(
      try RichChatFilePolicy.resolve("/repo/app/out.zip", location: remote)
    ) { error in
      XCTAssertEqual(error as? RichChatFilePolicyError, .unsupportedLocation)
    }
    let root = ProjectLocation.posix(path: "/")
    XCTAssertEqual(
      .project(relativePath: "repo/app/out.zip"),
      try RichChatFilePolicy.resolve("/repo/app/out.zip", location: root)
    )
    // UNC under a "/" root is never a descendant
    XCTAssertEqual(
      .external(path: "//server/share/a.zip"),
      try RichChatFilePolicy.resolve("//server/share/a.zip", location: root)
    )
  }

  // MARK: - filename / response

  func testSanitizedFileNameRejectsEscapes() {
    XCTAssertEqual("out.zip", RichChatFilePolicy.sanitizedFileName("out.zip"))
    XCTAssertEqual("download", RichChatFilePolicy.sanitizedFileName(".."))
    XCTAssertEqual("download", RichChatFilePolicy.sanitizedFileName("."))
    XCTAssertEqual("download", RichChatFilePolicy.sanitizedFileName(""))
    XCTAssertEqual("download", RichChatFilePolicy.sanitizedFileName("  "))
    XCTAssertEqual(
      "evil.zip", RichChatFilePolicy.sanitizedFileName("a/b/../../evil.zip"))
  }

  func testAttachmentResponseRequiresBothHeaders() {
    XCTAssertTrue(
      RichChatFilePolicy.isAttachmentResponse(
        contentDisposition: "attachment; filename=\"a.zip\"",
        contentType: "application/octet-stream"
      ))
    XCTAssertFalse(
      RichChatFilePolicy.isAttachmentResponse(
        contentDisposition: "inline", contentType: "application/octet-stream"))
    XCTAssertFalse(
      RichChatFilePolicy.isAttachmentResponse(
        contentDisposition: "attachment", contentType: "application/zip"))
    XCTAssertFalse(
      RichChatFilePolicy.isAttachmentResponse(
        contentDisposition: nil, contentType: "application/octet-stream"))
    XCTAssertFalse(
      RichChatFilePolicy.isAttachmentResponse(
        contentDisposition: "attachment", contentType: nil))
  }
}
