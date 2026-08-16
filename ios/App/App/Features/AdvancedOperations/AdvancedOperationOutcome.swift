import Foundation

struct AdvancedOutcomeRow: Identifiable, Equatable, Sendable {
  let id: String
  let label: String
  let value: String

  var accessibilityLabel: String { "\(label), \(value)" }
}

/// Everything the outcome surface is allowed to show for one completed call.
struct AdvancedOperationOutcome: Equatable, Sendable {
  let procedure: AdvancedOperationProcedure
  let rows: [AdvancedOutcomeRow]
  /// Set when the operation completed with nothing to project.
  let isAcknowledgement: Bool

  var title: String { AdvancedOperationsStrings.action(procedure) }

  var accessibilityLabel: String {
    AdvancedOperationsStrings.outcomeAccessibility(title, rows.count)
  }
}

enum AdvancedOperationOutcomeProjection {
  static func outcome(
    _ result: AdvancedOperationResult,
    procedure: AdvancedOperationProcedure
  ) -> AdvancedOperationOutcome {
    let rows = rows(result)
    return AdvancedOperationOutcome(
      procedure: procedure,
      rows: rows,
      isAcknowledgement: rows.isEmpty
    )
  }

  private static func rows(_ result: AdvancedOperationResult) -> [AdvancedOutcomeRow] {
    switch result {
    case .createFileCheckpoint(let value):
      checkpointRows(
        item: value.checkpoint.checkpointItemId,
        ref: value.checkpoint.ref,
        commit: value.checkpoint.commit,
        capturedAt: value.checkpoint.capturedAt
      )
    case .finalizeFileCheckpoint(let value):
      finalizedRows(value.checkpoint)
    case .subagentSubscribe(let value):
      [row(.events, AdvancedOperationRedaction.count(value.history.count))]
    case .workflowGetRun(let value):
      workflowRows(value)
    case .workflowAgentChat(let value):
      [row(.events, AdvancedOperationRedaction.count(value.events.count))]
    case .readAbsoluteFile(let value):
      absoluteFileRows(value)
    case .readExternalFile(let value):
      externalFileRows(value)
    case .writeExternalFile(let value):
      [row(.modifiedAt, AdvancedOperationRedaction.timestamp(value.modifiedAtMs))]
    case .generatedCommitMessage(let value):
      [row(.message, AdvancedOperationRedaction.preview(value.message))]
    case .generatedTitle(let value):
      [row(.title, AdvancedOperationRedaction.preview(value.title))]
    case .generatedPrSummary(let value):
      [
        row(.title, AdvancedOperationRedaction.preview(value.title)),
        row(.summary, AdvancedOperationRedaction.preview(value.description)),
      ]
    case .omitted:
      []
    }
  }

  private static func checkpointRows(
    item: String,
    ref: String,
    commit: String,
    capturedAt: String
  ) -> [AdvancedOutcomeRow] {
    [
      row(.checkpoint, item),
      row(.reference, ref),
      row(.commit, AdvancedOperationRedaction.commit(commit)),
      row(.capturedAt, capturedAt),
    ]
  }

  private static func finalizedRows(
    _ value: AdvancedFinalizedFileCheckpoint
  ) -> [AdvancedOutcomeRow] {
    var rows = checkpointRows(
      item: value.checkpointItemId,
      ref: value.ref,
      commit: value.commit,
      capturedAt: value.capturedAt
    )
    rows.append(row(.baseReference, value.baseRef))
    rows.append(row(.changedFiles, AdvancedOperationRedaction.count(value.changedFiles.count)))
    for change in value.changedFiles.prefix(AdvancedOperationRedaction.maximumListedPaths) {
      rows.append(
        AdvancedOutcomeRow(
          id: "change.\(rows.count)",
          label: AdvancedOperationsStrings.changeStatus(change.status),
          value: AdvancedOperationRedaction.path(change.path)
        )
      )
    }
    return rows
  }

  private static func workflowRows(
    _ value: AdvancedWorkflowGetRunResult
  ) -> [AdvancedOutcomeRow] {
    guard let run = value.run else { return [row(.run, AdvancedOperationsStrings.noRun)] }
    var rows = [
      row(.run, run.runId),
      row(.status, AdvancedOperationsStrings.runStatus(run.status)),
      row(.agents, AdvancedOperationRedaction.count(run.agentCount)),
      row(.phases, AdvancedOperationRedaction.count(run.phases.count)),
      row(.tokens, AdvancedOperationRedaction.count(run.totalTokens)),
      row(.toolCalls, AdvancedOperationRedaction.count(run.totalToolCalls)),
    ]
    if let mtime = value.mtimeMs {
      rows.append(row(.modifiedAt, AdvancedOperationRedaction.timestamp(mtime)))
    }
    // Phase titles are workflow structure; agent prompt and result previews are
    // host content and stay out of the projection.
    for phase in run.phases.prefix(AdvancedOperationRedaction.maximumListedPaths) {
      rows.append(
        AdvancedOutcomeRow(
          id: "phase.\(rows.count)",
          label: AdvancedOperationRedaction.preview(phase.title),
          value: AdvancedOperationRedaction.count(phase.agents.count)
        )
      )
    }
    return rows
  }

  private static func absoluteFileRows(
    _ value: AdvancedAbsoluteFileResult
  ) -> [AdvancedOutcomeRow] {
    var rows = [row(.status, AdvancedOperationsStrings.readStatus(value.status))]
    if let modified = value.modifiedAtMs {
      rows.append(row(.modifiedAt, AdvancedOperationRedaction.timestamp(modified)))
    }
    if value.status == .ready, let content = value.content {
      rows.append(row(.content, AdvancedOperationRedaction.preview(content)))
    }
    return rows
  }

  private static func externalFileRows(
    _ value: AdvancedExternalFileResult
  ) -> [AdvancedOutcomeRow] {
    var rows = [
      row(.path, AdvancedOperationRedaction.path(value.path)),
      row(.status, AdvancedOperationsStrings.readStatus(value.status)),
      row(.modifiedAt, AdvancedOperationRedaction.timestamp(value.modifiedAtMs)),
    ]
    if let lineEnding = value.lineEnding {
      rows.append(row(.lineEnding, AdvancedOperationsStrings.lineEnding(lineEnding)))
    }
    if let hasBom = value.hasBom {
      rows.append(row(.byteOrderMark, AdvancedOperationsStrings.boolean(hasBom)))
    }
    if value.status == .ready, let content = value.content {
      rows.append(row(.content, AdvancedOperationRedaction.preview(content)))
    } else if value.contentBase64 != nil {
      // Encoded payloads are never rendered, only acknowledged.
      rows.append(row(.content, AdvancedOperationsStrings.binaryContent))
    }
    return rows
  }

  private static func row(_ label: AdvancedOutcomeLabel, _ value: String) -> AdvancedOutcomeRow {
    AdvancedOutcomeRow(
      id: label.rawValue,
      label: AdvancedOperationsStrings.outcomeLabel(label),
      value: value
    )
  }
}

enum AdvancedOutcomeLabel: String, CaseIterable, Sendable {
  case checkpoint
  case reference
  case baseReference
  case commit
  case capturedAt
  case changedFiles
  case events
  case run
  case status
  case agents
  case phases
  case tokens
  case toolCalls
  case modifiedAt
  case path
  case content
  case lineEnding
  case byteOrderMark
  case message
  case title
  case summary
}
