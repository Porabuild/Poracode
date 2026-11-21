import Foundation
import SwiftUI
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

  func testEditableAttachmentTargetsUseTheOwningWorkspaceAndKeepDecodedPaths() throws {
    for filename in ["report.txt", "report.CSV", "report.tsv", "report.pdf"] {
      XCTAssertTrue(RichChatFilePolicy.usesWorkspaceBasenameLookup(filename), filename)
      XCTAssertFalse(RichChatFilePolicy.usesWorkspaceBasenameLookup("reports/\(filename)"), filename)
    }
    XCTAssertFalse(RichChatFilePolicy.usesWorkspaceBasenameLookup("report.zip"))
    XCTAssertFalse(RichChatFilePolicy.usesWorkspaceBasenameLookup("/repo/app/report.txt"))

    let bare = try XCTUnwrap(RichChatProjectFileLink.attachmentTarget("Audit.txt", in: posix))
    XCTAssertEqual(bare.path, "Audit.txt")
    XCTAssertTrue(bare.resolvesBareName)

    let markdown = try XCTUnwrap(RichChatFilePolicy.markdownFileRef(src: "reports/Audit%20%2520.TSV"))
    let table = try XCTUnwrap(RichChatProjectFileLink.attachmentTarget(markdown.path, in: posix))
    XCTAssertEqual(table.path, "reports/Audit %20.TSV")
    XCTAssertFalse(table.resolvesBareName)
    XCTAssertEqual(RichChatProjectFileLink.attachmentTarget("C:\\REPO\\app\\reports\\Audit.CSV", in: windows)?.path,
      "reports/Audit.CSV")
    XCTAssertEqual(RichChatProjectFileLink.attachmentTarget("/repo/app/Audit.txt", in: wsl)?.path, "Audit.txt")
    XCTAssertFalse(try XCTUnwrap(RichChatProjectFileLink.attachmentTarget("/repo/app/Audit.txt", in: posix)).resolvesBareName)
    for path in ["../external.txt", "/other/Audit.txt", "reports/report.pdf", "reports/file.csv/"] {
      XCTAssertNil(RichChatProjectFileLink.attachmentTarget(path, in: posix), path)
    }
  }

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

  func testSourceReferenceOpensOnlyAFileInTheThreadWorkspaceAndDecodesOnce() throws {
    let location = ProjectLocation.posix(path: "/workspace/project")
    XCTAssertEqual(
      RichChatProjectFileLink.target("./README.md:48", in: location, markdown: true),
      .init(path: "README.md", line: 48)
    )
    XCTAssertEqual(
      RichChatProjectFileLink.target("/workspace/project/src/app.swift#L7-L10", in: location, markdown: true),
      .init(path: "src/app.swift", line: 7)
    )
    XCTAssertEqual(
      RichChatProjectFileLink.target("https://poracode.local/path/v2/src%2Fhas%2520percent.swift?line=3",
        in: location, markdown: true),
      .init(path: "src/has%20percent.swift", line: 3)
    )
    XCTAssertEqual(
      RichChatProjectFileLink.target("poracode:path:src%2Fapp.swift%3A7", in: location, markdown: true),
      .init(path: "src/app.swift", line: 7)
    )
    let future = try XCTUnwrap(URL(string: "https://poracode.local/path/v3/README.md?line=8"))
    XCTAssertNil(RichChatProjectFileLink.target(future.absoluteString, in: location, markdown: true))
    XCTAssertFalse(RichChatProjectFileLink.isExternal(future))
    for value in ["../private.swift", "/workspace/project-other/README.md", "%2e%2e/README.md", "src/…/file.swift", "src/"] {
      XCTAssertNil(RichChatProjectFileLink.target(value, in: location, markdown: true), value)
    }
    let reference = ProjectWorkspaceFileTarget(path: "src/has%20percent.swift", line: 3)
    let url = try XCTUnwrap(RichChatProjectFileLink.url(for: reference))
    XCTAssertEqual(RichChatProjectFileLink.target(from: url, in: location), reference)
    let unsafe = try XCTUnwrap(RichChatProjectFileLink.url(for: .init(path: "../private.swift")))
    XCTAssertNil(RichChatProjectFileLink.target(from: unsafe, in: location))
  }
  @MainActor
  func testTranscriptSourceLinksRetainTheirVisibleLabelsAndLine() {
    let parsed = RichChatAttributedText.presentation(
      "Open [Linked source](./README.md:48) or `README.md:48`. [Web](https://example.test/)",
      projectLocation: posix
    )
    let targets = parsed.runs.compactMap { run in
      run.link.flatMap { RichChatProjectFileLink.target(from: $0, in: posix) }
    }
    XCTAssertEqual(targets, Array(repeating: .init(path: "README.md", line: 48), count: 2))
    XCTAssertTrue(String(parsed.characters).contains("Open Linked source or README.md:48."))
    XCTAssertTrue(parsed.runs.contains { $0.link?.host == "example.test" })
    XCTAssertNil(RichChatAttributedText.standaloneSourceReference(in: parsed, projectLocation: posix))
  }

  @MainActor
  func testOnlyStandaloneProjectLinksUseAFileChip() throws {
    for source in ["[Linked **source**](./src/README.md:48)", "`src/README.md:48`"] {
      let parsed = RichChatAttributedText.presentation(source, projectLocation: posix)
      let reference = try XCTUnwrap(
        RichChatAttributedText.standaloneSourceReference(in: parsed, projectLocation: posix)
      )
      XCTAssertEqual(reference.filename, "README.md")
      XCTAssertEqual(reference.target, .init(path: "src/README.md", line: 48))
      XCTAssertNil(RichChatAttributedText.standaloneSourceReference(in: parsed, projectLocation: nil))
    }
    for source in ["[Web](https://example.test/)", "[Outside](../README.md:48)",
      "[First](./README.md:48) [Second](./README.md:48)"] {
      let parsed = RichChatAttributedText.presentation(source, projectLocation: posix)
      XCTAssertNil(RichChatAttributedText.standaloneSourceReference(in: parsed, projectLocation: posix))
    }
  }

  @MainActor
  func testSourceBadgeAndInlineReferenceUseChatTextLineHeight() async throws {
    let linked = RichChatAttributedText.presentation("[Source](./README.md:48)", projectLocation: posix)
    let reference = try XCTUnwrap(
      RichChatAttributedText.standaloneSourceReference(in: linked, projectLocation: posix)
    )
    let links = [
      RichChatAttributedText.presentation("Read the [source](./README.md:48).", projectLocation: posix),
      RichChatAttributedText.presentation("Open [Apple Developer](https://developer.apple.com).", projectLocation: posix),
    ]
    let sizes = [DynamicTypeSize.large, .xxxLarge, .accessibility2]
    var heights: [String: CGFloat] = [:]
    func measured(_ view: some View, id: String) -> some View {
      view.onGeometryChange(for: CGFloat.self) { $0.size.height } action: { heights[id] = $0 }
    }
    let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.first as? UIWindowScene)
    let previous = scene.windows.first(where: \.isKeyWindow)
    let window = UIWindow(windowScene: scene)
    window.rootViewController = UIHostingController(rootView:
      ScrollView {
        VStack(alignment: .leading, spacing: 0) {
          ForEach(Array(sizes.enumerated()), id: \.offset) { index, size in
            VStack(alignment: .leading, spacing: 0) {
              measured(Text("Inspect the source").poracodeChatText(.body), id: "\(index)-body")
              measured(RichChatSourceReferenceChip(reference: reference, findPart: .body), id: "\(index)-badge")
              ForEach(Array(links.enumerated()), id: \.offset) { linkIndex, inline in
                measured(Text(String(inline.characters)).poracodeChatText(.body), id: "\(index)-text-\(linkIndex)")
                measured(RichChatInlineLinkText(text: inline, part: .body).poracodeChatText(.body),
                  id: "\(index)-link-\(linkIndex)")
              }
            }
            .environment(\.dynamicTypeSize, size)
          }
        }
        .frame(width: 430, alignment: .leading)
      }
    )
    window.makeKeyAndVisible()
    defer { window.isHidden = true; previous?.makeKey() }
    for _ in 0..<100 where heights.count < sizes.count * (2 + links.count * 2) {
      try await Task.sleep(for: .milliseconds(20))
    }

    for (index, size) in sizes.enumerated() {
      XCTAssertEqual(try XCTUnwrap(heights["\(index)-badge"]), try XCTUnwrap(heights["\(index)-body"]),
        accuracy: 1, "\(size)")
      for linkIndex in links.indices {
        XCTAssertEqual(try XCTUnwrap(heights["\(index)-link-\(linkIndex)"]),
          try XCTUnwrap(heights["\(index)-text-\(linkIndex)"]), accuracy: 1, "\(size)")
      }
    }
  }

  @MainActor
  func testLineAnchorUsesUTF16OffsetsAndClampsToTheFileEnd() {
    let text = "é\r\n日本\nlinked line"
    XCTAssertEqual(ProjectLinkedTextEditor.lineAnchor(3, in: text).location, 6)
    XCTAssertEqual(ProjectLinkedTextEditor.lineAnchor(999, in: text).location, text.utf16.count)
  }
}
