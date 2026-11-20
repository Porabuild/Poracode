import UIKit
import XCTest

extension NativeFamilyJourneyUITests {
  func testThemeAndShortcutToolbarActionsPreserveDraftsAcrossDisplays() async throws {
    app.launchArguments.append("-native-e2e-keybindings-fresh-preferences")
    try await prepareCustomThemeJourney()
    try openCustomThemes()
    let create = app.buttons["native-e2e.theme.create"]
    assertNativeDuoToolbarRail(create)
    assertNativeDuoToolbarRail(app.buttons["native-e2e.theme.import"])
    create.tap()
    let name = app.textFields["native-e2e.theme.name"]
    replaceThemeField(name, with: "Fold Theme Check")
    let dark = app.buttons["Dark"].firstMatch
    XCTAssertTrue(dark.waitForExistence(timeout: 5)); dark.tap()
    let background = app.textFields["native-e2e.theme.hex.dark.bg"]
    try revealThemeElement(background)
    replaceThemeField(background, with: "#20232a")
    try await assertDraftSurvivesDisplayTransitions("theme", field: background, value: "#20232a")
    let save = app.buttons["native-e2e.theme.save"]
    XCTAssertTrue(save.isEnabled)
    if app.keyboards.firstMatch.exists {
      XCTAssertLessThanOrEqual(save.frame.maxY, app.keyboards.firstMatch.frame.minY)
    }
    save.tap()
    XCTAssertTrue(themeRow("Fold Theme Check").waitForExistence(timeout: 10))
    XCTAssertTrue(themeRow("Fold Theme Check").isSelected)
    tapNativeSettingsBack(from: "Custom theme", to: "Appearance")
    tapNativeSettingsBack(from: "Appearance", to: "Settings")

    let shortcuts = app.buttons["native-e2e.settings.shortcuts"]
    for _ in 0..<5 where !shortcuts.isHittable { app.swipeDown() }
    XCTAssertTrue(shortcuts.waitForExistence(timeout: 5)); shortcuts.tap()
    let catalog = app.descendants(matching: .any)
      .matching(identifier: "native-e2e.keyboard.catalog").firstMatch
    XCTAssertTrue(catalog.waitForExistence(timeout: 5))
    let search = app.searchFields.firstMatch
    let command = app.buttons["native-e2e.keyboard.command.thread.new"]
    if search.exists, search.isHittable {
      search.tap()
      search.typeText("New Thread")
    } else {
      for _ in 0..<5 where !command.isHittable { catalog.swipeUp() }
    }
    XCTAssertTrue(command.waitForExistence(timeout: 5)); command.tap()
    let add = app.buttons["native-e2e.keyboard.add"]
    XCTAssertTrue(add.waitForExistence(timeout: 5))
    assertNativeDuoToolbarRail(add)
    add.tap()
    let record = app.buttons["native-e2e.keyboard.record"]
    XCTAssertTrue(record.waitForExistence(timeout: 5)); record.tap()
    let stop = app.descendants(matching: .any)
      .matching(identifier: "native-e2e.keyboard.cancel-recording").firstMatch
    XCTAssertTrue(stop.waitForExistence(timeout: 5))
    assertNativeDuoToolbarRail(stop)
    XCTAssertFalse(app.buttons["native-e2e.keyboard.save"].isEnabled)
    stop.tap()
    let keys = app.textFields["native-e2e.keyboard.keys"]
    XCTAssertTrue(keys.waitForExistence(timeout: 5)); keys.tap()
    keys.typeText("Command+Shift+J")
    try await assertDraftSurvivesDisplayTransitions("shortcut", field: keys, value: "Command+Shift+J")
    let shortcutSave = app.buttons["native-e2e.keyboard.save"]
    XCTAssertTrue(shortcutSave.isEnabled)
    if app.keyboards.firstMatch.exists {
      XCTAssertLessThanOrEqual(shortcutSave.frame.maxY, app.keyboards.firstMatch.frame.minY)
    }
    shortcutSave.tap()
    let added = app.buttons.matching(NSPredicate(
      format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "native-e2e.keyboard.binding.thread.new.", "⇧⌘J"
    )).firstMatch
    XCTAssertTrue(added.waitForExistence(timeout: 5))
    customThemeProof("native-shortcut-saved")
  }

