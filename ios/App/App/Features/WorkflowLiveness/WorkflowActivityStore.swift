import Foundation
import Observation

struct WorkflowThreadIdentity: Hashable, Sendable {
  let connectionID: ClientConnectionID
  let threadID: String
}

struct WorkflowActivityOwner: Equatable, Sendable {
  let thread: WorkflowThreadIdentity
  let authorityID: UUID
  let location: ProjectLocation
}

struct WorkflowActivityKey: Hashable, Sendable {
  let thread: WorkflowThreadIdentity
  let itemID: String
}

struct WorkflowActivityRecord: Equatable, Sendable {
  let key: WorkflowActivityKey
  let owner: WorkflowActivityOwner
  let reference: WorkflowRunReference
  let registeredAt: Int64
  let ordinal: UInt64
  var summary: String?
  var run: AdvancedWorkflowRun?
  var manifestSeen = false
}

/// Session-owned presentation state. Polls continue after the chat view unmounts
/// and are independent per run, so an unavailable host cannot stall another.
@MainActor @Observable final class WorkflowActivityStore {
  typealias Read = @MainActor (WorkflowActivityOwner, WorkflowRunReference) async throws -> AdvancedWorkflowGetRunResult
  typealias IsCurrent = @MainActor (WorkflowActivityOwner) -> Bool

  private(set) var activeThreads = Set<WorkflowThreadIdentity>()
  private(set) var records: [WorkflowActivityKey: WorkflowActivityRecord] = [:]
  @ObservationIgnored private var tasks: [WorkflowActivityKey: Task<Void, Never>] = [:]
  @ObservationIgnored private var tokens: [WorkflowActivityKey: UUID] = [:]
  @ObservationIgnored private var terminalReferences: [WorkflowActivityKey: RetiredReference] = [:]
  @ObservationIgnored private var ordinal: UInt64 = 0
  @ObservationIgnored private var paused = false
  private let read: Read
  private let isCurrent: IsCurrent
  private let now: @MainActor () -> Int64
  private let automaticallyPolls: Bool

  private struct RetiredReference {
    let owner: WorkflowActivityOwner
    let reference: WorkflowRunReference
  }

