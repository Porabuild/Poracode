import Foundation
import XCTest

#if canImport(App)
  @testable import App
#else
  @testable import AdvancedOperations
#endif

final class AdvancedOperationsContractTests: XCTestCase {
  func testFixtureCrossesAllSeventeenGeneratedRequestAndResultRoots() throws {
    let fixtures = try AdvancedOperationFixtures.load()
    XCTAssertEqual(fixtures.cases.count, 17)
    XCTAssertEqual(Set(fixtures.cases.map(\.procedure)), Set(AdvancedOperationProcedure.allCases))

    for fixture in fixtures.cases {
      let request = try AdvancedOperationFixtures.request(for: fixture)
      let envelopeData = try AdvancedOperationsRemoteV3Contract.requestEnvelope(request)
      let envelope = try decodeObject(envelopeData)
      XCTAssertEqual(envelope["procedure"], .string(fixture.procedure.rawValue))
      XCTAssertEqual(envelope["payload"], fixture.request, fixture.procedure.rawValue)

      let result = try AdvancedOperationsRemoteV3Contract.result(
        for: fixture.procedure,
        envelope: AdvancedOperationFixtures.responseData(for: fixture)
      )
      assertResult(result, matches: fixture.procedure)
    }
  }

  func testExistingCheckpointFixtureRemainsAcceptedByStableAdapter() throws {
    let data = try AdvancedOperationFixtures.checkpointData()
    let root = try decodeObject(data)
    let captures = try XCTUnwrap(array(root["captures"]))
    let turns = try XCTUnwrap(array(root["turns"]))
    let capture = try XCTUnwrap(captures.first?.objectValue)
    let turn = try XCTUnwrap(turns.first?.objectValue)

    let captureRequest = try decode(
      AdvancedCreateFileCheckpointRequest.self,
      try XCTUnwrap(capture["request"])
    )
    _ = try AdvancedOperationsRemoteV3Contract.requestEnvelope(
      .createFileCheckpoint(captureRequest)
    )
    _ = try AdvancedOperationsRemoteV3Contract.result(
      for: .createFileCheckpoint,
      envelope: resultEnvelope(try XCTUnwrap(capture["result"]))
    )

    let turnRequest = try decode(
      AdvancedFinalizeFileCheckpointRequest.self,
      try XCTUnwrap(turn["request"])
    )
    _ = try AdvancedOperationsRemoteV3Contract.requestEnvelope(
      .finalizeFileCheckpoint(turnRequest)
    )
    _ = try AdvancedOperationsRemoteV3Contract.result(
      for: .finalizeFileCheckpoint,
      envelope: resultEnvelope(try XCTUnwrap(turn["result"]))
    )
  }

  func testExistingVoidFixtureRequiresExactEmptyEnvelope() throws {
    let data = try AdvancedOperationFixtures.projectEnvelopeData()
    let root = try decodeObject(data)
    let accepted = try XCTUnwrap(array(root["accepted"]))
    let rejected = try XCTUnwrap(array(root["rejected"]))
    let acceptedValue = try XCTUnwrap(
      accepted.first(where: { $0.objectValue?["procedure"] == .string("createProjectEntry") })
    )
    let acceptedEntry = try XCTUnwrap(acceptedValue.objectValue)
    let rejectedEntry = try XCTUnwrap(rejected.first?.objectValue)

    XCTAssertEqual(
      try AdvancedOperationsRemoteV3Contract.result(
        for: .createProjectEntry,
        envelope: try JSONEncoder().encode(acceptedEntry["envelope"])
      ),
      .omitted
    )
    XCTAssertThrowsError(
      try AdvancedOperationsRemoteV3Contract.result(
        for: .createProjectEntry,
        envelope: try JSONEncoder().encode(rejectedEntry["envelope"])
      )
    )
  }

  func testGeneratedRootsRejectInvalidRequestAndResultBeforeProjection() throws {
    let invalidRequest = AdvancedSubagentSubscriptionRequest(
      threadId: "",
      parentItemId: "parent"
    )
    XCTAssertThrowsError(
      try AdvancedOperationsRemoteV3Contract.requestEnvelope(
        .subagentSubscribe(invalidRequest)
      )
    )

    XCTAssertThrowsError(
      try AdvancedOperationsRemoteV3Contract.result(
        for: .readAbsoluteFile,
        envelope: Data(#"{"result":{"status":"future"}}"#.utf8)
      )
    )
  }

  private func assertResult(
    _ result: AdvancedOperationResult,
    matches procedure: AdvancedOperationProcedure
  ) {
    switch (procedure, result) {
    case (.createFileCheckpoint, .createFileCheckpoint),
      (.finalizeFileCheckpoint, .finalizeFileCheckpoint),
      (.subagentSubscribe, .subagentSubscribe),
      (.workflowGetRun, .workflowGetRun),
      (.workflowAgentChat, .workflowAgentChat),
      (.readAbsoluteFile, .readAbsoluteFile),
      (.readExternalFile, .readExternalFile),
      (.writeExternalFile, .writeExternalFile),
      (.generateCommitMessage, .generatedCommitMessage),
      (.generateTitle, .generatedTitle),
      (.generatePrSummary, .generatedPrSummary),
      (.subagentUnsubscribe, .omitted),
      (.stageThreadInput, .omitted),
      (.createProjectEntry, .omitted),
      (.renameProjectEntry, .omitted),
      (.moveProjectEntry, .omitted),
      (.deleteProjectEntry, .omitted):
      break
    default:
      XCTFail("Unexpected stable result projection for \(procedure.rawValue)")
    }
  }

  private func decodeObject(_ data: Data) throws -> [String: AdvancedJSONValue] {
    try XCTUnwrap(JSONDecoder().decode(AdvancedJSONValue.self, from: data).objectValue)
  }

  private func decode<Value: Decodable>(
    _ type: Value.Type,
    _ value: AdvancedJSONValue
  ) throws -> Value {
    try JSONDecoder().decode(type, from: JSONEncoder().encode(value))
  }

  private func resultEnvelope(_ value: AdvancedJSONValue) throws -> Data {
    try JSONEncoder().encode(AdvancedJSONValue.object(["result": value]))
  }

  private func array(_ value: AdvancedJSONValue?) -> [AdvancedJSONValue]? {
    guard case .array(let values)? = value else { return nil }
    return values
  }
}
