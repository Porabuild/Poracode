import Foundation

enum SideChatContextFailure: Error, Equatable {
  case unavailable, hostUpdateRequired, staleHost, unboundedHistory, invalidCursor, pageLimit, timedOut
}

struct SideChatContextSelection: Sendable {
  let access: RichChatSessionAccess
  let environment: @MainActor @Sendable () async throws -> RemoteEnvironmentDescriptor
  let page: @MainActor @Sendable (String, Int?) async throws -> RemoteBoundedReadOutcome<RemoteBoundedHistoryItemsPage, RemoteRuntimeItemsPage>
  var membership: (@MainActor @Sendable ([String]) async throws -> Set<String>)? = nil
}

protocol SideChatContextCapturing: Sendable {
  func capture(parent: RichChatThreadTarget, maximumUTF16Count: Int) async throws -> TurnClientContext?
  func existingParents(_ ids: [String], lease: RichChatHostLease) async throws -> Set<String>?
}

extension SideChatContextCapturing {
  func existingParents(_ ids: [String], lease: RichChatHostLease) async throws -> Set<String>? { nil }
}

/// A separate bounded walk: no parent presenter, paging cursors or item
/// interests are registered or changed while capturing this private context.
actor SelectedSideChatContextGateway: SideChatContextCapturing {
  typealias Selection = @MainActor @Sendable () -> SideChatContextSelection?
  private let selection: Selection
  private let timeout: Duration
  init(timeout: Duration = .seconds(15), selection: @escaping Selection) {
    self.selection = selection
    self.timeout = timeout
  }

  func capture(parent: RichChatThreadTarget, maximumUTF16Count: Int = TurnClientContext.maximumSnapshotUTF16Count) async throws -> TurnClientContext? {
    try await withThrowingTaskGroup(of: TurnClientContext?.self) { group in
      group.addTask { try await self.read(parent: parent, maximumUTF16Count: maximumUTF16Count) }
      group.addTask {
        try await Task.sleep(for: self.timeout)
        throw SideChatContextFailure.timedOut
      }
      defer { group.cancelAll() }
      return try await group.next() ?? nil
    }
  }

  func existingParents(_ ids: [String], lease: RichChatHostLease) async throws -> Set<String>? {
    guard ids.count <= 200 else { throw SideChatContextFailure.pageLimit }
    guard let first = ids.first else { return [] }
    let target = RichChatThreadTarget(lease: lease, threadID: first)
    let owner = try await current(target)
    guard let membership = owner.membership else { return nil }
    let existing = try await membership(ids)
    _ = try await current(target)
    return existing
  }

  private func current(_ target: RichChatThreadTarget) async throws -> SideChatContextSelection {
    try Task.checkCancellation()
    guard let current = await selection() else { throw SideChatContextFailure.unavailable }
    guard current.access.lease == target.lease else { throw SideChatContextFailure.staleHost }
    guard current.access.controllerGate(.sessionRead) == nil else { throw SideChatContextFailure.unavailable }
    return current
  }

  private func read(parent: RichChatThreadTarget, maximumUTF16Count: Int) async throws -> TurnClientContext? {
    let owner = try await current(parent)
    let descriptor = try await owner.environment()
    _ = try await current(parent)
    guard descriptor.advertisesConversationSnapshots else { throw SideChatContextFailure.hostUpdateRequired }
    var capture = SideChatContextAccumulator(maximumUTF16Count: maximumUTF16Count)
    var before: Int?
    for _ in 0..<100 {
      let result = try await owner.page(parent.threadID, before)
      _ = try await current(parent)
      guard case .bounded(let bounded) = result else { throw SideChatContextFailure.unboundedHistory }
      for item in bounded.page.items.reversed() { capture.prepend(item) }
      guard let next = bounded.page.nextCursor else { return capture.context }
      if let before, next >= before { throw SideChatContextFailure.invalidCursor }
      before = next
    }
    throw SideChatContextFailure.pageLimit
  }
}

/// Mirrors the PWA's first-question + recent-suffix budget and omission marker.
/// Pages and row sizes are bounded independently of the painted transcript.
struct SideChatContextAccumulator {
  private static let header = "Current snapshot of the parent conversation, oldest turn first. This replaces earlier parent snapshots and is background for the current side question. Bounded tool output is included; omissions are marked.\n\n"
  private static let gap = "[earlier turns omitted]"
  private let limit: Int
  private let budget: Int
  private var used = 0
  private var omitted = false
  private var firstUser: (id: String, text: String)?
  private var recent: [(id: String, text: String)] = []

