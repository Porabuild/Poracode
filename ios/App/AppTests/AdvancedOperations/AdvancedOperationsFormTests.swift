import Foundation
import XCTest

#if canImport(App)
  @testable import App
#else
  @testable import AdvancedOperations
#endif

final class AdvancedOperationsFormTests: XCTestCase {
  func testEveryFixtureRequestRoundTripsThroughTheFormAndLeaseOwner() throws {
    let fixtures = try AdvancedOperationFixtures.load()
    XCTAssertEqual(fixtures.cases.count, 17)
    for fixture in fixtures.cases {
      let expected = try AdvancedOperationFixtures.request(for: fixture)
      let draft = AdvancedDraftFactory.draft(for: expected)
      let rebuilt = try AdvancedOperationsRequestBuilder.request(draft, owner: expected.owner)
      XCTAssertEqual(rebuilt, expected, fixture.procedure.rawValue)
      // The rebuilt request must still satisfy the generated contract.
      XCTAssertEqual(
        try envelope(rebuilt),
        try envelope(expected),
        fixture.procedure.rawValue
      )
    }
  }

  private func envelope(_ request: AdvancedOperationRequest) throws -> AdvancedJSONValue {
    try JSONDecoder().decode(
      AdvancedJSONValue.self,
      from: AdvancedOperationsRemoteV3Contract.requestEnvelope(request)
    )
  }

  func testFormNeverCollectsOwnerBoundValues() {
    for procedure in AdvancedOperationProcedure.allCases {
      let keys = AdvancedOperationsForm.fields(for: procedure).map(\.key)
      XCTAssertEqual(Set(keys).count, keys.count, procedure.rawValue)
      XCTAssertFalse(keys.contains(where: { $0.rawValue.lowercased().contains("threadid") }))
      XCTAssertFalse(keys.contains(where: { $0.rawValue.lowercased().contains("location") }))
    }
  }

