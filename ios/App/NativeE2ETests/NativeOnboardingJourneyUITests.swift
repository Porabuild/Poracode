import XCTest

extension NativeFamilyJourneyUITests {
  func testPairingValidationHasSpaceAfterInputsAndKeepsConnectReachable() throws {
    defer { XCUIDevice.shared.orientation = .portrait }
    XCUIDevice.shared.orientation = .portrait
    app.launch()
    let orientations = journeyOrientations
    app.terminate()
    for orientation in orientations {
      // Each size starts without keyboard focus inherited from the preceding size.
      XCUIDevice.shared.orientation = orientation
      app.launch()
      let token = app.secureTextFields["native-e2e.pair.token"]
      if !token.exists {
        let otherWays = app.buttons["native-e2e.pair.manual"]
        XCTAssertTrue(otherWays.waitForExistence(timeout: 10)); otherWays.tap()
      }
      XCTAssertTrue(token.waitForExistence(timeout: 5))
      let submit = app.buttons["native-e2e.pair.submit"]
      XCTAssertTrue(submit.waitForExistence(timeout: 5)); submit.tap()
      let error = app.staticTexts["native-e2e.pair.error"].firstMatch
      XCTAssertTrue(error.waitForExistence(timeout: 5))
      XCTAssertTrue(error.isHittable, "Validation must remain visible in the scrolling form")
      XCTAssertGreaterThanOrEqual(error.frame.minY - token.frame.maxY, 16,
        "The error needs clear separation from the last input")
      XCTAssertFalse(submit.frame.insetBy(dx: -16, dy: -16).intersects(error.frame),
        "Connect needs clear separation from validation text")
      let proof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
      proof.name = orientation == .portrait ? "pairing-error-portrait" : "pairing-error-landscape"
      proof.lifetime = .keepAlways; add(proof)

      XCTAssertTrue(token.isHittable)
      token.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: 0.5)).tap()
      let fixtureToken = "fixture-token"
      token.typeText(fixtureToken)
      let maskedToken = try XCTUnwrap(token.value as? String)
      XCTAssertEqual(maskedToken.count, fixtureToken.count)
      XCTAssertNotEqual(maskedToken, fixtureToken)
      let keyboard = app.keyboards.firstMatch
      let clearOfKeyboard = NSPredicate { _, _ in
        let keyboardFrame = keyboard.exists ? keyboard.frame.intersection(self.app.frame) : .null
        return error.isHittable && submit.isHittable
          && error.frame.minY - token.frame.maxY >= 16
          && !submit.frame.insetBy(dx: -16, dy: -16).intersects(error.frame)
          && !submit.frame.intersects(keyboardFrame)
          && !error.frame.intersects(keyboardFrame)
      }
      let keyboardResult = XCTWaiter.wait(for: [XCTNSPredicateExpectation(
        predicate: clearOfKeyboard, object: app)], timeout: 5)
      let keyboardProof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
      keyboardProof.name = orientation == .portrait
        ? "pairing-error-keyboard-portrait" : "pairing-error-keyboard-landscape"
      keyboardProof.lifetime = .keepAlways; add(keyboardProof)
      let keyboardFrame = keyboard.exists ? keyboard.frame : .zero
      let geometry = XCTAttachment(string: "token: \(token.frame)\nerror: \(error.frame)\nPair: \(submit.frame)\nkeyboard: \(keyboardFrame)")
      geometry.name = "pairing-error-geometry"; geometry.lifetime = .keepAlways; add(geometry)
      XCTAssertEqual(keyboardResult, .completed)
      app.terminate()
    }
  }
}
