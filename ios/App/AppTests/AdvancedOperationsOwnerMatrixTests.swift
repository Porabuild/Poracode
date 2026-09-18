import Foundation
import XCTest

@testable import App

/// The owner matrix is the whole safety story for Advanced Operations: a
/// procedure that is handed the wrong owner shape can act on the wrong thread,
/// the wrong project, or a project the user never selected. Every one of the
/// seventeen procedures is pinned here against every combination of derivable
/// owner components.
final class AdvancedOperationsOwnerMatrixTests: XCTestCase {
  private let location = ProjectLocation.posix(path: "/workspace")
  private let threadID = "thread-1"

  private var full: AdvancedOperationsOwnerKey {
    AdvancedOperationsOwnerKey(projectLocation: location, threadID: threadID)
  }
  private var threadOnly: AdvancedOperationsOwnerKey {
    AdvancedOperationsOwnerKey(projectLocation: nil, threadID: threadID)
  }
  private var locationOnly: AdvancedOperationsOwnerKey {
    AdvancedOperationsOwnerKey(projectLocation: location, threadID: nil)
  }

  func testEverySeventeenProceduresOwnerIsExactUnderFullContext() {
    XCTAssertEqual(AdvancedOperationProcedure.allCases.count, 17)
    for procedure in AdvancedOperationProcedure.allCases {
      let owner = AdvancedOperationsSelectionSource.owner(for: procedure, key: full)
      XCTAssertEqual(owner, expectedOwner(procedure), procedure.rawValue)
      XCTAssertEqual(owner?.kind, procedure.metadata.owner, procedure.rawValue)
    }
  }

  func testCheckpointProceduresRequireBothThreadAndProjectLocation() {
    for procedure in [
      AdvancedOperationProcedure.createFileCheckpoint, .finalizeFileCheckpoint,
    ] {
      XCTAssertEqual(
        AdvancedOperationsSelectionSource.owner(for: procedure, key: full),
        .thread(threadID: threadID, projectLocation: location),
        procedure.rawValue
      )
      XCTAssertNil(
        AdvancedOperationsSelectionSource.owner(for: procedure, key: threadOnly),
        "\(procedure.rawValue) must not fabricate a project location"
      )
      XCTAssertNil(
        AdvancedOperationsSelectionSource.owner(for: procedure, key: locationOnly),
        procedure.rawValue
      )
    }
  }

  func testThreadOnlyProceduresNeverCarryAProjectLocation() {
    for procedure in [
      AdvancedOperationProcedure.subagentSubscribe, .subagentUnsubscribe, .stageThreadInput,
    ] {
      XCTAssertEqual(
        AdvancedOperationsSelectionSource.owner(for: procedure, key: full),
        .thread(threadID: threadID, projectLocation: nil),
        procedure.rawValue
      )
      XCTAssertEqual(
        AdvancedOperationsSelectionSource.owner(for: procedure, key: threadOnly),
        .thread(threadID: threadID, projectLocation: nil),
        procedure.rawValue
      )
      XCTAssertNil(
        AdvancedOperationsSelectionSource.owner(for: procedure, key: locationOnly),
        procedure.rawValue
      )
    }
  }

  func testWorkflowGetRunIsLocationOnlyAndWorkflowAgentChatNeedsBoth() {
    XCTAssertEqual(
      AdvancedOperationsSelectionSource.owner(for: .workflowGetRun, key: full),
      .location(location, threadID: nil)
    )
    XCTAssertEqual(
      AdvancedOperationsSelectionSource.owner(for: .workflowGetRun, key: locationOnly),
      .location(location, threadID: nil)
    )
    XCTAssertNil(
      AdvancedOperationsSelectionSource.owner(for: .workflowGetRun, key: threadOnly)
    )

    XCTAssertEqual(
      AdvancedOperationsSelectionSource.owner(for: .workflowAgentChat, key: full),
      .location(location, threadID: threadID)
    )
    XCTAssertNil(
      AdvancedOperationsSelectionSource.owner(for: .workflowAgentChat, key: locationOnly)
    )
    XCTAssertNil(
      AdvancedOperationsSelectionSource.owner(for: .workflowAgentChat, key: threadOnly)
    )
  }

  func testProjectLocationProceduresIgnoreThreadAndRequireLocation() {
    for procedure in Self.projectLocationProcedures {
      XCTAssertEqual(
        AdvancedOperationsSelectionSource.owner(for: procedure, key: full),
        .projectLocation(location),
        procedure.rawValue
      )
      XCTAssertEqual(
        AdvancedOperationsSelectionSource.owner(for: procedure, key: locationOnly),
        .projectLocation(location),
        procedure.rawValue
      )
      XCTAssertNil(
        AdvancedOperationsSelectionSource.owner(for: procedure, key: threadOnly),
        procedure.rawValue
      )
    }
  }

