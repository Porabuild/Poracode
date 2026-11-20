import Foundation

/// Existing remote-v3 per-turn advisory metadata. The host delivers this to
/// the provider privately; it is never part of the painted user question.
struct TurnClientContext: Codable, Hashable, Sendable, CustomStringConvertible, CustomDebugStringConvertible {
  struct ConversationSnapshot: Codable, Hashable, Sendable {
    var text: String
  }

  var conversationSnapshot: ConversationSnapshot?

  static let maximumSnapshotUTF16Count = 50_000
  var richChatWireValue: RichJSON {
    .object(conversationSnapshot.map { ["conversationSnapshot": .object(["text": .string($0.text)])] } ?? [:])
  }
  var description: String { "TurnClientContext(conversationSnapshot: <private>)" }
  var debugDescription: String { description }
}
