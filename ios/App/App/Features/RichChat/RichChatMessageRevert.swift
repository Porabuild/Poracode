import Foundation
import UniformTypeIdentifiers

struct RichChatRevertedPrompt: Sendable {
  let id = UUID()
  let blocks: [RichContentBlock]

  init?(item: RichRuntimeItem) {
    guard item.type == RichItemType.userMessage else { return nil }
    let payload = item.payload?.objectValue
    let content = payload?["content"]?.arrayValue?.compactMap {
      try? RichContentDecoder.decodeBlock($0)
    } ?? []
    if !content.isEmpty {
      blocks = content
    } else if let prompt = payload?["prompt"]?.stringValue, !prompt.isEmpty {
      // History captured before canonical content blocks may only have a prompt.
      blocks = [.text(text: prompt)]
    } else {
      return nil
    }
  }

  func draft(availableSkills: [RichChatSelectedSkill]) -> RichChatComposerDraft {
    var draft = RichChatComposerDraft(text: "", attachments: [])
    var ordered: [RichPromptSegment] = []
    for block in blocks {
      switch block {
      case .text(let text):
        draft.text += text
        ordered.append(.text(content: text))
      case .skill(let name, let invocation, let pluginID, let pluginName):
        if let found = availableSkills.first(where: { $0.name == name && $0.pluginID == pluginID }) {
          let skill = RichChatSelectedSkill(name: found.name, path: found.path, invocation: found.invocation,
            provider: found.provider, scope: found.scope, pluginID: found.pluginID, pluginName: pluginName ?? found.pluginName)
          if !draft.skills.contains(where: { $0.id == skill.id }) { draft.skills.append(skill) }
          ordered.append(skill.segment)
        } else {
          // A same-name skill from another plugin is never substituted.
          let literal = "`\(invocation)`"
          draft.text += literal
          ordered.append(.text(content: literal))
        }
      case .mcp(let name):
        let mcp = RichChatSelectedMCP(id: name, name: name)
        if !draft.mcps.contains(where: { $0.id == mcp.id }) { draft.mcps.append(mcp) }
        ordered.append(mcp.segment)
      case .thread(let id, let title):
        let segment = RichPromptSegment.thread(threadID: id, title: title)
        draft.segments.append(segment)
        ordered.append(segment)
      case .diffComment(let path, let line, let side, let staged, let body):
        let segment = RichPromptSegment.diffComment(path: path, lineNumber: line, side: side, staged: staged, body: body)
        draft.segments.append(segment)
        ordered.append(segment)
      case .file(let path, let name, let mime, let source):
        Self.appendFile(path: path, name: name, mimeType: mime, asAttachment: source == .attachment,
          draft: &draft, ordered: &ordered)
      case .image(let mime, _, let path, let name, let source):
        if let path {
          Self.appendFile(path: path, name: name, mimeType: mime, asAttachment: source != .mention,
            draft: &draft, ordered: &ordered)
        }
      }
    }
    draft.restoredOrder = RichChatRestoredPromptOrder(
      text: draft.text, context: draft.segments + draft.skills.map(\.segment) + draft.mcps.map(\.segment),
      attachments: draft.attachments.map(\.segment), segments: ordered
    )
    return draft
  }

  private static func appendFile(
    path: String, name: String?, mimeType: String?, asAttachment: Bool,
    draft: inout RichChatComposerDraft, ordered: inout [RichPromptSegment]
  ) {
    guard RichChatFilePolicy.isSafeFileSource(path) else { return }
    if asAttachment {
      let filename = name ?? RichChatFilePolicy.basename(path)
      let mime = mimeType ?? UTType(filenameExtension: (filename as NSString).pathExtension)?.preferredMIMEType
        ?? "application/octet-stream"
      let attachment = RichChatUploadedAttachment(name: filename, mimeType: mime, remotePath: path)
      draft.attachments.append(attachment)
      ordered.append(attachment.segment)
    } else {
      let segment = RichPromptSegment.file(path: path)
      draft.segments.append(segment)
      ordered.append(segment)
    }
  }
}

/// The native editor presents context as chips. Use the original sequence for
/// a direct resend, and the normal composer order after content edits.
struct RichChatRestoredPromptOrder: Equatable {
  let text: String
  let context: [RichPromptSegment]
  let attachments: [RichPromptSegment]
  let segments: [RichPromptSegment]

  func unchangedSegments(
    text: String, context: [RichPromptSegment], attachments: [RichPromptSegment]
  ) -> [RichPromptSegment]? {
    self.text == text && self.context == context && self.attachments == attachments ? segments : nil
  }
}

struct RichChatMessageRevertPlan: Equatable, Sendable, Identifiable {
  let userItemID: String
  let checkpointItemID: String
  let rollbackTurnCount: Int
  let hasFileCheckpoint: Bool

