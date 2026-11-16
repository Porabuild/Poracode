import XCTest

extension NativeFamilyJourneyUITests {
  func openNativeModelsSettings() throws {
    let more = app.buttons.matching(NSPredicate(format: "identifier IN %@", [
      "native-e2e.session-menu", "native-e2e.sidebar.more-tools",
    ])).firstMatch
    if !more.isHittable { app.buttons["native-e2e.sidebar-toggle"].tap() }
    XCTAssertTrue(more.waitForExistence(timeout: 10)); more.tap()
    let settings = app.buttons["Settings"].firstMatch
    if !settings.isHittable {
      let lists = [app.collectionViews, app.tables, app.scrollViews].map {
        $0.containing(.button, identifier: "native-e2e.more.connections").firstMatch
      }
      let list = try XCTUnwrap(lists.first(where: \.exists))
      for _ in 0..<4 where !settings.isHittable { list.swipeUp() }
    }
    XCTAssertTrue(settings.isHittable); settings.tap()
    let models = app.buttons["Models"].firstMatch
    for _ in 0..<4 { if models.isHittable { break }; app.swipeUp() }
    XCTAssertTrue(models.isHittable); models.tap()
  }

  func closeNativeModelsSettings() throws {
    app.navigationBars["Models"].buttons["Settings"].tap()
    app.navigationBars["Settings"].buttons["More"].tap()
    let done = app.buttons["native-e2e.more.close"]
    XCTAssertTrue(done.waitForExistence(timeout: 5)); done.tap()
  }
}
