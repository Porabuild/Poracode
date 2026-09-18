import Foundation
import XCTest

#if canImport(App)
  @testable import App
#else
  @testable import AdvancedOperations
#endif

final class AdvancedOperationsPresentationTests: XCTestCase {
  func testEveryProcedureIsReachableExactlyOnce() {
    let descriptors = AdvancedOperationsPresentation.descriptors
    XCTAssertEqual(descriptors.count, 17)
    XCTAssertEqual(
      Set(descriptors.map(\.procedure)),
      Set(AdvancedOperationProcedure.allCases)
    )
    let categorized = AdvancedOperationCategory.allCases.flatMap {
      AdvancedOperationsPresentation.descriptors(in: $0)
    }
    XCTAssertEqual(categorized.count, 17)
    XCTAssertEqual(Set(categorized.map(\.procedure)).count, 17)
    XCTAssertEqual(Set(descriptors.map(\.accessibilityIdentifier)).count, 17)
  }

  func testDescriptorCarriesGeneratedScopeOwnerAndDeliveryForAllSeventeen() throws {
    let fixtures = try AdvancedOperationFixtures.load()
    XCTAssertEqual(fixtures.cases.count, 17)
    for fixture in fixtures.cases {
      let request = try AdvancedOperationFixtures.request(for: fixture)
      let descriptor = AdvancedOperationsPresentation.descriptor(for: fixture.procedure)
      let metadata = try AdvancedOperationsRemoteV3Contract.metadata(for: fixture.procedure)
      XCTAssertEqual(descriptor.procedure, fixture.procedure)
      XCTAssertEqual(descriptor.scope, metadata.scope, fixture.procedure.rawValue)
      XCTAssertEqual(descriptor.ownerKind, metadata.owner, fixture.procedure.rawValue)
      XCTAssertEqual(request.owner.kind, metadata.owner, fixture.procedure.rawValue)
      XCTAssertEqual(
        descriptor.isRead,
        metadata.delivery == .readOnly,
        fixture.procedure.rawValue
      )
    }
  }

  func testCategoryAssignmentIsStableAndComplete() {
    let expected: [AdvancedOperationCategory: Set<AdvancedOperationProcedure>] = [
      .threads: [
        .createFileCheckpoint, .finalizeFileCheckpoint, .subagentSubscribe,
        .subagentUnsubscribe, .stageThreadInput,
      ],
      .workflows: [.workflowGetRun, .workflowAgentChat],
      .files: [.readAbsoluteFile, .readExternalFile, .writeExternalFile],
      .projectEntries: [
        .createProjectEntry, .renameProjectEntry, .moveProjectEntry, .deleteProjectEntry,
      ],
      .generation: [.generateCommitMessage, .generateTitle, .generatePrSummary],
    ]
    for category in AdvancedOperationCategory.allCases {
      XCTAssertEqual(
        Set(AdvancedOperationsPresentation.descriptors(in: category).map(\.procedure)),
        expected[category],
        category.rawValue
      )
    }
  }

  func testOverwriteCapableAndDestructiveProceduresRequireConfirmation() {
    XCTAssertEqual(
      AdvancedOperationsPresentation.confirmingProcedures,
      [.writeExternalFile, .renameProjectEntry, .moveProjectEntry, .deleteProjectEntry]
    )
    for descriptor in AdvancedOperationsPresentation.descriptors {
      XCTAssertEqual(
        descriptor.requiresConfirmation,
        AdvancedOperationsPresentation.confirmingProcedures.contains(descriptor.procedure),
        descriptor.procedure.rawValue
      )
      // Read-only procedures must never demand a confirmation step.
      if descriptor.isRead { XCTAssertFalse(descriptor.requiresConfirmation) }
    }
    XCTAssertEqual(
      AdvancedOperationsPresentation.descriptors.filter { $0.role == .destructive }.map(
        \.procedure),
      [.deleteProjectEntry]
    )
  }

  func testGatingRequiresUsableAccessMatchingScopeAndOwnerKind() {
    let descriptor = AdvancedOperationsPresentation.descriptor(for: .deleteProjectEntry)
    let owner = AdvancedOperationOwner.projectLocation(.posix(path: "/srv/advanced"))
    let lease = AdvancedOperationFixtures.lease(owner: owner)

    XCTAssertTrue(
      AdvancedOperationGating.permits(
        descriptor,
        access: access(lease, scopes: [.sessionOperate])
      )
    )
    XCTAssertFalse(
      AdvancedOperationGating.permits(descriptor, access: access(lease, scopes: [.sessionRead]))
    )
    XCTAssertFalse(
      AdvancedOperationGating.permits(
        descriptor,
        access: access(lease, scopes: [.sessionOperate], isOnline: false)
      )
    )
    XCTAssertFalse(
      AdvancedOperationGating.permits(
        descriptor,
        access: access(lease, scopes: [.sessionOperate], isForeground: false)
      )
    )
    XCTAssertFalse(
      AdvancedOperationGating.permits(
        descriptor,
        access: access(
          AdvancedOperationFixtures.lease(
            owner: .thread(threadID: "thread-advanced", projectLocation: nil)
          ),
          scopes: [.sessionOperate]
        )
      )
    )
    XCTAssertFalse(AdvancedOperationGating.permits(descriptor, access: nil))
  }

  func testLayoutAdaptsByWidth() {
    XCTAssertEqual(AdvancedOperationsLayout(width: 390), .compact)
    XCTAssertEqual(AdvancedOperationsLayout(width: 699), .compact)
    XCTAssertEqual(AdvancedOperationsLayout(width: 700), .regular)
    XCTAssertEqual(AdvancedOperationsLayout(width: 1024), .regular)
    XCTAssertFalse(AdvancedOperationsLayout.compact.showsSideBySideOutcome)
    XCTAssertTrue(AdvancedOperationsLayout.regular.showsSideBySideOutcome)
    XCTAssertLessThan(
      AdvancedOperationsLayout.compact.columnMinimum,
      AdvancedOperationsLayout.regular.columnMinimum
    )
  }

  func testActivationIdentityMovesWithEveryOwnerShape() async {
    await MainActor.run {
      let harness = AdvancedOperationsHarness()
      let base = AdvancedOperationsActivationID(harness.composition)
      harness.threadLocation = .posix(path: "/srv/other")
      XCTAssertNotEqual(base, AdvancedOperationsActivationID(harness.composition))

      let moved = AdvancedOperationsActivationID(harness.composition)
      harness.threadID = "thread-next"
      XCTAssertNotEqual(moved, AdvancedOperationsActivationID(harness.composition))

      let renamed = AdvancedOperationsActivationID(harness.composition)
      harness.sessionGeneration &+= 1
      XCTAssertNotEqual(renamed, AdvancedOperationsActivationID(harness.composition))

      let regenerated = AdvancedOperationsActivationID(harness.composition)
      harness.isForeground = false
      XCTAssertNotEqual(regenerated, AdvancedOperationsActivationID(harness.composition))

      let backgrounded = AdvancedOperationsActivationID(harness.composition)
      harness.scopes = [.sessionRead]
      XCTAssertNotEqual(backgrounded, AdvancedOperationsActivationID(harness.composition))
    }
  }

  private func access(
    _ lease: AdvancedOperationLease,
    scopes: Set<AdvancedOperationScope>,
    isOnline: Bool = true,
    isForeground: Bool = true
  ) -> AdvancedOperationSessionAccess {
    AdvancedOperationSessionAccess(
      lease: lease,
      isOnline: isOnline,
      isReady: true,
      isForeground: isForeground,
      scopes: scopes
    )
  }
}
