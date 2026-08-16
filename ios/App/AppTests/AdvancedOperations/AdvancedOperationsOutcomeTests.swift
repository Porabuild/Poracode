import Foundation
import XCTest

#if canImport(App)
  @testable import App
#else
  @testable import AdvancedOperations
#endif

final class AdvancedOperationsOutcomeTests: XCTestCase {
  func testEveryFixtureResponseProjectsWithoutRawPayloadLeakage() throws {
    let fixtures = try AdvancedOperationFixtures.load()
    for fixture in fixtures.cases {
      let result = try AdvancedOperationsRemoteV3Contract.result(
        for: fixture.procedure,
        envelope: AdvancedOperationFixtures.responseData(for: fixture)
      )
      let outcome = AdvancedOperationOutcomeProjection.outcome(
        result,
        procedure: fixture.procedure
      )
      XCTAssertEqual(outcome.procedure, fixture.procedure)
      XCTAssertEqual(
        outcome.isAcknowledgement,
        fixture.procedure.metadata.resultKind == .omitted,
        fixture.procedure.rawValue
      )
      XCTAssertEqual(Set(outcome.rows.map(\.id)).count, outcome.rows.count)
      for row in outcome.rows {
        XCTAssertFalse(row.label.isEmpty, fixture.procedure.rawValue)
        XCTAssertLessThanOrEqual(
          row.value.count,
          AdvancedOperationRedaction.maximumPreviewLength
            + AdvancedOperationRedaction.maximumPathLength,
          "\(fixture.procedure.rawValue)/\(row.id)"
        )
        XCTAssertFalse(row.accessibilityLabel.isEmpty)
        XCTAssertTrue(row.accessibilityLabel.hasPrefix(row.label))
      }
    }
  }

  func testWorkflowProjectionOmitsAgentPromptAndResultPreviews() {
    let agent = AdvancedWorkflowAgent(
      agentId: "agent-1",
      label: "reviewer",
      attempt: nil,
      chat: [
        AdvancedWorkflowChatEntry(
          role: .assistant,
          text: "SECRET-CHAT-BODY",
          timestamp: nil,
          title: nil
        )
      ],
      durationMs: nil,
      lastProgressAt: nil,
      lastToolName: "SECRET-TOOL",
      model: nil,
      phaseIndex: nil,
      phaseTitle: nil,
      promptPreview: "SECRET-PROMPT",
      queuedAt: nil,
      resultPreview: "SECRET-RESULT",
      startedAt: nil,
      state: .done,
      tokens: nil,
      toolCalls: nil
    )
    let run = AdvancedWorkflowRun(
      runId: "run-1",
      status: .completed,
      agentCount: 1,
      phases: [AdvancedWorkflowPhase(title: "Review", agents: [agent], detail: "SECRET-DETAIL")],
      unphasedAgents: [],
      defaultModel: nil,
      durationMs: nil,
      scriptPath: nil,
      startTime: nil,
      summary: "SECRET-SUMMARY",
      taskId: nil,
      totalTokens: 12,
      totalToolCalls: 3,
      workflowName: nil
    )
    let outcome = AdvancedOperationOutcomeProjection.outcome(
      .workflowGetRun(AdvancedWorkflowGetRunResult(run: run, mtimeMs: 1_770_000_000_001)),
      procedure: .workflowGetRun
    )
    let rendered = outcome.rows.map { "\($0.label)|\($0.value)" }.joined(separator: "\n")
    for secret in [
      "SECRET-CHAT-BODY", "SECRET-TOOL", "SECRET-PROMPT", "SECRET-RESULT", "SECRET-SUMMARY",
      "SECRET-DETAIL",
    ] {
      XCTAssertFalse(rendered.contains(secret), secret)
    }
    XCTAssertTrue(rendered.contains("run-1"))
  }