  func testCustomThemeActiveFieldStaysVisibleWhenTheEditorRotates() async throws {
    try await prepareCustomThemeJourney()
    try openCustomThemes()
    app.buttons["native-e2e.theme.create"].tap()
    let name = app.textFields["native-e2e.theme.name"]
    replaceThemeField(name, with: "RetainedThemeName")
    let save = app.buttons["native-e2e.theme.save"]

    for orientation in journeyOrientations {
      try await rotateIPadJourney(to: orientation)
      let list = try themeEditorList(containing: name)
      try await poll {
        self.app.keyboards.firstMatch.exists
          && self.app.navigationBars.matching(identifier: "Custom theme").containing(.any, identifier: "native-e2e.theme.cancel").count == 1
          && self.themeEditorViewport(list).contains(name.frame)
      }
      XCTAssertEqual(name.value as? String, "RetainedThemeName")
      XCTAssertTrue(app.keyboards.firstMatch.exists)
      let viewport = themeEditorViewport(try themeEditorList(containing: name))
      let geometry = XCTAttachment(string: "viewport=\(viewport), name=\(name.frame), save=\(save.frame), keyboard=\(app.keyboards.firstMatch.frame)")
      geometry.name = "focused-name-geometry-\(orientation.rawValue)"; geometry.lifetime = .keepAlways; add(geometry)
      customThemeLayout("focused-name-\(orientation.rawValue)")
      XCTAssertTrue(viewport.contains(name.frame), "Rotation must keep the complete focused name above chrome")
      XCTAssertLessThanOrEqual(save.frame.maxY, app.keyboards.firstMatch.frame.minY)
      XCTAssertTrue(name.isHittable)
    }

    let background = app.textFields["native-e2e.theme.hex.light.bg"]
    try revealThemeElement(background)
    replaceThemeField(background, with: "#abcdef")
    try await rotateIPadJourney(to: .landscapeLeft)
    let list = try themeEditorList(containing: background)
    try await poll {
      self.app.keyboards.firstMatch.exists
        && self.app.navigationBars.matching(identifier: "Custom theme").containing(.any, identifier: "native-e2e.theme.cancel").count == 1
        && self.themeEditorViewport(list).contains(background.frame)
    }
    XCTAssertEqual(background.value as? String, "#abcdef")
    XCTAssertTrue(app.keyboards.firstMatch.exists)
    XCTAssertTrue(themeEditorViewport(try themeEditorList(containing: background)).contains(background.frame),
      "Rotation must also keep the active color field visible")
    customThemeProof("focused-color-retained")
    app.descendants(matching: .any).matching(identifier: "native-e2e.theme.cancel").firstMatch.tap()
  }

