import XCTest
@testable import App

final class HomeNewsFeedTests: XCTestCase {
  private struct Fixture: Decodable {
    struct Context: Decodable { let now: Double; let version: String; let platform: String; let locale: String; let used: [String: Bool] }
    struct Content: Decodable { let text: String?; let template: HomeNewsFeedTemplate? }
    struct Selected: Decodable { let id: String; let content: Content; let actionLabel: String? }
    struct Selection: Decodable { let context: Context; let expected: [Selected] }
    struct Link: Decodable { let url: String; let allowed: Bool }
    let knownFeatures: [String]
    let rawDocument: String
    let expectedIDs: [String]
    let selections: [Selection]
    let unusableDocuments: [String]
    let urls: [Link]
  }

  func testPublicEnvelopeAndIndividualItemRejectionMatchPWA() throws {
    let fixture = try fixture()
    let feed = try HomeNewsFeed.parse(Data(fixture.rawDocument.utf8), knownFeatureIDs: Set(fixture.knownFeatures))
    XCTAssertEqual(feed.items.map(\.id), fixture.expectedIDs)
    for document in fixture.unusableDocuments {
      XCTAssertThrowsError(try HomeNewsFeed.parse(Data(document.utf8), knownFeatureIDs: Set(fixture.knownFeatures)))
    }
  }

  func testSelectionPreservesLocaleMemberOrderAndPWAFiltering() throws {
    let fixture = try fixture()
    let feed = try HomeNewsFeed.parse(Data(fixture.rawDocument.utf8), knownFeatureIDs: Set(fixture.knownFeatures))
    for sample in fixture.selections {
      let context = sample.context
      let selected = feed.selected(now: context.now, version: context.version, platform: context.platform, isFeatureUsed: { context.used[$0] })
      XCTAssertEqual(selected.map(\.id), sample.expected.map(\.id))
      for (actual, expected) in zip(selected, sample.expected) {
        XCTAssertEqual(actual.text?.resolve(context.locale), expected.content.text)
        XCTAssertEqual(actual.template, expected.content.template)
        XCTAssertEqual(actual.action?.label?.resolve(context.locale), expected.actionLabel)
      }
    }
  }

  func testExternalActionsUseHTTPSAllowlistAndRejectCredentialsAndTraversal() throws {
    for sample in try fixture().urls { XCTAssertEqual(HomeNewsFeed.isAllowedURL(sample.url), sample.allowed, sample.url) }
    for url in ["https://github.com/Porabuild/%2e%2e/Other", "https://github.com/Porabuild/a/../../Other"] {
      XCTAssertFalse(HomeNewsFeed.isAllowedURL(url))
    }
  }

  func testFutureFeedFieldsAreIgnoredAndLongTextOrNullKnownFieldsDropOnlyTheirItem() throws {
    let raw = #"{"version":1,"future":true,"items":[{"id":"bad-null","kind":"announcement","text":{"en":"Hi"},"action":null},{"id":"good-item","kind":"announcement","text":{"en":"Hello"},"future":{"nested":"kept"}}]}"#
    let feed = try HomeNewsFeed.parse(Data(raw.utf8), knownFeatureIDs: [])
    XCTAssertEqual(feed.items.map(\.id), ["good-item"])
    XCTAssertEqual(feed.items.first?.text?.resolve("fr"), "Hello")
  }

  private func fixture() throws -> Fixture {
    try ProjectFixtureLoader.decode(Fixture.self, named: "client-news-feed.json")
  }
}