  func testFileContentIsPreviewedAndBinaryPayloadsAreNeverRendered() {
    let long = String(repeating: "é", count: 5_000)
    let ready = AdvancedOperationOutcomeProjection.outcome(
      .readExternalFile(
        AdvancedExternalFileResult(
          path: "/tmp/external.txt",
          status: .ready,
          modifiedAtMs: 1_770_000_000_001,
          content: long,
          contentBase64: nil,
          hasBom: false,
          lineEnding: .lf
        )
      ),
      procedure: .readExternalFile
    )
    let content = ready.rows.first { $0.id == AdvancedOutcomeLabel.content.rawValue }
    XCTAssertEqual(
      content?.value.count,
      AdvancedOperationRedaction.maximumPreviewLength
        + AdvancedOperationsStrings.elision.count
    )

    let binary = AdvancedOperationOutcomeProjection.outcome(
      .readExternalFile(
        AdvancedExternalFileResult(
          path: "/tmp/external.bin",
          status: .binary,
          modifiedAtMs: 1_770_000_000_001,
          content: nil,
          contentBase64: "U0VDUkVULUJZVEVT",
          hasBom: nil,
          lineEnding: nil
        )
      ),
      procedure: .readExternalFile
    )
    let rendered = binary.rows.map(\.value).joined()
    XCTAssertFalse(rendered.contains("U0VDUkVULUJZVEVT"))
  }

  func testUnreadableStatusesNeverProjectContent() {
    for status in [
      AdvancedFileReadStatus.missing, .binary, .tooLarge, .unsupported,
    ] {
      let outcome = AdvancedOperationOutcomeProjection.outcome(
        .readAbsoluteFile(
          AdvancedAbsoluteFileResult(status: status, content: "SECRET", modifiedAtMs: nil)
        ),
        procedure: .readAbsoluteFile
      )
      XCTAssertFalse(outcome.rows.contains { $0.value.contains("SECRET") }, status.rawValue)
    }
  }

  func testLongPathsAreRedactedForEverySeparatorStyle() {
    let posix = "/" + Array(repeating: "segment", count: 40).joined(separator: "/") + "/file.txt"
    let redactedPosix = AdvancedOperationRedaction.path(posix)
    XCTAssertTrue(redactedPosix.hasPrefix(AdvancedOperationsStrings.elision))
    XCTAssertTrue(redactedPosix.hasSuffix("/file.txt"))
    XCTAssertLessThan(redactedPosix.count, posix.count)

    let windows =
      #"C:\"# + Array(repeating: "folder", count: 40).joined(separator: #"\"#)
      + #"\file.txt"#
    let redactedWindows = AdvancedOperationRedaction.path(windows)
    XCTAssertTrue(redactedWindows.hasSuffix(#"\file.txt"#))
    XCTAssertFalse(redactedWindows.contains("C:"))

    XCTAssertEqual(AdvancedOperationRedaction.path("/short/path"), "/short/path")
  }

  func testLocationDescriptionsKeepKindAndDistroWithoutFullPaths() {
    let wsl = AdvancedOperationRedaction.location(
      .wsl(
        distro: "Ubuntu-24.04",
        linuxPath: "/" + Array(repeating: "deep", count: 40).joined(separator: "/"),
        uncPath: #"\\wsl.localhost\Ubuntu-24.04\deep"#,
        remoteServerId: nil
      )
    )
    XCTAssertFalse(wsl.contains("wsl.localhost"))
    let redacted = AdvancedOperationRedaction.path(
      "/" + Array(repeating: "deep", count: 40).joined(separator: "/")
    )
    XCTAssertTrue(redacted.hasPrefix(AdvancedOperationsStrings.elision))
    XCTAssertLessThanOrEqual(
      redacted.count,
      AdvancedOperationRedaction.maximumPathLength + AdvancedOperationsStrings.elision.count + 1
    )
  }

  func testTimestampsUseAFixedUTCFormat() {
    XCTAssertEqual(AdvancedOperationRedaction.timestamp(0), "1970-01-01T00:00:00Z")
    XCTAssertEqual(
      AdvancedOperationRedaction.timestamp(1_770_000_000_000),
      "2026-02-02T02:40:00Z"
    )
    XCTAssertEqual(
      AdvancedOperationRedaction.timestamp(-1),
      AdvancedOperationsStrings.unknown
    )
  }

  func testAcknowledgementOutcomeStillCarriesAnAccessibleLabel() {
    let outcome = AdvancedOperationOutcomeProjection.outcome(.omitted, procedure: .stageThreadInput)
    XCTAssertTrue(outcome.isAcknowledgement)
    XCTAssertTrue(outcome.rows.isEmpty)
    XCTAssertFalse(outcome.accessibilityLabel.isEmpty)
    XCTAssertFalse(outcome.title.isEmpty)
  }
}
