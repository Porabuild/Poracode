import Foundation
import Observation

struct RichChatComposerDraftKey: Hashable, Sendable {
  let connectionID: ClientConnectionID
  let threadID: String
}

struct RichChatComposerDraft: Equatable {
  var text: String
  var attachments: [RichChatUploadedAttachment]
  var skills: [RichChatSelectedSkill] = []
  var mcps: [RichChatSelectedMCP] = []
  var segments: [RichPromptSegment] = []
  var configuration: ThreadConfig? = nil

  var isEmpty: Bool {
    text.isEmpty && attachments.isEmpty && skills.isEmpty && mcps.isEmpty && segments.isEmpty
  }
}

/// In-memory parking for launched-thread composer content, matching the PWA's
/// navigation-scoped draft behavior. A host identity is part of every key so
/// provider thread IDs can never expose content from another paired desktop.
@MainActor
@Observable
final class RichChatComposerDraftStore {
  private var drafts: [RichChatComposerDraftKey: RichChatComposerDraft] = [:]
  private var queuedSegments: [RichChatComposerDraftKey: [RichPromptSegment]] = [:]
  private(set) var revision: UInt64 = 0

  func save(_ draft: RichChatComposerDraft, for key: RichChatComposerDraftKey) {
    if draft.isEmpty {
      drafts.removeValue(forKey: key)
    } else {
      drafts[key] = draft
    }
  }

  /// Restored drafts are consumed while their composer is mounted. The owning
  /// thread view parks the latest content again when it leaves the hierarchy.
  func take(for key: RichChatComposerDraftKey) -> RichChatComposerDraft? {
    var draft =
      drafts.removeValue(forKey: key)
      ?? RichChatComposerDraft(text: "", attachments: [])
    draft.segments.append(contentsOf: takeQueuedSegments(for: key))
    return draft.isEmpty ? nil : draft
  }

  func clear(_ key: RichChatComposerDraftKey) {
    drafts.removeValue(forKey: key)
    queuedSegments.removeValue(forKey: key)
  }

  func clear(connectionID: ClientConnectionID) {
    drafts = drafts.filter { $0.key.connectionID != connectionID }
    queuedSegments = queuedSegments.filter { $0.key.connectionID != connectionID }
  }

  func clearAll() {
    drafts.removeAll()
    queuedSegments.removeAll()
  }

  func enqueue(_ segment: RichPromptSegment, for key: RichChatComposerDraftKey) {
    queuedSegments[key, default: []].append(segment)
    revision &+= 1
  }

  func hasDraft(for key: RichChatComposerDraftKey) -> Bool {
    drafts[key]?.isEmpty == false || queuedSegments[key]?.isEmpty == false
  }

  func takeQueuedSegments(for key: RichChatComposerDraftKey) -> [RichPromptSegment] {
    queuedSegments.removeValue(forKey: key) ?? []
  }
}
