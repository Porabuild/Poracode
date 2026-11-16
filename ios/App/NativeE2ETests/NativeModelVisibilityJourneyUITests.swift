import XCTest
import UIKit

extension NativeFamilyJourneyUITests {
  func testModelVisibilitySearchFamiliesBulkAndRuntimeSelection() async throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey edits controlled model visibility catalogs only.")
    if let style = ProcessInfo.processInfo.environment["NATIVE_E2E_INTERFACE_STYLE"] {
      app.launchArguments += ["-AppleInterfaceStyle", style, "-ios.appearance.mode", style.lowercased()]
    }
    let isPad = UIDevice.current.userInterfaceIdiom == .pad
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/model-visibility-ready", method: "POST")
    try await pairUntilHome()
    if isPad {
      XCUIDevice.shared.orientation = .landscapeLeft
      try await poll { self.app.frame.width > self.app.frame.height }
    }
    _ = try await control(path: "/v1/checkpoints/model-visibility-ready", method: "POST")
    try openNativeModelsSettings()
    let open = app.buttons["native-e2e.settings.models.open"]
    XCTAssertTrue(open.waitForExistence(timeout: 10)); open.tap()
    let search = app.searchFields.firstMatch
    XCTAssertTrue(search.waitForExistence(timeout: 10))
    try assertNativePageActionAtLowerEdge(app.buttons["native-e2e.settings.models.actions"],
      pageID: "native-e2e.settings.models.list", name: "models-initial")
    searchModels("pro-fast")
    let keyboard = app.keyboards.firstMatch
    XCTAssertTrue(keyboard.waitForExistence(timeout: 5), "Exercise avoidance with the software keyboard visible")
    let family = app.buttons["native-e2e.settings.models.row.family-fixture:pro"]
    XCTAssertTrue(family.waitForExistence(timeout: 5))
    do {
      // Existence alone does not prove filtering: this row is already in the
      // full inventory. Wait for unrelated providers to leave, then scroll
      // the result into the list area above the keyboard, as a person would.
      try await poll { !self.app.buttons["native-e2e.settings.models.provider.codex"].exists }
      revealModelVisibility(family)
    } catch {
      modelVisibilityProof("search-wait-failure")
      throw error
    }
    XCTAssertTrue(family.isHittable)
    XCTAssertGreaterThanOrEqual(family.frame.height, 44)
    XCTAssertLessThanOrEqual(family.frame.maxY, keyboard.frame.minY)
    try assertNativePageActionAtLowerEdge(app.buttons["native-e2e.settings.models.actions"],
      pageID: "native-e2e.settings.models.list", name: "models-keyboard")
    modelVisibilityProof("keyboard-search-results")
    family.tap()
    try await poll { family.value as? String == "Hidden" && family.isEnabled }
    modelVisibilityProof("family-search-hidden")
    family.tap()
    try await poll { family.value as? String == "Visible" && family.isEnabled }
    try dismissModelVisibilitySearch()
    try await poll { !self.app.keyboards.firstMatch.exists }
    let count = app.descendants(matching: .any).matching(identifier: "native-e2e.settings.models.count").firstMatch
    let list = app.descendants(matching: .any).matching(identifier: "native-e2e.settings.models.list").firstMatch
    for _ in 0..<4 where !count.exists { list.swipeDown() }
    XCTAssertTrue(count.waitForExistence(timeout: 5))
    let total = try XCTUnwrap(modelVisibilityCount(count).last)
    let actions = app.buttons["native-e2e.settings.models.actions"]
    try assertNativePageActionAtLowerEdge(actions, pageID: "native-e2e.settings.models.list", name: "models-search-dismissed")
    XCTAssertTrue(actions.isHittable); actions.tap(); app.buttons["Hide all"].tap()
    try await poll { self.modelVisibilityCount(count) == [0, total] && actions.isEnabled }
    actions.tap(); app.buttons["Show all"].tap()
    try await poll { self.modelVisibilityCount(count) == [total, total] && actions.isEnabled }
    modelVisibilityProof("all-models-visible")
    searchModels("named fixture")
    let runtime = app.buttons["native-e2e.settings.models.surface.named-fixture"]
    XCTAssertTrue(runtime.waitForExistence(timeout: 5))
    try await poll { !self.app.buttons["native-e2e.settings.models.provider.family-fixture"].exists }
    revealModelVisibility(runtime)
    runtime.tap()
    app.buttons["Bridge"].tap()
    let shared = app.buttons["native-e2e.settings.models.row.named-fixture:gui:bridge:remote/shared"]
    XCTAssertTrue(shared.waitForExistence(timeout: 5)); revealModelVisibility(shared); shared.tap()
    try await poll { shared.value as? String == "Hidden" && shared.isEnabled }
    revealModelVisibility(runtime); runtime.tap(); app.buttons["All runtimes"].tap()
    let unified = app.buttons["native-e2e.settings.models.row.named-fixture:gui:bridge:remote/shared"]
    try await poll { unified.value as? String == "Visible in some runtimes" }
    modelVisibilityProof("partially-visible-runtime")
    XCTAssertTrue(unified.frame.width <= app.frame.width)
    revealModelVisibility(unified)
    unified.tap()
    try await poll { unified.value as? String == "Visible" && unified.isEnabled }
    revealModelVisibility(runtime); runtime.tap(); app.buttons["Bridge"].tap()
    searchModels("remote/terminal")
    XCTAssertTrue(runtime.exists, "A runtime with no matching rows keeps its runtime picker")
    XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "No Results")).firstMatch.waitForExistence(timeout: 5))
    modelVisibilityProof("empty-runtime-search-keeps-picker")
    revealModelVisibility(runtime); runtime.tap(); app.buttons["CLI"].tap()
    let terminal = app.buttons["native-e2e.settings.models.row.named-fixture:terminal:cli:remote/terminal"]
    XCTAssertTrue(terminal.waitForExistence(timeout: 5))
    revealModelVisibility(terminal)
    XCTAssertTrue(terminal.isHittable)
    try dismissModelVisibilitySearch()
    app.navigationBars["Visible models"].buttons["Done"].tap()
    XCTAssertTrue(open.waitForExistence(timeout: 5))
    open.tap()
    XCTAssertTrue(app.searchFields.firstMatch.waitForExistence(timeout: 5))
    searchModels("pro-fast")
    XCTAssertTrue(family.waitForExistence(timeout: 5))
    XCTAssertEqual(family.value as? String, "Visible", "Reopening keeps the authoritative saved catalog")
    modelVisibilityProof("saved-catalog-reopened")
  }

  private func modelVisibilityProof(_ name: String) {
    let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    attachment.name = "model-visibility-\(name)"
    attachment.lifetime = .keepAlways
    add(attachment)
  }

  private func modelVisibilityCount(_ element: XCUIElement) -> [Int] {
    // LabeledContent announces "Visible models, 0 / 11" on current iOS.
    element.label.split(whereSeparator: { !$0.isNumber }).compactMap { Int($0) }
  }

  private func searchModels(_ query: String) {
    let field = app.searchFields["Search models"].firstMatch
    field.tap()
    if field.buttons["Clear text"].isHittable { field.buttons["Clear text"].tap() }
    field.tap()
    field.typeText(query)
  }

  private func revealModelVisibility(_ element: XCUIElement) {
    let list = app.descendants(matching: .any).matching(identifier: "native-e2e.settings.models.list").firstMatch
    XCTAssertTrue(list.exists)
    for _ in 0..<4 {
      var visible = list.frame.intersection(app.frame)
      let search = app.searchFields["Search models"].firstMatch
      if search.exists {
        if search.frame.midY < visible.midY {
          let top = max(visible.minY, search.frame.maxY + 8)
          visible.size.height = visible.maxY - top
          visible.origin.y = top
        } else {
          visible.size.height = min(visible.maxY, search.frame.minY - 8) - visible.minY
        }
      }
      let keyboard = app.keyboards.firstMatch
      if keyboard.exists { visible.size.height = min(visible.maxY, keyboard.frame.minY) - visible.minY }
      XCTAssertGreaterThan(visible.height, 40, "The settings list keeps a usable region above the keyboard")
      let frame = element.frame
      if !frame.isEmpty, frame.minY >= visible.minY, frame.maxY <= visible.maxY, element.isHittable { return }
      let origin = list.coordinate(withNormalizedOffset: .zero)
      // Native list cells have no nested text scroller. Start inside the cell,
      // away from the inset gutter and the floating menu at the leading edge.
      let x = visible.midX - list.frame.minX
      let distance: CGFloat
      if frame.isEmpty { distance = -visible.height * 0.35 }
      else { distance = visible.midY - frame.midY }
      let limit = visible.height * 0.4
      let start = origin.withOffset(.init(dx: x, dy: visible.midY - list.frame.minY))
      let end = start.withOffset(.init(dx: 0, dy: max(-limit, min(limit, distance))))
      start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.1)
    }
    let hittable = element.isHittable
    if !hittable {
      let keyboard = app.keyboards.firstMatch
      print("Model reveal failure: element=\(element.frame), list=\(list.frame), search=\(app.searchFields.firstMatch.frame), keyboard=\(keyboard.exists ? keyboard.frame : .zero), actions=\(app.buttons["native-e2e.settings.models.actions"].frame)")
      modelVisibilityProof("reveal-failure")
    }
    XCTAssertTrue(hittable)
  }

  private func dismissModelVisibilitySearch() throws {
    // Native search uses Cancel, Close or close across these presentations.
    let actions = app.buttons.matching(NSPredicate(format: "label IN %@", ["Cancel", "Close", "close"]))
    if let button = actions.allElementsBoundByIndex.first(where: \.isHittable) {
      button.tap()
    } else {
      // An inline iPad search keeps Done in the navigation bar and has no
      // separate dismissal button. Clear/submit retains that native layout.
      let field = app.searchFields.firstMatch
      XCTAssertTrue(field.exists)
      if field.buttons["Clear text"].isHittable { field.buttons["Clear text"].tap() }
      if app.keyboards.firstMatch.exists {
        field.tap()
        field.typeText("\n")
      }
    }
  }
}
