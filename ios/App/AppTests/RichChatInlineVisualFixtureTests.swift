import XCTest

#if canImport(App)
  @testable import App
#elseif canImport(RichChatDomain)
  @testable import RichChatDomain
#endif

final class RichChatInlineVisualFixtureTests: XCTestCase {
  func testSplitterMatchesTheSharedFixture() throws {
    let fixture = try loadRichChatFixture("rich-inline-visuals.json")
    let elision = try richFixtureObject(try XCTUnwrap(fixture["elision"]))
    XCTAssertEqual(elision["noticePrefix"]?.stringValue, RichInlineVisualParser.elisionNoticePrefix)
    XCTAssertEqual(
      elision["headUtf16Units"]?.decimalValue,
      Decimal(RichInlineVisualParser.elisionHeadUTF16Units))
    for entry in try richFixtureArray(try XCTUnwrap(fixture["cases"])) {
      let object = try richFixtureObject(entry)
      let id = try XCTUnwrap(object["id"]?.stringValue)
      let text = try XCTUnwrap(object["text"]?.stringValue)
      let expected = try richFixtureArray(try XCTUnwrap(object["parts"])).map(decodePart)
      XCTAssertEqual(RichInlineVisualParser.split(text), expected, id)
    }
  }

  func testPreviewLimitsAndThemeVariablesMatchTheSharedFixture() throws {
    let fixture = try loadRichChatFixture("rich-inline-visuals.json")
    let preview = try richFixtureObject(try XCTUnwrap(fixture["preview"]))
    XCTAssertEqual(preview["formatVersion"]?.decimalValue, Decimal(RichInlineVisualParser.formatVersion))
    XCTAssertEqual(
      preview["maxPreviewsPerMessage"]?.decimalValue,
      Decimal(RichInlineVisualParser.maxPreviewsPerMessage))
    XCTAssertEqual(
      preview["maxSourceUtf8Bytes"]?.decimalValue, Decimal(RichInlineVisualParser.maxSourceBytes))
    XCTAssertEqual(
      preview["minHeight"]?.decimalValue, Decimal(RichInlineVisualParser.minHeight))
    XCTAssertEqual(
      preview["maxHeight"]?.decimalValue, Decimal(RichInlineVisualParser.maxHeight))
    let names = try richFixtureArray(try XCTUnwrap(preview["themeVariables"])).compactMap(\.stringValue)
    for preset in [PoracodeThemePreset.all[0], PoracodeThemePreset.all[1]] {
      for dark in [false, true] {
        let theme = RichHtmlVisualTheme.value(
          palette: dark ? preset.dark : preset.light, dark: dark
        ).objectValue
        XCTAssertEqual(theme?["appearance"]?.stringValue, dark ? "dark" : "light")
        let keys = theme?["variables"]?.objectValue.map { Set($0.keys) } ?? []
        XCTAssertEqual(keys, Set(names))
      }
    }
    XCTAssertEqual(RichHtmlVisualTheme.contrastingForeground("#8892ef"), "#0a0a12")
    XCTAssertEqual(RichHtmlVisualTheme.contrastingForeground("#5f6cd9"), "#ffffff")
  }

  func testSettledRepliesBoundPreviewsAndKeepNativeSource() throws {
    let html = "```poracode-html-v1 Chart\n<h1>42</h1>\n```\n"
    let native = "```poracode-visual-v1 Native\n{}\n```\n"
    let blocks = try XCTUnwrap(
      RichInlineVisualParser.blocks(
        for: "Intro\n\(String(repeating: html, count: 5))\(native)", settled: true))
    let previews = blocks.compactMap { block -> RichHtmlVisualPresentation? in
      if case .html(let visual) = block { visual } else { nil }
    }
    XCTAssertEqual(previews.map(\.limited), [false, false, false, false, true])
    XCTAssertEqual(previews.map(\.sourceOnlyReason), [nil, nil, nil, nil, .limited])
    XCTAssertEqual(blocks.first, .markdown("Intro\n"))
    XCTAssertEqual(blocks.last, .source(language: "poracode-visual-v1 Native", source: "{}\n"))
    XCTAssertNil(RichInlineVisualParser.blocks(for: html, settled: false))
    XCTAssertNil(RichInlineVisualParser.blocks(for: "```html\n<b>x</b>\n```", settled: true))
  }

  func testRetainedHistoryWithAnElisionNoticeNeverPreviews() {
    let html = "```poracode-html-v1 Chart\n<h1>42</h1>\n[... poracode elided 9 characters of earlier output ...]\n```"
    XCTAssertNil(RichInlineVisualParser.blocks(for: html, settled: true))
    let beyondHead = "```poracode-html-v1 Chart\n<h1>\(String(repeating: "x", count: 256_200))</h1>\n```\n[... poracode elided 9 characters of earlier output ...]"
    XCTAssertNotNil(RichInlineVisualParser.blocks(for: beyondHead, settled: true))
  }

  func testUnrenderableBlocksStaySourceAndOnlyWebLinksLeave() {
    func reason(_ html: String = "<b>x</b>", version: Int = 1, complete: Bool = true)
      -> RichHtmlVisualPresentation.SourceOnlyReason?
    {
      RichHtmlVisualPresentation(
        title: "", html: html, version: version, complete: complete, limited: false
      ).sourceOnlyReason
    }
    XCTAssertNil(reason())
    XCTAssertEqual(reason(complete: false), .incomplete)
    XCTAssertEqual(reason(version: 2), .unsupported)
    XCTAssertEqual(
      reason(String(repeating: "x", count: RichInlineVisualParser.maxSourceBytes + 1)), .tooLarge)
    XCTAssertEqual(
      RichInlineVisualParser.linkURL("https://example.com/docs")?.absoluteString,
      "https://example.com/docs")
    XCTAssertNotNil(
      RichInlineVisualParser.linkURL("https://example.com/items?filter[name]=x&q={y}#a|b"))
    XCTAssertNil(
      RichInlineVisualParser.linkURL("https://example.com/" + String(repeating: "😀", count: 1100)))
    for value in [
      "javascript:alert(1)", "file:///etc/passwd", "https://user:secret@example.com/", "/relative",
      "mailto:someone@example.com",
    ] {
      XCTAssertNil(RichInlineVisualParser.linkURL(value), value)
    }
  }

  private func decodePart(_ value: RichJSON) throws -> RichInlineVisualPart {
    let object = try richFixtureObject(value)
    let kind = try XCTUnwrap(object["kind"]?.stringValue)
    if kind == "markdown" { return .markdown(try XCTUnwrap(object["text"]?.stringValue)) }
    let version = NSDecimalNumber(decimal: try XCTUnwrap(object["version"]?.decimalValue)).intValue
    let title = try XCTUnwrap(object["title"]?.stringValue)
    let complete = try XCTUnwrap(object["complete"]?.boolValue)
    return kind == "visual"
      ? .visual(
        version: version, title: title, html: try XCTUnwrap(object["html"]?.stringValue),
        complete: complete)
      : .native(
        version: version, title: title, source: try XCTUnwrap(object["source"]?.stringValue),
        complete: complete)
  }
}
