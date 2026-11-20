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
    // A system toolbar supplies its own hit behavior. XCTest reports the
    // accessibility element frame, which can be smaller than the default
    // 44-point control size. Check both dimensions against Apple's 28-point minimum.
    XCTAssertGreaterThanOrEqual(actionFrame.width, 28)
    XCTAssertGreaterThanOrEqual(actionFrame.height, 28)
    if let keyboardFrame {
      XCTAssertLessThanOrEqual(actionFrame.maxY, keyboardFrame.minY,
        "Page actions must remain above the visible keyboard")
    } else {
      XCTAssertGreaterThan(actionFrame.midY, pageFrame.maxY - pageFrame.height * 0.2,
        "A page action with no keyboard must remain in the lower portion of the sheet")
      assertNativeDuoToolbarRail(action)
    }
  }

  func assertNativeDuoToolbarRail(
    _ action: XCUIElement, file: StaticString = #filePath, line: UInt = #line
  ) {
    guard ProcessInfo.processInfo.environment["NATIVE_E2E_EXPECT_VERTICAL_TOOLBAR"] == "1" else { return }
    let display = app.frame
    XCTAssertGreaterThan(action.frame.midX, display.minX + display.width * 0.84,
      "The bottom toolbar action belongs in the outer display's right rail", file: file, line: line)
    XCTAssertGreaterThan(action.frame.midY, display.midY,
      "The bottom toolbar action belongs below the navigation group", file: file, line: line)
  }

  func openNativeModelsSettings() throws {
    try openNativeSettings()
    let models = app.buttons["Models"].firstMatch
    for _ in 0..<4 { if models.isHittable { break }; app.swipeUp() }
    XCTAssertTrue(models.isHittable); models.tap()
  }

  func openNativeSettings() throws {
    let more = app.buttons.matching(NSPredicate(format: "identifier IN %@", [
      "native-e2e.session-menu", "native-e2e.sidebar.more-tools",
    ])).firstMatch
    if more.frame.isEmpty || !app.frame.intersects(more.frame) || !more.isHittable {
      app.buttons["native-e2e.sidebar-toggle"].tap()
    }
    XCTAssertTrue(more.waitForExistence(timeout: 10)); more.tap()
    let settings = app.buttons["native-e2e.more.settings"].firstMatch
    if !settings.isHittable {
      let list = app.descendants(matching: .any).matching(identifier: "native-e2e.more.list").firstMatch
      XCTAssertTrue(list.waitForExistence(timeout: 5))
      for _ in 0..<4 where !settings.isHittable { list.swipeUp() }
    }
    XCTAssertTrue(settings.isHittable); settings.tap()
  }

  func openNativeSettingsPage(_ identifier: String) throws {
    try openNativeSettings()
    let page = app.buttons[identifier]
    if !page.exists || !page.isHittable {
      // The More list can still own the accessibility tree while Settings is
      // animating in. Resolve the scroll container after the settings rows mount.
      _ = app.buttons["native-e2e.settings.profile"].waitForExistence(timeout: 5)
      let index = try XCTUnwrap(app.collectionViews.allElementsBoundByIndex.enumerated().first { _, list in
        list.buttons["native-e2e.settings.profile"].exists || list.buttons[identifier].exists
      }?.offset)
      let list = app.collectionViews.element(boundBy: index)
      for _ in 0..<6 where !page.exists || !page.isHittable { list.swipeUp() }
    }
    XCTAssertTrue(page.exists); XCTAssertTrue(page.isHittable); page.tap()
  }

  func closeNativeModelsSettings() throws {
    tapNativeSettingsBack(from: "Models", to: "Settings")
    tapNativeSettingsBack(from: "Settings", to: "More")
    let done = app.descendants(matching: .any).matching(identifier: "native-e2e.more.close").firstMatch
    XCTAssertTrue(done.waitForExistence(timeout: 5)); done.tap()
  }

  func tapNativeSettingsBack(from title: String, to previousTitle: String) {
    let bar = app.navigationBars[title]
    let nativeBack = bar.descendants(matching: .any).matching(identifier: "BackButton").firstMatch
    if nativeBack.exists {
      nativeBack.tap()
    } else {
      let verticalBack = app.descendants(matching: .any).matching(identifier: "BackButton").firstMatch
      if verticalBack.exists { verticalBack.tap() }
      else { bar.buttons[previousTitle].tap() }
    }
  }
}
