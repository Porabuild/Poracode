import XCTest
@testable import App

/// Regression coverage for assistant file-card markdown parsing.
final class RichChatMarkdownFileCardTests: XCTestCase {

  func testStandaloneArtifactLinkParsesAsCard() {
    let blocks = RichChatMarkdownParser.parse("[release](out/release.zip)")
    XCTAssertEqual(1, blocks.count)
    guard case .fileCard(let ref) = blocks.first else {
      XCTFail("expected fileCard, got \(String(describing: blocks.first))")
      return
    }
    XCTAssertEqual("out/release.zip", ref.path)
  }

  func testArtifactOnlyUnorderedListPromotesToCardList() {
    let blocks = RichChatMarkdownParser.parse(
      "- [a](out/a.zip)\n- [b](docs/report.pdf)")
    XCTAssertEqual(1, blocks.count)
    guard case .fileCardList(let refs) = blocks.first else {
      XCTFail("expected fileCardList")
      return
    }
    XCTAssertEqual(2, refs.count)
    XCTAssertEqual("out/a.zip", refs[0].path)
    XCTAssertEqual("docs/report.pdf", refs[1].path)
  }

  func testMixedListKeepsMarkersAndRows() {
    let blocks = RichChatMarkdownParser.parse(
      "- plain bullet\n- [zip](out/a.zip)")
    XCTAssertEqual(1, blocks.count)
    guard case .unorderedList(let items) = blocks.first else {
      XCTFail("expected mixed list")
      return
    }
    XCTAssertEqual(2, items.count)
  }

  func testOrderedAndPlainListsUnchanged() {
    let ordered = RichChatMarkdownParser.parse("1. [zip](out/a.zip)")
    XCTAssertFalse(ordered.contains { if case .fileCard = $0 { true } else { false } })
    let bullets = RichChatMarkdownParser.parse("- alpha\n- beta")
    XCTAssertFalse(bullets.contains { if case .fileCardList = $0 { true } else { false } })
  }

  func testIndentedListRowsRemainCodeNotCards() {
    // 4-space-indented list lines are code, never promoted to cards.
    let blocks = RichChatMarkdownParser.parse("    - [zip](out/a.zip)\n    - [pdf](docs/b.pdf)")
    XCTAssertFalse(blocks.contains {
      if case .fileCardList = $0 { true } else { false }
    })
    XCTAssertFalse(blocks.contains {
      if case .fileCard = $0 { true } else { false }
    })
    guard case .code = blocks.first else {
      XCTFail("expected code block for indented list")
      return
    }
  }

  func testFencedCodeAndIndentedLinkAreNotCards() {
    let fenced = RichChatMarkdownParser.parse("```\n[x](out/a.zip)\n```")
    XCTAssertFalse(fenced.contains { if case .fileCard = $0 { true } else { false } })
    let indented = RichChatMarkdownParser.parse("    [x](out/a.zip)")
    XCTAssertFalse(indented.contains { if case .fileCard = $0 { true } else { false } })
  }

  func testDestinationDecodesExactlyOnce() {
    // %2520 must survive one decode as the literal %20 — never a space.
    let blocks = RichChatMarkdownParser.parse("[a](out/a%2520b.zip)")
    guard case .fileCard(let ref) = blocks.first else {
      XCTFail("expected fileCard")
      return
    }
    XCTAssertEqual("out/a%20b.zip", ref.path)
  }
}