  func testLocationsAndUnicodeSurviveVerbatimForEveryLocationKind() throws {
    let locations: [ProjectLocation] = [
      .posix(path: "/srv/проекты/naïve 🚀/App"),
      .windows(path: #"C:\Users\Ünicode\Проект"#, remoteServerId: "remote-1"),
      .wsl(
        distro: "Ubuntu-24.04",
        linuxPath: "/home/пользователь/项目",
        uncPath: #"\\wsl.localhost\Ubuntu-24.04\home\пользователь\项目"#,
        remoteServerId: nil
      ),
    ]
    for location in locations {
      var draft = AdvancedOperationDraft(procedure: .readExternalFile)
      let absolutePath = "/tmp/外部/файл  .txt"
      draft.setValue(absolutePath, for: .absolutePath)
      let request = try AdvancedOperationsRequestBuilder.request(
        draft,
        owner: .projectLocation(location)
      )
      guard case .readExternalFile(let value) = request else {
        return XCTFail("Unexpected request case")
      }
      XCTAssertEqual(value.projectLocation, location)
      XCTAssertEqual(value.absolutePath, absolutePath)
      _ = try AdvancedOperationsRemoteV3Contract.requestEnvelope(request)
    }
  }

  func testIdentifiersAreSubmittedByteForByte() throws {
    var draft = AdvancedOperationDraft(procedure: .subagentSubscribe)
    let identifier = " item‑ünicode‑1 "
    draft.setValue(identifier, for: .parentItemId)
    let request = try AdvancedOperationsRequestBuilder.request(
      draft,
      owner: .thread(threadID: "thread-advanced", projectLocation: nil)
    )
    guard case .subagentSubscribe(let value) = request else {
      return XCTFail("Unexpected request case")
    }
    XCTAssertEqual(value.parentItemId, identifier)
    XCTAssertEqual(value.threadId, "thread-advanced")
  }

  func testBlankOptionalFieldsAreOmittedAndBlankRequiredFieldsFail() throws {
    var draft = AdvancedOperationDraft(procedure: .moveProjectEntry)
    draft.setValue("Sources/New.swift", for: .path)
    draft.setValue("   ", for: .nextParentPath)
    let request = try AdvancedOperationsRequestBuilder.request(
      draft,
      owner: .projectLocation(.posix(path: "/srv/advanced"))
    )
    guard case .moveProjectEntry(let value) = request else {
      return XCTFail("Unexpected request case")
    }
    XCTAssertNil(value.nextParentPath)

    var invalid = AdvancedOperationDraft(procedure: .moveProjectEntry)
    invalid.setValue(" \n", for: .path)
    XCTAssertThrowsError(
      try AdvancedOperationsRequestBuilder.request(
        invalid,
        owner: .projectLocation(.posix(path: "/srv/advanced"))
      )
    ) { error in
      XCTAssertEqual(error as? AdvancedFormValidationError, .missingRequiredField(.path))
    }
  }

  func testOptionalBooleanKeepsUnsetDistinctFromFalse() throws {
    var draft = AdvancedOperationDraft(procedure: .workflowGetRun)
    draft.setValue("/srv/advanced/workflow.json", for: .manifestPath)
    let owner = AdvancedOperationOwner.location(.posix(path: "/srv/advanced"), threadID: nil)

    XCTAssertEqual(draft.flag(.includeAgentChats), .unset)
    guard
      case .workflowGetRun(let unset) = try AdvancedOperationsRequestBuilder.request(
        draft, owner: owner)
    else { return XCTFail("Unexpected request case") }
    XCTAssertNil(unset.includeAgentChats)

    draft.setFlag(.off, for: .includeAgentChats)
    guard
      case .workflowGetRun(let disabled) = try AdvancedOperationsRequestBuilder.request(
        draft, owner: owner)
    else { return XCTFail("Unexpected request case") }
    XCTAssertEqual(disabled.includeAgentChats, false)
  }

  func testSegmentsStayOptionalAndPreserveEveryKind() throws {
    var draft = AdvancedOperationDraft(procedure: .stageThreadInput)
    draft.setValue("Review the selected context", for: .prompt)
    let owner = AdvancedOperationOwner.thread(threadID: "thread-advanced", projectLocation: nil)

    guard
      case .stageThreadInput(let omitted) = try AdvancedOperationsRequestBuilder.request(
        draft, owner: owner)
    else { return XCTFail("Unexpected request case") }
    XCTAssertNil(omitted.segments)

    draft.includesSegments = true
    guard
      case .stageThreadInput(let empty) = try AdvancedOperationsRequestBuilder.request(
        draft, owner: owner)
    else { return XCTFail("Unexpected request case") }
    XCTAssertEqual(empty.segments, [])

    let fixture = try AdvancedOperationFixtures.fixture(.stageThreadInput)
    let expected = try AdvancedOperationFixtures.request(for: fixture)
    guard case .stageThreadInput(let source) = expected, let segments = source.segments else {
      return XCTFail("Fixture is missing segments")
    }
    XCTAssertEqual(Set(segments.map(\.kind)).count, AdvancedSegmentKind.allCases.count)
    let rebuilt = try AdvancedOperationsRequestBuilder.request(
      AdvancedDraftFactory.draft(for: expected),
      owner: owner
    )
    XCTAssertEqual(rebuilt, expected)
  }

  func testSegmentValidationReportsTheOffendingIndex() {
    var draft = AdvancedOperationDraft(procedure: .stageThreadInput)
    draft.setValue("Prompt", for: .prompt)
    draft.addSegment(.text)
    draft.addSegment(.diffComment)
    draft.segments[0].content = "Context"
    draft.segments[1].path = "Sources/App.swift"
    draft.segments[1].body = "Check"
    draft.segments[1].lineNumber = "not-a-number"

    XCTAssertThrowsError(
      try AdvancedOperationsRequestBuilder.request(
        draft,
        owner: .thread(threadID: "thread-advanced", projectLocation: nil)
      )
    ) { error in
      XCTAssertEqual(error as? AdvancedFormValidationError, .missingSegmentField(index: 1))
    }
  }

  func testIntegerBoundsAreEnforced() {
    let owner = AdvancedOperationOwner.projectLocation(.posix(path: "/srv/advanced"))
    for (raw, expected) in [
      ("", AdvancedFormValidationError.missingRequiredField(.baseModifiedAtMs)),
      ("12.5", .invalidInteger(.baseModifiedAtMs)),
      ("nope", .invalidInteger(.baseModifiedAtMs)),
      ("-1", .integerOutOfBounds(.baseModifiedAtMs)),
      ("9007199254740992", .integerOutOfBounds(.baseModifiedAtMs)),
      ("99999999999999999999", .invalidInteger(.baseModifiedAtMs)),
    ] {
      var draft = AdvancedOperationDraft(procedure: .writeExternalFile)
      draft.setValue("/tmp/external.txt", for: .absolutePath)
      draft.setValue("Updated", for: .content)
      draft.setValue(raw, for: .baseModifiedAtMs)
      XCTAssertThrowsError(
        try AdvancedOperationsRequestBuilder.request(draft, owner: owner),
        raw
      ) { error in
        XCTAssertEqual(error as? AdvancedFormValidationError, expected, raw)
      }
    }

    var valid = AdvancedOperationDraft(procedure: .writeExternalFile)
    valid.setValue("/tmp/external.txt", for: .absolutePath)
    valid.setValue("Updated", for: .content)
    valid.setValue(String(AdvancedInputParsing.maximumExactInteger), for: .baseModifiedAtMs)
    XCTAssertNoThrow(try AdvancedOperationsRequestBuilder.request(valid, owner: owner))
  }

  func testOwnerShapeMismatchIsRejectedBeforeAnyRequestExists() {
    var draft = AdvancedOperationDraft(procedure: .createFileCheckpoint)
    draft.setValue("item-user-1", for: .checkpointItemId)

    XCTAssertThrowsError(
      try AdvancedOperationsRequestBuilder.request(
        draft,
        owner: .projectLocation(.posix(path: "/srv/advanced"))
      )
    ) { error in
      XCTAssertEqual(error as? AdvancedFormValidationError, .ownerMismatch)
    }
    XCTAssertThrowsError(
      try AdvancedOperationsRequestBuilder.request(
        draft,
        owner: .thread(threadID: "thread-advanced", projectLocation: nil)
      )
    ) { error in
      XCTAssertEqual(error as? AdvancedFormValidationError, .missingOwnerLocation)
    }

    var chat = AdvancedOperationDraft(procedure: .workflowAgentChat)
    chat.setValue("/srv/advanced/transcripts", for: .transcriptDir)
    chat.setValue("agent-1", for: .agentId)
    XCTAssertThrowsError(
      try AdvancedOperationsRequestBuilder.request(
        chat,
        owner: .location(.posix(path: "/srv/advanced"), threadID: nil)
      )
    ) { error in
      XCTAssertEqual(error as? AdvancedFormValidationError, .ownerMismatch)
    }
  }

  func testRequiredValueGateMatchesTheBuilder() throws {
    for procedure in AdvancedOperationProcedure.allCases {
      var draft = AdvancedOperationDraft(procedure: procedure)
      XCTAssertEqual(
        draft.hasRequiredValues,
        AdvancedOperationsForm.fields(for: procedure).allSatisfy { !$0.isRequired },
        procedure.rawValue
      )
      for field in AdvancedOperationsForm.fields(for: procedure) where field.isRequired {
        draft.setValue(field.kind == .milliseconds ? "1" : "value", for: field.key)
      }
      XCTAssertTrue(draft.hasRequiredValues, procedure.rawValue)
    }
  }
}
