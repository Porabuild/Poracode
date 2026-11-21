import XCTest
@testable import App

final class HomeNewsFormattingTests: XCTestCase {
  func testGeneratedCatalogContainsAllRemoteFeaturesAndCopyInThirteenLocales() {
    let catalog = HomeNewsCatalog.bundled
    XCTAssertEqual(catalog.features.count, 17)
    XCTAssertEqual(catalog.featureIDs.count, 17)
    XCTAssertEqual(catalog.promotions.count, 3)
    XCTAssertFalse(catalog.usageProviders.isEmpty)
    for feature in catalog.features { XCTAssertEqual(feature.pitch.count, 13); XCTAssertEqual(feature.action.count, 13) }
  }

  func testNativeStringCatalogFormatsPluralFactsAndEscapedPercent() {
    let english = Locale(identifier: "en_US")
    XCTAssertEqual(HomeNewsFormatting.insight(.streak(current: 4, longest: 4), locale: english), "4 days in a row · your best streak yet")
    XCTAssertEqual(HomeNewsFormatting.insight(.weekPrompts(prompts: 5, daily: [], busiestDay: nil), locale: english), "5 prompts this week")
    XCTAssertEqual(HomeNewsFormatting.insight(.topModel(label: "Fixture", percent: 25), locale: english), "Fixture handles 25% of your prompts")
    let russian = HomeNewsFormatting.insight(.weekPrompts(prompts: 5, daily: [], busiestDay: nil), locale: Locale(identifier: "ru"))
    XCTAssertTrue(russian.contains("5"))
    XCTAssertFalse(russian.contains("prompts"))
    XCTAssertFalse(russian.contains("news.week"))
  }
}
