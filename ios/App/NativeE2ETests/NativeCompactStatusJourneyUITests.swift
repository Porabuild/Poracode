import XCTest

extension NativeFamilyJourneyUITests {
  func assertCompactStatusGeometry() {
    let elapsed = app.descendants(matching: .any).matching(identifier: "native-e2e.turn-elapsed").firstMatch
    XCTAssertTrue(app.buttons["native-e2e.info-control.delegated-agents:workflow"].firstMatch.waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["native-e2e.info-control.background-tasks"].firstMatch.waitForExistence(timeout: 5))
    let buttons = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "native-e2e.info-control.")).allElementsBoundByIndex
    XCTAssertTrue(elapsed.exists)
    let measured = ([elapsed] + buttons).map { (identifier: $0.identifier, frame: $0.frame) }
    let frames = measured.map { element in
      ["id": element.identifier, "x": element.frame.minX, "y": element.frame.minY,
        "width": element.frame.width, "height": element.frame.height] as [String: Any]
    }
    if let data = try? JSONSerialization.data(withJSONObject: frames, options: [.prettyPrinted]) {
      let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
      attachment.name = "compact-status-scroll-control-frames"; attachment.lifetime = .keepAlways; add(attachment)
    }
    workflowProof("compact-status-long-content-accessibility")
    for left in measured.indices {
      for right in measured.indices where right > left {
        let intersection = measured[left].frame.intersection(measured[right].frame)
        XCTAssertTrue(intersection.isNull || intersection.width <= 1 || intersection.height <= 1,
          "Status values must not overlap: \(measured[left].identifier), \(measured[right].identifier)")
      }
    }
    for button in measured.dropFirst() {
      XCTAssertEqual(measured[0].frame.midY, button.frame.midY, accuracy: 4,
        "The live timer must align vertically with adjacent status controls.")
    }
  }
}