  func testCustomThemePortableFileExportsAndImportsThroughNativeFiles() async throws {
    try await prepareCustomThemeJourney()
    try openCustomThemes()
    app.buttons["native-e2e.theme.create"].tap()
    let name = app.textFields["native-e2e.theme.name"]
    replaceThemeField(name, with: "Portable Theme Check")
    app.buttons["native-e2e.theme.export"].tap()
    customThemeLayout("file-export")
    let local = app.staticTexts.matching(NSPredicate(format: "label IN %@", ["On My iPad", "On My iPhone"])).firstMatch
    if local.waitForExistence(timeout: 3), local.isHittable { local.tap() }
    let export = app.buttons.matching(NSPredicate(format: "label IN %@", ["Export", "Save", "Move"])).firstMatch
    XCTAssertTrue(export.waitForExistence(timeout: 10)); export.tap()
    let replace = app.alerts.buttons["Replace"]
    if replace.waitForExistence(timeout: 2) { replace.tap() }
    XCTAssertTrue(app.buttons["native-e2e.theme.save"].waitForExistence(timeout: 10))
    app.descendants(matching: .any).matching(identifier: "native-e2e.theme.cancel").firstMatch.tap()
    XCTAssertFalse(themeRow("Portable Theme Check").exists, "Export must not save or apply a draft")
    app.buttons["native-e2e.theme.import"].tap()
    customThemeLayout("file-import")
    let file = app.staticTexts.matching(NSPredicate(format: "label IN %@", ["poracode-theme", "poracode-theme.json"])).firstMatch
    if !file.exists {
      let browse = app.buttons["Browse"].firstMatch
      if browse.exists, browse.isHittable { browse.tap() }
      if local.exists, local.isHittable { local.tap() }
    }
    XCTAssertTrue(file.waitForExistence(timeout: 10))
    let tile = app.cells.matching(NSPredicate(format: "identifier BEGINSWITH %@", "poracode-theme.json")).firstMatch
    XCTAssertTrue(tile.waitForExistence(timeout: 10)); XCTAssertTrue(tile.isEnabled)
    tile.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.25)).tap()
    customThemeLayout("file-import-selected")
    let open = app.buttons["Open"].firstMatch
    if open.exists, open.isHittable { open.tap() }
    XCTAssertTrue(name.waitForExistence(timeout: 10))
    XCTAssertEqual(name.value as? String, "Portable Theme Check")
    customThemeProof("imported-portable-file")
    app.buttons["native-e2e.theme.save"].tap()
    let row = themeRow("Portable Theme Check")
    XCTAssertTrue(row.waitForExistence(timeout: 10)); XCTAssertTrue(row.isSelected)
  }

  func testCustomThemeHexInputsRemainReadableAtAccessibilitySizeAndTrimPastedValues() async throws {
    app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
    try await prepareCustomThemeJourney()
    try openCustomThemes()
    app.buttons["native-e2e.theme.create"].tap()
    let name = app.textFields["native-e2e.theme.name"]
    replaceThemeField(name, with: "A")
    name.typeText(String(repeating: "b", count: 80))
    XCTAssertEqual((name.value as? String)?.unicodeScalars.count, 80)
    let background = app.textFields["native-e2e.theme.hex.light.bg"]
    try revealThemeElement(background)
    XCTAssertGreaterThan(background.frame.height, 44, "Accessibility text must grow beyond the ordinary row height")
    XCTAssertTrue(app.frame.contains(background.frame))
    replaceThemeField(background, with: "#abc")
    background.typeText(" ")
    XCTAssertEqual(background.value as? String, "#abc")
    XCTAssertTrue(app.buttons["native-e2e.theme.save"].isEnabled)
    customThemeProof("accessibility-hex-editor")
  }

  func testCustomThemeEditsValidateRetainAcrossRotationAndPersistAfterRelaunch() async throws {
    try await prepareCustomThemeJourney()
    try openCustomThemes()
    app.buttons["native-e2e.theme.create"].tap()
    let name = app.textFields["native-e2e.theme.name"]
    XCTAssertTrue(name.waitForExistence(timeout: 10))
    replaceThemeField(name, with: "Cancelled theme")
    app.descendants(matching: .any).matching(identifier: "native-e2e.theme.cancel").firstMatch.tap()
    XCTAssertFalse(app.buttons.containing(.staticText, identifier: "Cancelled theme").firstMatch.exists)

    app.buttons["native-e2e.theme.create"].tap()
    replaceThemeField(name, with: "Native Theme Check")
    customThemeLayout("named-editor")
    let background = app.textFields["native-e2e.theme.hex.light.bg"]
    try revealThemeElement(background)
    replaceThemeField(background, with: "invalid")
    let save = app.buttons["native-e2e.theme.save"]
    XCTAssertFalse(save.isEnabled, "Invalid colors must never be persisted or applied")
    replaceThemeField(background, with: "#f0e8dd")
    XCTAssertTrue(save.isEnabled)
    XCTAssertTrue(app.keyboards.firstMatch.exists)
    XCTAssertLessThanOrEqual(save.frame.maxY, app.keyboards.firstMatch.frame.minY)
    customThemeProof("editor-light-keyboard")

    try await rotateIPadJourney(to: UIDevice.current.userInterfaceIdiom == .pad ? .portrait : .landscapeLeft)
    XCTAssertEqual(background.value as? String, "#f0e8dd")
    XCTAssertLessThanOrEqual(save.frame.maxY, app.keyboards.firstMatch.frame.minY)
    customThemeProof("editor-retained-keyboard")
    try await rotateIPadJourney(to: .portrait)
    save.tap()
    let row = themeRow("Native Theme Check")
    XCTAssertTrue(row.waitForExistence(timeout: 10))
    XCTAssertTrue(row.isSelected)
    customThemeProof("saved-selected-theme")

    app.terminate()
    app.launchArguments.removeAll { $0 == "-native-e2e-custom-themes-fresh-state" }
    try await pairUntilHome()
    try openCustomThemes()
    XCTAssertTrue(row.waitForExistence(timeout: 10))
    XCTAssertTrue(row.isSelected)
    row.press(forDuration: 1.1)
    app.buttons["Edit theme"].firstMatch.tap()
    XCTAssertEqual(name.value as? String, "Native Theme Check")
    try revealThemeElement(background)
    XCTAssertEqual(background.value as? String, "#f0e8dd")
    customThemeProof("restored-editor")
    app.descendants(matching: .any).matching(identifier: "native-e2e.theme.cancel").firstMatch.tap()
    row.press(forDuration: 1.1)
    app.buttons["Delete theme"].firstMatch.tap()
    let delete = app.buttons["Delete"].firstMatch
    XCTAssertTrue(delete.waitForExistence(timeout: 5)); delete.tap()
    try await poll { !row.exists }
    customThemeProof("deleted-theme")
  }

  private func prepareCustomThemeJourney() async throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey uses disposable device settings and the controlled pairing peer.")
    _ = try await control(path: "/v1/reset", method: "POST")
    app.launchArguments += ["-native-e2e-custom-themes-fresh-state", "-AppleInterfaceStyle", "Light",
      "-ios.appearance.mode", "light"]
    XCUIDevice.shared.orientation = .portrait
    try await pairUntilHome()
    if UIDevice.current.userInterfaceIdiom == .pad {
      XCUIDevice.shared.orientation = .landscapeLeft
      try await poll { self.app.frame.width > self.app.frame.height }
    }
  }

  private func openCustomThemes() throws {
    try openNativeSettingsPage("native-e2e.settings.appearance")
    let custom = app.buttons["native-e2e.settings.custom-themes"]
    XCTAssertTrue(custom.waitForExistence(timeout: 10)); custom.tap()
    XCTAssertTrue(app.buttons["native-e2e.theme.create"].waitForExistence(timeout: 10))
  }

  private func themeRow(_ label: String) -> XCUIElement {
    app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label CONTAINS %@",
      "native-e2e.theme.row.", label)).firstMatch
  }

  private func revealThemeElement(_ element: XCUIElement) throws {
    let list = try themeEditorList(containing: element)
    for _ in 0..<6 where !element.isHittable || !themeEditorViewport(list).contains(element.frame) {
      let viewport = themeEditorViewport(list)
      XCTAssertGreaterThan(viewport.height, 60)
      let origin = list.coordinate(withNormalizedOffset: .zero)
      let down = !element.frame.isEmpty && element.frame.minY < viewport.minY
      let startY = viewport.minY + viewport.height * (down ? 0.25 : 0.75)
      let endY = viewport.minY + viewport.height * (down ? 0.75 : 0.25)
      origin.withOffset(CGVector(dx: viewport.midX - list.frame.minX, dy: startY - list.frame.minY))
        .press(forDuration: 0.05, thenDragTo: origin.withOffset(CGVector(
          dx: viewport.midX - list.frame.minX, dy: endY - list.frame.minY)))
    }
    if !element.isHittable { customThemeLayout("unreachable-hex") }
    XCTAssertTrue(element.isHittable)
    XCTAssertTrue(themeEditorViewport(list).contains(element.frame), "The full editor must be above the keyboard and floating actions")
  }

  private func themeEditorList(containing element: XCUIElement) throws -> XCUIElement {
    let index = try XCTUnwrap(app.collectionViews.allElementsBoundByIndex.enumerated().first { _, list in
      list.textFields["native-e2e.theme.name"].exists || list.textFields[element.identifier].exists
    }?.offset)
    return app.collectionViews.element(boundBy: index)
  }

  private func themeEditorViewport(_ list: XCUIElement) -> CGRect {
    var viewport = list.frame.intersection(app.frame)
    let bars = app.navigationBars.matching(identifier: "Custom theme").containing(.any, identifier: "native-e2e.theme.cancel")
    if bars.count == 1 {
      let bar = bars.element.frame
      if bar.width > bar.height, bar.intersects(viewport) {
        let bottom = viewport.maxY
        viewport.origin.y = max(viewport.minY, bar.maxY)
        viewport.size.height = max(0, bottom - viewport.minY)
      }
    } else {
      let cancel = app.descendants(matching: .any)
        .matching(identifier: "native-e2e.theme.cancel").firstMatch
      XCTAssertEqual(bars.count, 0)
      XCTAssertTrue(cancel.exists && ProcessInfo.processInfo.environment["NATIVE_E2E_EXPECT_VERTICAL_TOOLBAR"] == "1")
      XCTAssertGreaterThan(cancel.frame.midX, app.frame.minX + app.frame.width * 0.84)
    }
    if app.keyboards.firstMatch.exists {
      viewport.size.height = min(viewport.maxY, app.keyboards.firstMatch.frame.minY) - viewport.minY
    }
    let export = app.buttons["native-e2e.theme.export"]
    if export.exists, export.frame.midY > viewport.midY,
      (viewport.minX...viewport.maxX).contains(export.frame.midX) {
      viewport.size.height = min(viewport.maxY, export.frame.minY - 8) - viewport.minY
    }
    return viewport
  }

  /// These are short, single-line native fields. Tap beyond the displayed
  /// value to place the caret at its end before deleting the existing text.
  private func replaceThemeField(_ field: XCUIElement, with text: String) {
    XCTAssertEqual(field.elementType, .textField)
    XCTAssertTrue(field.waitForExistence(timeout: 10))
    let old = field.value as? String ?? ""
    field.coordinate(withNormalizedOffset: CGVector(dx: 0.98, dy: 0.5)).tap()
    field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: old.utf16.count) + text)
    XCTAssertEqual(field.value as? String, text)
  }

  private func customThemeProof(_ name: String) {
    let proof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    proof.name = "custom-theme-\(name)"; proof.lifetime = .keepAlways; add(proof)
  }

  private func customThemeLayout(_ name: String) {
    customThemeProof(name)
    let layout = XCTAttachment(string: app.debugDescription)
    layout.name = "custom-theme-layout-\(name)"; layout.lifetime = .keepAlways; add(layout)
  }
}
