import Foundation
import XCTest

#if canImport(App)
  @testable import App
#else
  @testable import AdvancedOperations
#endif

final class AdvancedOperationsQualityGatesTests: XCTestCase {
  func testMetadataMatchesAuthoritativeManifestForExactlySeventeenProcedures() throws {
    XCTAssertEqual(AdvancedOperationProcedure.allCases.count, 17)
    let long = Set(
      AdvancedOperationProcedure.allCases.filter { $0.metadata.timeout == .long }
    )
    XCTAssertEqual(long, [.generateCommitMessage, .generateTitle, .generatePrSummary])

    let expected:
      [AdvancedOperationProcedure: (
        AdvancedOperationScope,
        AdvancedOperationOwnerKind,
        AdvancedOperationResultKind
      )] = [
        .createFileCheckpoint: (.sessionOperate, .thread, .json),
        .finalizeFileCheckpoint: (.sessionOperate, .thread, .json),
        .subagentSubscribe: (.sessionRead, .thread, .json),
        .subagentUnsubscribe: (.sessionRead, .thread, .omitted),
        .stageThreadInput: (.sessionOperate, .thread, .omitted),
        .workflowGetRun: (.sessionRead, .location, .json),
        .workflowAgentChat: (.sessionRead, .location, .json),
        .readAbsoluteFile: (.projectsManage, .projectLocation, .json),
        .readExternalFile: (.projectsManage, .projectLocation, .json),
        .writeExternalFile: (.projectsManage, .projectLocation, .json),
        .createProjectEntry: (.sessionOperate, .projectLocation, .omitted),
        .renameProjectEntry: (.sessionOperate, .projectLocation, .omitted),
        .moveProjectEntry: (.sessionOperate, .projectLocation, .omitted),
        .deleteProjectEntry: (.sessionOperate, .projectLocation, .omitted),
        .generateCommitMessage: (.sessionOperate, .projectLocation, .json),
        .generateTitle: (.sessionOperate, .projectLocation, .json),
        .generatePrSummary: (.sessionOperate, .projectLocation, .json),
      ]

    for procedure in AdvancedOperationProcedure.allCases {
      let value = try XCTUnwrap(expected[procedure])
      XCTAssertEqual(procedure.metadata.scope, value.0, procedure.rawValue)
      XCTAssertEqual(procedure.metadata.owner, value.1, procedure.rawValue)
      XCTAssertEqual(procedure.metadata.resultKind, value.2, procedure.rawValue)
      _ = try AdvancedOperationsRemoteV3Contract.metadata(for: procedure)
    }
  }

  func testEverySingleAttemptProcedureIsExplicitAndReadsRemainRetryNeutral() {
    let readOnly = Set(
      AdvancedOperationProcedure.allCases.filter { $0.metadata.delivery == .readOnly }
    )
    XCTAssertEqual(
      readOnly,
      [.workflowGetRun, .workflowAgentChat, .readAbsoluteFile, .readExternalFile]
    )
    XCTAssertEqual(
      AdvancedOperationProcedure.allCases.filter {
        $0.metadata.delivery == .singleAttempt
      }.count,
      13
    )
  }

  func testProductionFilesStayIsolatedSmallAndFreeOfGeneratedHashNamesOrLogging() throws {
    let files = try productionFiles()
    XCTAssertFalse(files.isEmpty)
    let hashPattern = try NSRegularExpression(pattern: "_[0-9a-f]{10}(?:[^0-9a-f]|$)")
    let forbidden = ["print(", "Logger(", "os_log", "accessToken", "Authorization"]

    for file in files {
      let source = try String(contentsOf: file, encoding: .utf8)
      XCTAssertLessThan(source.split(separator: "\n", omittingEmptySubsequences: false).count, 500)
      XCTAssertNil(
        hashPattern.firstMatch(
          in: source,
          range: NSRange(source.startIndex..., in: source)
        ),
        file.lastPathComponent
      )
      for token in forbidden {
        XCTAssertFalse(source.contains(token), "\(file.lastPathComponent) contains \(token)")
      }
    }
  }

  private func productionFiles() throws -> [URL] {
    let app = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("App")
    let roots = [
      app.appendingPathComponent("Features/AdvancedOperations"),
      app.appendingPathComponent("Transport/AdvancedOperations"),
    ]
    return try roots.flatMap { root in
      try FileManager.default.contentsOfDirectory(
        at: root,
        includingPropertiesForKeys: nil
      ).filter { $0.pathExtension == "swift" }
    }
  }
}
