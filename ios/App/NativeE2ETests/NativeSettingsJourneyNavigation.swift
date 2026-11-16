import XCTest

extension NativeFamilyJourneyUITests {
  func assertNativePageActionAtLowerEdge(_ action: XCUIElement, pageID: String, name: String) throws {
    let page = app.descendants(matching: .any).matching(identifier: pageID).firstMatch
    XCTAssertTrue(page.exists)
    let actionFrame = action.frame, pageFrame = page.frame, appFrame = app.frame
    let keyboard = app.keyboards.firstMatch
    let keyboardFrame = keyboard.exists ? keyboard.frame : nil
    func rect(_ frame: CGRect) -> [String: Double] {
      ["x": frame.minX, "y": frame.minY, "width": frame.width, "height": frame.height]
    }
    var geometry: [String: Any] = [
      "app": rect(appFrame), "page": rect(pageFrame), "action": rect(actionFrame),
      "keyboardVisible": keyboardFrame != nil,
    ]
    if let keyboardFrame { geometry["keyboard"] = rect(keyboardFrame) }
    let data = try JSONSerialization.data(withJSONObject: geometry, options: [.prettyPrinted, .sortedKeys])
    let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
    attachment.name = "page-action-\(name)"
    attachment.lifetime = .keepAlways
    add(attachment)
    XCTAssertTrue(action.isHittable)
    XCTAssertGreaterThanOrEqual(actionFrame.height, 44)
    if let keyboardFrame {
      XCTAssertLessThanOrEqual(actionFrame.maxY, keyboardFrame.minY,
        "Page actions must remain above the visible keyboard")
    } else {
      XCTAssertGreaterThan(actionFrame.midY, appFrame.maxY - appFrame.height * 0.2,
        "A page action with no keyboard must remain in the lower portion of the sheet")
    }
  }

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