  init(automaticallyPolls: Bool = true,
    now: @escaping @MainActor () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1_000) },
    isCurrent: @escaping IsCurrent,
    read: @escaping Read) {
    self.automaticallyPolls = automaticallyPolls
    self.now = now; self.isCurrent = isCurrent; self.read = read
  }

  deinit { for task in tasks.values { task.cancel() } }

  func register(owner: WorkflowActivityOwner, item: RichRuntimeItem, recoveredMetadata: RichJSON? = nil) {
    guard isCurrent(owner), RichItemType.toolLike.contains(item.type) else { return }
    let canonical = item.payload?.objectValue?["workflow"]
    guard let metadata = canonical.flatMap({ WorkflowRunReference(metadata: $0) != nil ? $0 : nil }) ?? recoveredMetadata else { return }
    register(owner: owner, itemID: item.id, metadata: metadata)
  }

  func register(owner: WorkflowActivityOwner, itemID: String, metadata: RichJSON) {
    guard isCurrent(owner), let reference = WorkflowRunReference(metadata: metadata) else { return }
    let key = WorkflowActivityKey(thread: owner.thread, itemID: itemID)
    if let retired = terminalReferences[key], retired.owner == owner, retired.reference == reference { return }
    terminalReferences.removeValue(forKey: key)
    let summary = metadata.objectValue?["summary"]?.stringValue
      ?? metadata.objectValue?["name"]?.stringValue
    if var existing = records[key], existing.reference == reference, existing.owner == owner {
      if existing.summary != summary { existing.summary = summary; records[key] = existing }
      start(key)
      return
    }
    tasks.removeValue(forKey: key)?.cancel()
    ordinal &+= 1
    tokens[key] = UUID()
    records[key] = .init(key: key, owner: owner, reference: reference,
      registeredAt: now(), ordinal: ordinal, summary: summary)
    publishActivity()
    start(key)
  }

  func isLive(connectionID: ClientConnectionID?, threadID: String) -> Bool {
    guard let connectionID else { return false }
    return activeThreads.contains(.init(connectionID: connectionID, threadID: threadID))
  }

  func isLive(for target: RichChatThreadTarget?) -> Bool {
    guard let target else { return false }
    return isLive(connectionID: target.lease.connectionID, threadID: target.threadID)
  }

  func activeRecords(for thread: WorkflowThreadIdentity) -> [WorkflowActivityRecord] {
    records.values.filter { $0.key.thread == thread }.sorted { $0.ordinal < $1.ordinal }
  }

  func retainConnections(_ connections: Set<ClientConnectionID>) {
    for key in Array(records.keys) where !connections.contains(key.thread.connectionID) { remove(key) }
    terminalReferences = terminalReferences.filter { connections.contains($0.key.thread.connectionID) }
  }

  func pause() {
    paused = true
    for task in tasks.values { task.cancel() }
    tasks.removeAll()
    for key in records.keys { tokens[key] = UUID() }
  }

  func resume() {
    paused = false
    for key in records.keys { start(key) }
  }

  /// One bounded read. Internal visibility also permits deterministic tests of
  /// cancellation, stale responses, clock boundaries and ownership changes.
  @discardableResult
  func refresh(_ key: WorkflowActivityKey) async -> Bool {
    guard let token = tokens[key] else { return false }
    return await refresh(key, token: token)
  }

  private func refresh(_ key: WorkflowActivityKey, token: UUID) async -> Bool {
    guard !paused, !Task.isCancelled, tokens[key] == token, let record = records[key] else { return false }
    guard isCurrent(record.owner) else { remove(key); return false }
    do {
      let result = try await read(record.owner, record.reference)
      guard !paused, !Task.isCancelled, tokens[key] == token,
        var current = records[key], current.owner == record.owner else { return false }
      guard isCurrent(record.owner) else { remove(key); return false }
      if let run = result.run {
        guard run.runId == record.reference.runID else { return true }
        guard WorkflowLivenessPolicy.isLive(run, now: now()) else {
          if [.completed, .failed, .cancelled].contains(run.status) {
            terminalReferences[key] = .init(owner: record.owner, reference: record.reference)
          }
          remove(key); return false
        }
        current.manifestSeen = true
        current.run = run
        if !WorkflowLivenessPolicy.hasActivityTimestamp(run), WorkflowLivenessPolicy.expired(
          registeredAt: current.registeredAt, manifestSeen: true, now: now()) {
          remove(key); return false
        }
        if current != records[key] { records[key] = current }
        return true
      }
    } catch is CancellationError {
      if Task.isCancelled || paused || tokens[key] != token { return false }
      // A read can lose its transport lease during reconnect while its logical
      // owner remains valid. A later poll resolves that owner's new lease.
    }
    catch {
      // A transient read failure cannot claim the detached process finished.
      // Launch/progress expiry bounds that uncertainty without retrying a mutation.
    }
    guard !paused, !Task.isCancelled, tokens[key] == token else { return false }
    guard isCurrent(record.owner) else { remove(key); return false }
    if let current = records[key], WorkflowLivenessPolicy.expired(registeredAt: current.registeredAt,
      manifestSeen: current.manifestSeen, now: now()) { remove(key); return false }
    return true
  }

  private func start(_ key: WorkflowActivityKey) {
    guard automaticallyPolls, !paused, tasks[key] == nil, let token = tokens[key] else { return }
    tasks[key] = Task { @MainActor [weak self] in
      while await self?.refresh(key, token: token) == true {
        do { try await Task.sleep(for: WorkflowLivenessPolicy.pollInterval) }
        catch { break }
      }
      if self?.tokens[key] == token { self?.tasks[key] = nil }
    }
  }

  private func remove(_ key: WorkflowActivityKey) {
    tasks.removeValue(forKey: key)?.cancel()
    tokens.removeValue(forKey: key)
    records.removeValue(forKey: key)
    publishActivity()
  }

  private func publishActivity() {
    let next = Set(records.keys.map(\.thread))
    if next != activeThreads { activeThreads = next }
  }
}
