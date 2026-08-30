import XCTest

#if canImport(App)
  @testable import App
#elseif canImport(RichChatDomain)
  @testable import RichChatDomain
#endif

final class RichChatSteerMediaFixtureTests: XCTestCase {
  func testPendingSteerSetClearAndBroadcastMatrix() throws {
    let fixture = try loadRichChatFixture("thread-pending-steer-envelope.json")
    let input = try RichPendingSteerDecoder.decodeSetBody(try XCTUnwrap(fixture["setBody"]))
    XCTAssertEqual(input.prompt, "Please include the attachment.")
    XCTAssertEqual(input.config["model"], .string("gpt-5"))
    guard case .attachment(let path, let mime)? = input.segments?[safe: 1] else {
      return XCTFail("Expected attachment segment")
    }
    XCTAssertEqual(path, "/tmp/fixture.txt")
    XCTAssertEqual(mime, "text/plain")
    guard case .thread(let threadID, let title)? = input.segments?[safe: 2] else {
      return XCTFail("Expected thread segment")
    }
    XCTAssertEqual(threadID, "thread-related")
    XCTAssertEqual(title, "Related investigation")
    XCTAssertTrue(
      RichPendingSteerDecoder.isValidClearBody(
        try XCTUnwrap(fixture["clearBody"])
      ))

    let envelopes = try richFixtureArray(try XCTUnwrap(fixture["broadcasts"]))
      .map(RichPendingSteerDecoder.decodeEnvelope)
    XCTAssertEqual(envelopes.count, 2)
    XCTAssertEqual(envelopes[0].threadID, "thread-rich")
    XCTAssertEqual(envelopes[0].pending?.id, "steer-rich-1")
    XCTAssertEqual(envelopes[0].pending?.stagedAtMilliseconds, 1_786_557_600_000)
    XCTAssertNil(envelopes[1].pending)

    var state = RichPendingSteerState(threadID: "thread-rich")
    state.apply(envelopes[0])
    XCTAssertEqual(state.pending?.id, "steer-rich-1")
    state.apply(envelopes[1])
    XCTAssertNil(state.pending)
  }

  func testImageMarkerAndUnsafeDisplayPolicyMatrices() throws {
    let fixture = try loadRichChatFixture("rich-image-markers.json")
    let valid = try richFixtureObject(try XCTUnwrap(fixture["valid"]))
    let reference = try XCTUnwrap(
      RichImagePolicy.decodeRemoteReference(valid["nestedRef"])
    )
    XCTAssertEqual(reference.threadID, "thread-rich")
    XCTAssertEqual(reference.itemID, "image-rich")
    XCTAssertEqual(
      reference.path,
      [
        .key("result"), .key("content"), .index(1), .key("data"),
      ])
    XCTAssertEqual(reference.mimeType, "image/webp")
    XCTAssertEqual(reference.bytes, 4_096)
    XCTAssertEqual(RichImagePolicy.decodeOmitted(valid["omitted"]), .init(bytes: 8_388_608))

    for entry in try richFixtureArray(try XCTUnwrap(fixture["invalidRefs"])) {
      let object = try richFixtureObject(entry)
      let id = try XCTUnwrap(object["id"]?.stringValue)
      XCTAssertNil(RichImagePolicy.decodeRemoteReference(object["value"]), id)
    }
    for entry in try richFixtureArray(try XCTUnwrap(fixture["sharedDisplayPolicyCases"])) {
      let object = try richFixtureObject(entry)
      let id = try XCTUnwrap(object["id"]?.stringValue)
      let source = try XCTUnwrap(object["source"]?.stringValue)
      XCTAssertNil(RichImagePolicy.classify(source), id)
    }

    let blocks = try loadRichChatFixture("rich-content-blocks.json")
    let imageEntry = try richFixtureArray(try XCTUnwrap(blocks["accepted"]))[5]
    let image = try RichContentDecoder.decodeBlock(
      try XCTUnwrap(try richFixtureObject(imageEntry)["block"])
    )
    XCTAssertTrue(RichImagePolicy.isSafe(image))
  }

  func testAttachmentBoundaryMatrixUsesUTF16NameUnits() throws {
    let fixture = try loadRichChatFixture("attachment-boundaries.json")
    let limits = try richFixtureObject(try XCTUnwrap(fixture["limits"]))
    XCTAssertEqual(limits["maxBytes"]?.exactInt64Value, RichAttachmentPolicy.maximumBytes)
    XCTAssertEqual(
      limits["maxNameCharacters"]?.exactInt64Value,
      Int64(RichAttachmentPolicy.maximumNameUTF16Units)
    )

    for entry in try richFixtureArray(try XCTUnwrap(fixture["cases"])) {
      let object = try richFixtureObject(entry)
      let id = try XCTUnwrap(object["id"]?.stringValue)
      let bytes = try XCTUnwrap(object["bytes"]?.exactInt64Value)
      let nameLength = try XCTUnwrap(object["nameLength"]?.exactInt64Value)
      let expected = try richFixtureObject(try XCTUnwrap(object["expected"]))
      let decision = RichAttachmentPolicy.evaluate(
        name: String(repeating: "a", count: Int(nameLength)),
        byteCount: bytes
      )
      XCTAssertEqual(decision.queryValid, expected["queryValid"]?.boolValue, id)
      XCTAssertEqual(decision.bodyWithinLimit, expected["bodyWithinLimit"]?.boolValue, id)
      XCTAssertEqual(decision.accepted, expected["accepted"]?.boolValue, id)
      XCTAssertEqual(decision.error?.rawValue, expected["error"]?.stringValue, id)
    }

    XCTAssertEqual("😀".utf16.count, 2)
    XCTAssertFalse(
      RichAttachmentPolicy.evaluate(
        name: String(repeating: "😀", count: 128), byteCount: 1
      ).queryValid)
  }
}

extension Array {
  fileprivate subscript(safe index: Index) -> Element? {
    indices.contains(index) ? self[index] : nil
  }
}