  var id: String { userItemID }
}

enum RichChatMessageRevertPlanner {
  static func plan(
    userItemID: String,
    items: [RichRuntimeItem],
    completedTurns: [RichCompletedTurn],
    checkpoints: RichChatCheckpointCollection
  ) -> RichChatMessageRevertPlan? {
    guard let userIndex = items.firstIndex(where: { $0.id == userItemID }),
      items[userIndex].type == RichItemType.userMessage, items[userIndex].parentItemID == nil,
      userIndex > items.startIndex
    else { return nil }

    let positions = Dictionary(
      items.enumerated().map { ($0.element.id, $0.offset) }, uniquingKeysWith: min)
    let priorUserIndex =
      items[..<userIndex].lastIndex {
        $0.type == RichItemType.userMessage && $0.parentItemID == nil
      } ?? -1
    let priorTurn = (priorUserIndex + 1)..<userIndex
    // Prefer the host's raw completed-turn anchor. A tool that ends the turn
    // can own the file checkpoint even when the UI groups it with a reply.
    let recordedAnchor = completedTurns.compactMap { turn in
      turn.anchorItemID.flatMap { positions[$0] }
    }.filter { priorTurn.contains($0) && items[$0].parentItemID == nil }.max()
    guard
      let checkpointIndex = recordedAnchor
        ?? items[priorTurn].lastIndex(where: {
          $0.parentItemID == nil && $0.type != RichItemType.userMessage
            && RichTimeline.isVisible($0)
        })
    else { return nil }

    let checkpointItemID = items[checkpointIndex].id
    let rollbackTurnCount: Int
    if completedTurns.isEmpty {
      rollbackTurnCount = items[items.index(after: checkpointIndex)...].count {
        $0.type == RichItemType.assistantMessage
      }
    } else {
      rollbackTurnCount = completedTurns.count { turn in
        guard let anchor = turn.anchorItemID, let position = positions[anchor] else { return false }
        return position > checkpointIndex
      }
    }

    let checkpointIDs = Set(
      (checkpoints.checkpoints + checkpoints.turns).map(\.checkpointItemID)
    )
    return RichChatMessageRevertPlan(
      userItemID: userItemID,
      checkpointItemID: checkpointItemID,
      rollbackTurnCount: rollbackTurnCount,
      hasFileCheckpoint: checkpointIDs.contains(checkpointItemID)
    )
  }
}

enum RichChatMessageCopyEligibility {
  static func isEligible(
    item: RichRuntimeItem,
    text: String,
    items: [RichRuntimeItem],
    isTurnActive: Bool
  ) -> Bool {
    guard !text.isEmpty else { return false }
    if item.type == RichItemType.userMessage { return true }
    guard item.type == RichItemType.assistantMessage,
      item.state == .completed,
      item.parentItemID == nil,
      let index = items.firstIndex(where: { $0.id == item.id })
    else { return false }

    for next in items[items.index(after: index)...] where next.parentItemID == nil {
      return next.type == RichItemType.userMessage
    }
    return !isTurnActive
  }
}

struct RichChatCheckpointRevertInput: Equatable, Sendable {
  let checkpointItemID: String
  var expectedTarget: RichChatThreadTarget? = nil
}

enum RichChatCheckpointRevertOutcome: String, Sendable {
  case completed
  case completedLocalOnly = "completed_local_only"
  case noop
  case ambiguous
  case failed
}

/// Unanswered submissions retain a bounded action ID across reconnects and
/// thread navigation. A definitive host outcome settles that specific key.
@MainActor
final class RichChatCheckpointRevertAttempts {
  private struct Checkpoint: Hashable {
    let thread: CompositeRemoteID
    let itemID: String
  }

  private var pending: [Checkpoint: String] = [:]

  func operationKey(target: RichChatThreadTarget, itemID: String) -> String {
    let checkpoint = checkpoint(target: target, itemID: itemID)
    let key = pending[checkpoint] ?? "ckpt-revert.\(UUID().uuidString)"
    pending[checkpoint] = key
    return key
  }

  func settle(target: RichChatThreadTarget, itemID: String, operationKey: String) {
    let checkpoint = checkpoint(target: target, itemID: itemID)
    if pending[checkpoint] == operationKey { pending.removeValue(forKey: checkpoint) }
  }

  func clear(connectionID: ClientConnectionID) {
    pending = pending.filter { $0.key.thread.decode()?.connectionId != connectionID }
  }

  func clearAll() { pending.removeAll() }

  private func checkpoint(target: RichChatThreadTarget, itemID: String) -> Checkpoint {
    Checkpoint(
      thread: CompositeRemoteID(connectionId: target.lease.connectionID, remoteId: target.threadID),
      itemID: itemID)
  }
}