  func testNoProcedureProducesAnOwnerWithoutAnyDerivedComponent() {
    for procedure in AdvancedOperationProcedure.allCases {
      XCTAssertNil(
        AdvancedOperationsSelectionSource.owner(for: procedure, key: .none),
        procedure.rawValue
      )
    }
  }

  func testOwnerShapesAreNotInterchangeableAcrossProcedures() {
    // A thread owner minted for a thread-only procedure must never satisfy a
    // checkpoint procedure, and vice versa.
    let checkpointOwner = AdvancedOperationsSelectionSource.owner(
      for: .createFileCheckpoint, key: full
    )
    let subscribeOwner = AdvancedOperationsSelectionSource.owner(
      for: .subagentSubscribe, key: full
    )
    XCTAssertNotEqual(checkpointOwner, subscribeOwner)

    let getRunOwner = AdvancedOperationsSelectionSource.owner(for: .workflowGetRun, key: full)
    let agentChatOwner = AdvancedOperationsSelectionSource.owner(
      for: .workflowAgentChat, key: full
    )
    XCTAssertNotEqual(getRunOwner, agentChatOwner)
    XCTAssertNotEqual(
      getRunOwner,
      AdvancedOperationsSelectionSource.owner(for: .readAbsoluteFile, key: full)
    )
  }

  /// The matrix is only meaningful if it agrees with the owner the wire request
  /// actually carries. Each fixture request is decoded and its own reported
  /// owner shape is compared with what the matrix would mint for it.
  func testMatrixAgreesWithTheOwnerCarriedByEveryFixtureRequest() throws {
    let fixtures = try AdvancedOperationFixtures.load()
    XCTAssertEqual(fixtures.cases.count, 17)
    for fixture in fixtures.cases {
      let request = try AdvancedOperationFixtures.request(for: fixture)
      let minted = try XCTUnwrap(
        AdvancedOperationsSelectionSource.owner(
          for: fixture.procedure,
          key: AdvancedOperationsOwnerKey(
            projectLocation: request.owner.location,
            threadID: request.owner.threadID
          )
        ),
        fixture.procedure.rawValue
      )
      XCTAssertEqual(minted, request.owner, fixture.procedure.rawValue)
      XCTAssertEqual(minted.kind, fixture.procedure.metadata.owner, fixture.procedure.rawValue)
    }
  }

  func testRequestBuilderRefusesEveryForeignOwnerKind() {
    for procedure in AdvancedOperationProcedure.allCases {
      for candidate in Self.allOwnerShapes(location: location, threadID: threadID)
      where candidate.kind != procedure.metadata.owner {
        XCTAssertThrowsError(
          try AdvancedOperationsRequestBuilder.request(
            AdvancedOperationDraft(procedure: procedure),
            owner: candidate
          ),
          "\(procedure.rawValue) accepted a foreign owner kind"
        ) { error in
          XCTAssertEqual(
            error as? AdvancedFormValidationError,
            .ownerMismatch,
            procedure.rawValue
          )
        }
      }
    }
  }

  private static let projectLocationProcedures: [AdvancedOperationProcedure] = [
    .readAbsoluteFile, .readExternalFile, .writeExternalFile, .createProjectEntry,
    .renameProjectEntry, .moveProjectEntry, .deleteProjectEntry, .generateCommitMessage,
    .generateTitle, .generatePrSummary,
  ]

  private static func allOwnerShapes(
    location: ProjectLocation,
    threadID: String
  ) -> [AdvancedOperationOwner] {
    [
      .thread(threadID: threadID, projectLocation: location),
      .thread(threadID: threadID, projectLocation: nil),
      .location(location, threadID: nil),
      .location(location, threadID: threadID),
      .projectLocation(location),
    ]
  }

  private func expectedOwner(
    _ procedure: AdvancedOperationProcedure
  ) -> AdvancedOperationOwner {
    switch procedure {
    case .createFileCheckpoint, .finalizeFileCheckpoint:
      .thread(threadID: threadID, projectLocation: location)
    case .subagentSubscribe, .subagentUnsubscribe, .stageThreadInput:
      .thread(threadID: threadID, projectLocation: nil)
    case .workflowGetRun:
      .location(location, threadID: nil)
    case .workflowAgentChat:
      .location(location, threadID: threadID)
    default:
      .projectLocation(location)
    }
  }
}