  init(maximumUTF16Count: Int) {
    limit = max(0, min(maximumUTF16Count, TurnClientContext.maximumSnapshotUTF16Count))
    budget = max(0, limit - Self.header.utf16.count - 6_000 - Self.gap.utf16.count - 6)
  }

  mutating func prepend(_ item: PersistedRuntimeItem) {
    if omitted && item.type != RichItemType.userMessage { return }
    guard let text = SideChatContextRow.text(item), !text.isEmpty else { return }
    if item.type == RichItemType.userMessage { firstUser = (item.id, text) }
    let size = text.utf16.count + 2
    if !omitted && used + size <= budget {
      recent.append((item.id, text))
      used += size
    } else { omitted = true }
  }

  var context: TurnClientContext? {
    let rows = [firstUser?.text, omitted ? Self.gap : nil]
      .compactMap { $0 } + recent.reversed().filter { $0.id != firstUser?.id }.map(\.text)
    guard !rows.isEmpty, limit > Self.header.utf16.count else { return nil }
    let body = Self.header + rows.joined(separator: "\n\n")
    let marker = "\n\n\(Self.gap)"
    let bounded = body.utf16.count > limit
      ? SideChatContextRow.prefix(body, limit: max(0, limit - marker.utf16.count)) + marker
      : body
    return TurnClientContext(conversationSnapshot: .init(text: bounded))
  }
}

enum SideChatContextRow {
  static func prefix(_ text: String, limit: Int) -> String {
    String(decoding: text.utf16.prefix(max(0, limit)), as: UTF16.self)
  }

  static func text(_ item: PersistedRuntimeItem) -> String? {
    guard let converted = try? RichChatRemoteModelBridge.items([item]).first else { return nil }
    let value: String?
    switch item.type {
    case "command_execution":
      let payload = converted.payload?.objectValue
      let command = payload?["command"]?.stringValue ?? ""
      let state = payload?["status"]?.stringValue ?? item.state
      let exit = payload?["exitCode"]?.exactInt64Value.map { ", exit \($0)" } ?? ""
      let output = item.streams["command_output"] ?? payload?["result"].map(resultText) ?? ""
      let error = payload?["errorMessage"]?.stringValue ?? ""
      value = "Command: \(prefix(command, limit: 500))\nStatus: \(state)\(exit)\n\(error)\n\(output)"
    case "tool_call", "mcp_tool_call", "dynamic_tool_call":
      let payload = converted.payload?.objectValue
      let name = payload?["name"]?.stringValue ?? payload?["title"]?.stringValue ?? item.type
      let state = payload?["status"]?.stringValue ?? item.state
      let arguments = payload?["args"].flatMap(jsonText) ?? ""
      let output = payload?["result"].map(resultText) ?? ""
      value = "Tool: \(prefix(name, limit: 500))\nStatus: \(state)\n\(prefix(arguments, limit: 500))\n\(output)"
    case "question_answer": value = RichChatPresentation.text(for: converted)
    default: value = ThreadProviderHandoffPresentation.contextRow(converted)
    }
    guard let value, !value.isEmpty else { return nil }
    let plain = value.replacingOccurrences(of: "\u{001B}\\[[0-?]*[ -/]*[@-~]", with: "", options: .regularExpression)
    guard plain.utf16.count > 6_000 else { return plain }
    if item.type == RichItemType.userMessage {
      let marker = "\n[message truncated]"
      return prefix(plain, limit: 6_000 - marker.utf16.count) + marker
    }
    let marker = "[output truncated]\n"
    return marker + String(decoding: plain.utf16.suffix(6_000 - marker.utf16.count), as: UTF16.self)
  }

  private static func jsonText(_ value: RichJSON) -> String? {
    if let text = value.stringValue { return text }
    return (try? JSONDecoding.encoder.encode(value)).flatMap { String(data: $0, encoding: .utf8) }
  }

  private static func resultText(_ value: RichJSON) -> String {
    if let text = value.stringValue { return text }
    if let object = value.objectValue {
      for key in ["detailedContent", "text", "content"] {
        if let text = object[key]?.stringValue, !text.isEmpty { return text }
      }
      for key in ["content", "contents"] {
        if let blocks = object[key]?.arrayValue {
          let text = blocks.compactMap { $0.objectValue?["text"]?.stringValue }
            .filter { !$0.isEmpty }.joined(separator: "\n\n")
          if !text.isEmpty { return text }
        }
      }
    }
    return jsonText(value) ?? ""
  }
}
