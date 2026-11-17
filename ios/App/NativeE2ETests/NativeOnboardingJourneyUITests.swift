import XCTest

extension NativeFamilyJourneyUITests {
  func testPairingValidationHasSpaceAfterInputsAndBeforeTheAction() throws {
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
      XCTAssertGreaterThanOrEqual(submit.frame.minY - error.frame.maxY, 16,
        "The floating action must not cover or touch validation text")
      let proof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
      proof.name = orientation == .portrait ? "pairing-error-portrait" : "pairing-error-landscape"
      proof.lifetime = .keepAlways; add(proof)

      token.tap()
      let keyboard = app.keyboards.firstMatch
      XCTAssertTrue(keyboard.waitForExistence(timeout: 5))
      let clearOfKeyboard = NSPredicate { _, _ in
        error.isHittable && submit.isHittable
          && error.frame.minY - token.frame.maxY >= 16
          && submit.frame.minY - error.frame.maxY >= 16
          && submit.frame.maxY <= keyboard.frame.minY
      }
      let keyboardResult = XCTWaiter.wait(for: [XCTNSPredicateExpectation(
        predicate: clearOfKeyboard, object: app)], timeout: 5)
      let keyboardProof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
      keyboardProof.name = orientation == .portrait
        ? "pairing-error-keyboard-portrait" : "pairing-error-keyboard-landscape"
      keyboardProof.lifetime = .keepAlways; add(keyboardProof)
      let geometry = XCTAttachment(string: "token: \(token.frame)\nerror: \(error.frame)\nPair: \(submit.frame)\nkeyboard: \(keyboard.frame)")
      geometry.name = "pairing-error-geometry"; geometry.lifetime = .keepAlways; add(geometry)
      XCTAssertEqual(keyboardResult, .completed)
      app.terminate()
    }
  }
}
